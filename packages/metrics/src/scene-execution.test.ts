import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvaluationContext} from '@class-reflect/shared-types';
import {calculateScopedClassroomMetrics} from './index';
test('each metric reloads context; mid-evaluation A to B stops remaining old snapshot work',async()=>{
 const segments=[{id:'t',text:'为什么？',speakerLabel:'教师',startMs:0,endMs:100},{id:'s',text:'回答',speakerLabel:'学生',startMs:200,endMs:300}];
 const a=buildEvaluationContext('offline_classroom_recording',segments,1);
 const b=buildEvaluationContext('teacher_certification_interview',segments,2);
 let calls=0;const events:Record<string,unknown>[]=[];
 const results=await calculateScopedClassroomMetrics({transcriptSegments:segments},async()=>++calls<4?a:b,e=>events.push(e));
 assert.ok(calls>4);assert.ok(events.some(e=>e.postChangeViolationHitCount===1));
 assert.equal(results.some(m=>m.id==='question_count'),false);
 assert.ok(results.every(m=>(m.metadata?.evaluationContext as any).sceneRevision===1));
});
