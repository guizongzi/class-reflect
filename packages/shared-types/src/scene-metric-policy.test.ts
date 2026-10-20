import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvaluationContext} from './evaluation-scene';
import {filterSceneMetrics, checkSceneMetric, sceneMetricId} from './scene-metric-policy';
const roles=[{id:'t',speakerLabel:'教师',text:'问题',startMs:0,endMs:100},{id:'s',speakerLabel:'学生',text:'回答',startMs:100,endMs:200}] as any;
test('dynamic A to B invalidates cached interaction metric and counts post-change hit',()=>{
 const a=buildEvaluationContext('offline_classroom_recording',roles,1);
 const b=buildEvaluationContext('teacher_certification_interview',roles,2);
 const m={id:'3-教师问题数量',name:'教师问题数量',value:1,metadata:{evaluationContext:a}};
 assert.equal(filterSceneMetrics(a,[m]).length,1);
 const decision=checkSceneMetric(b,m);
 assert.equal(decision.allowed,false);assert.equal(decision.changedContext,true);
 assert.equal(filterSceneMetrics(b,[m]).length,0);
});
test('unknown historical metrics and unversioned metrics fail closed',()=>{
 const c=buildEvaluationContext('teacher_certification_interview',[],2);
 assert.equal(sceneMetricId({id:'x',name:'神秘指标'}),null);
 assert.equal(filterSceneMetrics(c,[{id:'x',name:'神秘指标',value:1}]).length,0);
 assert.equal(filterSceneMetrics(c,[{id:'f',name:'填充词次数',value:1}]).length,0);
 assert.equal(filterSceneMetrics(c,[{id:'f',name:'填充词次数',value:1,metadata:{evaluationContext:c}}]).length,1);
});
