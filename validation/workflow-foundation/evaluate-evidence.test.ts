import test from 'node:test';import assert from 'node:assert/strict';
import { evaluateEvidence } from './evaluate-evidence';
const label={lessonId:'test-only',category:'explanation_quality',quote:'fixture quote'};
const dataset={id:'synthetic-unit-fixture',contentHash:'fixture-not-business-baseline',frozen:true,goldReviewedBy:'test-fixture'};
test('fallback counts toward pipeline recall but never LLM recall',()=>{
 const result=evaluateEvidence({dataset,gold:[label],predicted:[{...label,origin:'fallback'}]});
 assert.equal(result.llm.recall,0);assert.equal(result.pipeline.recall,1);assert.equal(result.llm.precision,null);
});
test('duplicate predictions count as false positives',()=>{
 const result=evaluateEvidence({dataset,gold:[label],predicted:[{...label,origin:'llm'},{...label,origin:'llm'}]});assert.equal(result.llm.precision,0.5);
});
test('no invented or unfrozen gold accepted',()=>{
 assert.throws(()=>evaluateEvidence({dataset:{...dataset,frozen:false},gold:[],predicted:[]}));
 assert.throws(()=>evaluateEvidence({dataset,gold:[label],predicted:[label]}));
});
