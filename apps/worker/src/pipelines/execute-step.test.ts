import test from 'node:test';import assert from 'node:assert/strict';
import {executeStep} from './execute-step';
test('successful processor commits once, duplicate execution returns persisted result',async()=>{
 let calls=0,commits=0;const deps={claim:async()=>({executionId:'e',runId:'r',workerToken:1,attempt:1}),cached:async()=>({output:{cached:true}}),renew:async()=>true,complete:async()=>{commits++;return true;}};
 const out=await executeStep(deps,async()=>{calls++;return {output:{ok:true}};},1000);
 assert.equal(out.output?.ok,true);assert.equal(calls,1);assert.equal(commits,1);
 assert.equal((await executeStep({...deps,claim:async()=>null},async()=>{calls++;return {};},1000)).output?.cached,true);assert.equal(calls,1);
});
test('lost lease rejects completed processor result',async()=>{
 const deps={claim:async()=>({executionId:'e',runId:'r',workerToken:1,attempt:1}),cached:async()=>null,renew:async()=>true,complete:async()=>false};
 await assert.rejects(executeStep(deps,async()=>({}),1000),/租约/);
});
