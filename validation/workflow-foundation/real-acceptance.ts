/** Private model-path harness; this is NOT database-backed workflow E2E or a gold benchmark. */
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {loadWorkflowConfig,withWorkflowConfig,matchesWorkflowSchema,getWorkflowConfig} from '@class-reflect/config';
import {withTraceContext} from '@class-reflect/observability';
import {runTranscriptNormalizer,runTeachingEvidenceAgent} from '@class-reflect/agents';
import {buildEvaluationContext,type TranscriptSegment} from '@class-reflect/shared-types';
import {validateAndAdaptTranscriptNormalizerIndexedOutput} from '../../packages/agents/src/transcript-normalizer-agent/validator';
import {buildTranscriptNormalizerWindows} from '../../packages/agents/src/transcript-normalizer-agent/patch-input';
import {validateTeachingEvidenceCard} from '@class-reflect/guardrails';
export type FaultMode='normal'|'real-response-corrupt-array'|'429-once';
export type Counters={httpRequests:number;realRequests:number;injected429:number;initialSchemaFailures:number;finalSchemaFailures:number;normalizerBusinessErrors:string[];recovered:boolean};
export const excerpt:TranscriptSegment[]=[
 ['00:05','呃，今天，我们，呃要学习二进制。'],['00:10','二进制，它，它是只用0和1来表示的。'],['00:30','逢二就要进位，这个是核心规则。'],['00:40','呃，一加一，一加一在二进制里面等于十。'],['00:45','对，这里的十不是十进制的十。'],['01:15','呃，转换的方法，呃是除二取余。'],['01:20','取完余数之后，我们再倒过来排列。'],['01:35','五除以二，商是二，余数是一。'],['01:40','然后，二再除以二，得到商一，余零。'],['01:45','一除以二，商就是零，余数是一。'],['02:00','也就是一零一，这个就是五的二进制。'],['02:45','大家先记住转换的步骤就可以。']
].map(([time,text],i)=>{const [m,s]=time.split(':').map(Number);return {id:`excerpt-${i}`,startMs:(m*60+s)*1000,endMs:(m*60+s)*1000+4500,text,speakerLabel:'teacher',confidence:0.95};});
export function faultFetch(base:typeof fetch,mode:FaultMode,stats:Counters):typeof fetch{
 let corrupted=false,limited=false;const responded=new Set<string>();
 return async(url,init)=>{
  stats.httpRequests++;
  if(mode==='429-once'&&!limited){limited=true;stats.injected429++;return new Response('{}',{status:429,headers:{'retry-after':'0'}});}
  stats.realRequests++;let response=await base(url,init);
  if(mode==='real-response-corrupt-array'&&!corrupted&&response.ok&&String(init?.body).includes('teaching-evidence.llm')){
   const body:any=await response.clone().json();const output=JSON.parse(body.choices[0].message.content);
   if(!Array.isArray(output.evidenceCards)||!output.evidenceCards.length)throw new Error('真实响应未包含证据卡，无法进行数组故障注入');
   output.evidenceCards[0].transcriptSegmentIds=JSON.stringify(output.evidenceCards[0].transcriptSegmentIds);
   body.choices[0].message.content=JSON.stringify(output);corrupted=true;
   response=new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  }
  if(response.ok){const stage=String(init?.body).includes('transcript-agent')?'normalizer':'evidence';if(!responded.has(stage)){responded.add(stage);try{const body:any=await response.clone().json();const output=JSON.parse(body.choices[0].message.content);if(!matchesWorkflowSchema(output,getWorkflowConfig().schemas[stage]))stats.initialSchemaFailures++;else if(stage==='normalizer')stats.normalizerBusinessErrors.push(...validateAndAdaptTranscriptNormalizerIndexedOutput(output,buildTranscriptNormalizerWindows(excerpt)[0]).errors);}catch{stats.initialSchemaFailures++;}}}
  return response;
 };
}
export async function runAcceptance(mode:FaultMode='normal',options:{stage?:'both'|'evidence'}={}){
 const stage=options.stage||'both';
 const stats:Counters={httpRequests:0,realRequests:0,injected429:0,initialSchemaFailures:0,finalSchemaFailures:0,normalizerBusinessErrors:[],recovered:false};const started=Date.now();
 const traceId=randomUUID(),snapshot=loadWorkflowConfig(),originalFetch=globalThis.fetch;globalThis.fetch=faultFetch(originalFetch,mode,stats);
 let evidence:any[]=[];let origins:any={};let errorKind:string|undefined;let guardRejected=false;let validEvidenceCount=0;let exactQuoteMatchCount=0;let evidenceRuleRejections:string[]=[];
 try{await withWorkflowConfig(snapshot,()=>withTraceContext({traceId,runId:`acceptance-${traceId}`,attemptId:'1'},async()=>{
  // This harness retry validates provider recovery only; production uses persisted retry scheduling.
  let segments=excerpt;
  origins={normalizer:'not_run',sources:'raw_transcript_not_corrected',evidence:'not_run'};
  let providerRetryUsed=false;
  const retryInjected429=async<T>(fn:()=>Promise<T>):Promise<T>=>{try{return await fn();}catch(error:any){if(mode==='429-once'&&error.kind==='provider_transient'&&stats.injected429===1&&!providerRetryUsed){providerRetryUsed=true;return fn();}throw error;}};
  if(stage==='both'){
   const normalizer=await retryInjected429(()=>runTranscriptNormalizer(excerpt,{traceId}));
   if(normalizer.promptVersion.includes('rule-based'))throw new Error('Normalizer fallback cannot count as LLM success');
   segments=normalizer.output.normalizedSegments;
   origins={...origins,normalizer:'llm',normalizerPromptVersion:normalizer.promptVersion,sources:'llm_normalized_transcript'};
  }
  const result=await retryInjected429(()=>runTeachingEvidenceAgent({lessonId:'binary-excerpt',traceId,lesson_format:'teacher_certification_interview',sceneLabelConfirmed:true,sceneRevision:1,transcriptSegments:segments,metrics:[],classroomEvents:[],generationConfig:{language:'zh-CN',maxEvidenceCards:4,enabledCategories:['explanation_quality','cognitive_scaffolding','lesson_structure'] as any}}));
  if(result.promptVersion.includes('rule-based'))throw new Error('Evidence fallback cannot count as LLM success');
  origins={...origins,evidence:'llm_hybrid',evidencePromptVersion:result.promptVersion};evidence=result.output.evidenceCards;
  const scene=buildEvaluationContext('teacher_certification_interview',segments,1);
  const validations=evidence.map(card=>validateTeachingEvidenceCard({lesson_format:'teacher_certification_interview',evaluationContext:scene,card,transcriptSegments:segments,metrics:[],classroomEvents:[]}));
  validEvidenceCount=validations.filter(v=>v.valid).length;
  evidenceRuleRejections=validations.filter(v=>!v.valid).map(v=>(v as {reason:string}).reason);
  exactQuoteMatchCount=evidence.filter(card=>{const text=segments.filter(s=>card.transcriptSegmentIds.includes(s.id)).map(s=>s.text).join('').replace(/\s/g,'');return !!card.quote&&text.includes(card.quote.replace(/\s/g,''));}).length;
  // Deliberate forbidden-category probe is not stored as a real/model evidence card or gold label.
  const probe={...(evidence[0]||{}),category:'student_response',transcriptSegmentIds:[segments[0].id]} as any;
  guardRejected=!validateTeachingEvidenceCard({lesson_format:'teacher_certification_interview',evaluationContext:scene,card:probe,transcriptSegments:segments,metrics:[],classroomEvents:[]}).valid;
  stats.recovered=evidenceRuleRejections.length===0 && (mode==='normal'||mode==='429-once'&&stats.injected429===1||mode==='real-response-corrupt-array'&&stats.initialSchemaFailures===1);
 }));}catch(error:any){errorKind=error.kind||'internal';if(errorKind==='schema_invalid')stats.finalSchemaFailures++;}finally{globalThis.fetch=originalFetch;}
 return {summary:{scope:stage==='evidence'?'evidence-only real model path; normalizer not run; not database E2E':'real model Agent path only; not database E2E',stage,fixture:'user binary teaching demo excerpt, 12 selected utterances, not full transcript or gold set',mode,traceId,configHash:snapshot.hash,...stats,origins,guardRejected,validEvidenceCount,exactQuoteMatchCount,evidenceRuleRejections,errorKind,durationMs:Date.now()-started,evidenceCount:evidence.length},evidence};
}
if(require.main===module){const mode=(process.argv[2]||'normal') as FaultMode;const output=resolve(process.argv[3]||'');if(!['normal','real-response-corrupt-array','429-once'].includes(mode))throw new Error('Unknown mode');if(process.argv[4]&&!['--stage=evidence','--stage=both'].includes(process.argv[4]))throw new Error('Unknown stage flag');if(!output.startsWith('/private/tmp/'))throw new Error('Output must be an explicit private /private/tmp path');runAcceptance(mode,{stage:process.argv[4]==='--stage=evidence'?'evidence':'both'}).then(result=>{mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result.summary));if(result.summary.errorKind||!result.summary.guardRejected||!result.summary.recovered)process.exitCode=1;});}
