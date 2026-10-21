import test from 'node:test';import assert from 'node:assert/strict';
import {recordWorkflowFailure,acquireProviderProbe} from './failure-routing';
const policy={schemaRetries:1,providerRetries:3,baseDelayMs:1000,maxDelayMs:60000,circuitThreshold:3,circuitOpenMs:30000};
test('business failure persists queue without model retry',async()=>{
 const calls:string[]=[];const db={query:async(q:string)=>{calls.push(q);return {rows:[{id:'failure'}]};}};
 const d=await recordWorkflowFailure(db,{kind:'business_rule_rejected',code:'RULE',safeMessage:'规则拒绝',retryable:false,attempt:1,runId:'r',traceId:'t',stepKey:'evidence'},policy,'model',1);
 assert.equal(d.action,'human_review');assert.ok(calls.some(q=>q.includes('workflow_review_queue')));
});
test('transient failure persists due time and circuit; open circuit prevents call',async()=>{
 const calls:string[]=[];const db={query:async(q:string)=>{calls.push(q);return {rows:q.includes('returning id')||q.includes('for update')?[{id:'f'}]:[]};}};
 const d=await recordWorkflowFailure(db,{kind:'provider_transient',code:'HTTP429',safeMessage:'限流',retryable:true,retryAfterMs:3000,attempt:1,runId:'r',stepKey:'evidence'},policy,'model',1);
 assert.equal(d.delayMs,3000);assert.ok(calls.some(q=>q.includes('next_retry_at')));
 await assert.rejects(acquireProviderProbe(db,'model',policy.circuitOpenMs),/熔断/);
});
import {resetProviderCircuit} from './failure-routing';
test('failure without execution fence is rejected before any write',async()=>{
 const calls:string[]=[];const db={query:async(q:string)=>{calls.push(q);return {rows:[]};}};
 await assert.rejects(recordWorkflowFailure(db,{kind:'provider_transient',code:'TIMEOUT',safeMessage:'timeout',retryable:true,attempt:1,runId:'r'},policy,'model'),/执行令牌/);assert.equal(calls.length,0);
});
test('circuit acquisition returns epoch; stale reset is CAS rejected',async()=>{
 let sql='';const db={query:async(q:string)=>{sql=q;return {rows:q.startsWith('insert')?[{provider_key:'m',epoch:5,probe_token:'probe'}]:[]};}};
 const lease=await acquireProviderProbe(db,'m',1000);assert.equal(lease?.epoch,5);
 assert.equal(await resetProviderCircuit(db,'m',lease),false);assert.match(sql,/epoch=/);assert.match(sql,/probe_token/);
});
test('stale execution cannot write audit queue or provider circuit',async()=>{
 const calls:string[]=[];const db={query:async(q:string)=>{calls.push(q);return {rows:[]};}};
 await assert.rejects(recordWorkflowFailure(db,{kind:'provider_transient',code:'TIMEOUT',safeMessage:'timeout',retryable:true,attempt:1,runId:'r'},policy,'model',2),/执行令牌/);
 assert.equal(calls.length,1);assert.match(calls[0],/for update/);
});
test('half-open failure uses probe and epoch CAS while concurrent closed failures still accumulate',async()=>{
 const calls:string[]=[];const db={query:async(q:string)=>{calls.push(q);return {rows:[{id:'ok'}]};}};
 const failure={kind:'provider_transient' as const,code:'TIMEOUT',safeMessage:'timeout',retryable:true,attempt:1,runId:'r'};
 await recordWorkflowFailure(db,failure,policy,'model',2,{epoch:5,probeToken:'probe'});
 const halfOpen=calls.find(q=>q.startsWith('update provider_circuits'));assert.match(halfOpen??'',/epoch=\$4/);assert.match(halfOpen??'',/probe_token is not distinct/);
 calls.length=0;await recordWorkflowFailure(db,failure,policy,'model',2,{epoch:5,probeToken:null});
 assert.ok(calls.some(q=>q.startsWith('insert into provider_circuits')));
});
