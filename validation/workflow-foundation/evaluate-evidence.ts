/** Offline evaluation only: gold must come from an independently reviewed, frozen export. */
import { readFileSync } from 'node:fs';
export interface EvidenceLabel {lessonId:string;category:string;quote:string;origin?:'llm'|'rule'|'fallback'}
export interface EvaluationInput {dataset:{id:string;contentHash:string;frozen:boolean;goldReviewedBy:string};gold:EvidenceLabel[];predicted:EvidenceLabel[]}
function key(row:EvidenceLabel){
 if(!row || typeof row.lessonId!=='string' || !row.lessonId || typeof row.category!=='string' || !row.category || typeof row.quote!=='string' || !row.quote.trim())throw new Error('Every label requires lessonId/category/quote');
 return JSON.stringify([row.lessonId,row.category,row.quote.replace(/\s+/g,' ').trim()]);
}
export function evaluateEvidence(input:EvaluationInput){
 if(!input.dataset?.frozen || !input.dataset.id || !input.dataset.contentHash || !input.dataset.goldReviewedBy || !Array.isArray(input.gold) || !Array.isArray(input.predicted))throw new Error('A frozen independently reviewed gold export is required');
 const goldKeys=input.gold.map(key);if(new Set(goldKeys).size!==goldKeys.length)throw new Error('Duplicate gold labels are ambiguous');
 for(const prediction of input.predicted){key(prediction);if(!['llm','rule','fallback'].includes(String(prediction.origin)))throw new Error('Prediction origin must explicitly distinguish llm/rule/fallback');}
 const score=(predictions:EvidenceLabel[])=>{const remaining=new Set(goldKeys);let tp=0;for(const row of predictions){const k=key(row);if(remaining.delete(k))tp++;}return {truePositive:tp,falsePositive:predictions.length-tp,falseNegative:remaining.size,precision:predictions.length?tp/predictions.length:null,recall:goldKeys.length?tp/goldKeys.length:null};};
 return {dataset:input.dataset,matching:'same lesson/category and whitespace-normalized exact quote, one-to-one',goldCount:input.gold.length,predictionCount:input.predicted.length,llm:score(input.predicted.filter(p=>p.origin==='llm')),pipeline:score(input.predicted),nonLlmPredictionCount:input.predicted.filter(p=>p.origin!=='llm').length};
}
if(require.main===module){try{const path=process.argv[2];if(!path)throw new Error('Usage: evaluate-evidence.ts <frozen-human-gold-and-predictions.json>');console.log(JSON.stringify(evaluateEvidence(JSON.parse(readFileSync(path,'utf8'))),null,2));}catch(error){console.error((error as Error).message);process.exitCode=1;}}
