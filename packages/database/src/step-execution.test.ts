import test from 'node:test';
import assert from 'node:assert/strict';
import {claimStep,completeStep,renewStepLease,withExecutionGuard,assertExecutionFence} from './step-execution';
test('stale worker cannot write after lease takeover',async()=>{
 const db={query:async()=>({rows:[]})};
 await assert.rejects(withExecutionGuard({runId:'r',token:1,traceId:'t'},()=>assertExecutionFence(db)),/租约/);
});
test('claim and completion are conditional; completed or contended step cannot be claimed',async()=>{
 let sql='';const db={query:async(q:string)=>{sql=q;return {rows:[]};}};
 assert.equal(await claimStep(db,{runId:'r',stepKey:'asr',inputHash:'h',workerToken:1,leaseMs:1000}),null);
 assert.match(sql,/on conflict/);assert.match(sql,/completed/);
 assert.equal(await completeStep(db,{executionId:'e',runId:'r',workerToken:1,attempt:1},{}),false);
 assert.match(sql,/fencing_token/);
 assert.equal(await renewStepLease(db,{runId:'r',token:1,leaseMs:1000}),false);
});
test('text edit without scene change rejects old processor results',async()=>{
 const {assertInputVersion}=await import('./step-execution');
 const db={query:async()=>({rows:[{scene_revision:1,transcript_version:'3:1'}]})};
 await assert.rejects(withExecutionGuard({runId:'r',token:1,traceId:'t',lessonId:'l',videoId:'v',inputVersion:{scene_revision:1,transcript_version:'2:1'}},()=>assertInputVersion(db)),/原文/);
});
test('persist transcript checks version before its own revision increment exactly once',async()=>{
 const {fencedPool}=await import('./step-execution');let revision=1,checks=0;
 const raw={query:async(sql:string)=>{if(sql.includes('select l.scene_revision')){checks++;return {rows:[{scene_revision:revision,transcript_version:'0:0'}]};}if(sql.includes('update lessons set scene_revision'))revision++;return {rows:[{id:'r'}]};},release:()=>{}};
 const pool=fencedPool({connect:async()=>raw,query:raw.query});
 await withExecutionGuard({runId:'r',token:1,traceId:'t',lessonId:'l',videoId:'v',inputVersion:{scene_revision:1,transcript_version:'0:0'}},async()=>{
  const client=await pool.connect();try{await client.query('begin');await client.query('update lessons set scene_revision=scene_revision+1');await client.query('update reports set generated_from=generated_from');await client.query('commit');}finally{client.release();}
 });assert.equal(checks,1);assert.equal(revision,2);
});
