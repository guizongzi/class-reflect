import test from 'node:test';
import assert from 'node:assert/strict';
import {withTraceContext,getTraceContext} from './trace-context';
test('trace context survives await and remains isolated across concurrent video tasks',async()=>{
 const values=await Promise.all(['a','b'].map(traceId=>withTraceContext({traceId,runId:traceId,attemptId:'1'},async()=>{await Promise.resolve();return getTraceContext()?.traceId;})));
 assert.deepEqual(values,['a','b']);assert.equal(getTraceContext(),undefined);
});
