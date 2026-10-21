import test from 'node:test';import assert from 'node:assert/strict';
import {callAgent} from './agent-client';import {loadWorkflowConfig,withWorkflowConfig} from '@class-reflect/config';import {withTraceContext} from '@class-reflect/observability';
test('each schema failure produces a safe traceable attempt record',async()=>{
 const names=['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL'];const values=names.map(n=>process.env[n]);const oldFetch=globalThis.fetch,oldLog=console.log;const logs:string[]=[];
 names.forEach(n=>process.env[n]='mock-telemetry');globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"patches":"bad","warnings":[]}'}}]}),{status:200});console.log=(s:any)=>logs.push(String(s));
 try{await assert.rejects(withWorkflowConfig(loadWorkflowConfig(),()=>withTraceContext({traceId:'t',runId:'r',attemptId:'1',stepKey:'normalize_transcript'},()=>callAgent({agentName:'transcript-normalizer-agent',promptVersion:'test',input:{text:'private classroom text'},validate:(v):v is any=>true}))));
 const row=logs.map(s=>JSON.parse(s)).find(r=>r.message==='llm attempt finished');assert.ok(row);assert.equal(row.traceId,'t');assert.equal(row.meta.schemaValid,false);assert.equal(logs.some(s=>s.includes('private classroom text')),false);
 }finally{globalThis.fetch=oldFetch;console.log=oldLog;names.forEach((n,i)=>{if(values[i]===undefined)delete process.env[n];else process.env[n]=values[i];});}
});
