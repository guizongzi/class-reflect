import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEvaluationContext,isEvaluationCategoryAllowed,isEvaluationContextCurrent} from './evaluation-scene';
import type {TranscriptSegment} from './index';
const t=(id:string,label:string,text='示例'):TranscriptSegment=>({id,startMs:Number(id)*1000,endMs:Number(id)*1000+900,speakerLabel:label,text});
test('recorded real classroom with teacher/student turns retains real interaction scope',()=>{
 const c=buildEvaluationContext('offline_classroom_recording',[t('0','教师'),t('1','学生 A'),t('2','教师')]);assert.equal(c.evaluationScope,'real_interaction');assert.equal(c.requiresReview,false);assert.ok(isEvaluationCategoryAllowed(c,'feedback_quality'));
});
test('teacher quoting a fictional student is not student-side audio',()=>{
 const c=buildEvaluationContext('teacher_certification_interview',[t('0','教师','他说答案是5，这位同学说得对。')]);assert.equal(c.features.studentSegments,0);assert.equal(c.sceneType,'simulated_demo');assert.equal(isEvaluationCategoryAllowed(c,'feedback_quality'),false);
});
test('student roles conflicting with a presentation label trigger review without relabeling',()=>{
 const c=buildEvaluationContext('recorded_online_class',[t('0','教师'),t('1','学生')]);assert.equal(c.sceneType,'recorded_instruction');assert.equal(c.interactionEnabled,false);assert.ok(c.reviewReasons.includes('student_roles_conflict_with_scene_label'));
});
test('missing scene label cannot silently enable real interaction',()=>{const c=buildEvaluationContext(null,[t('0','教师'),t('1','学生')]);assert.equal(c.sceneType,'unconfirmed');assert.equal(c.interactionEnabled,false);assert.equal(c.requiresReview,true);});
test('format and revision isolate old evidence even when changing back to the same format',()=>{
 const c=buildEvaluationContext('teacher_qualification_demo',[t('0','教师')],1);assert.equal(isEvaluationContextCurrent(c,'teacher_certification_interview',1),true);assert.equal(isEvaluationContextCurrent(c,'recorded_online_class',1),false);assert.equal(isEvaluationContextCurrent(c,'teacher_certification_interview',3),false);assert.equal(isEvaluationContextCurrent(undefined,'teacher_certification_interview',1),false);
});

import {summarizeSceneMetricGuard} from './evaluation-scene';
test('scene telemetry distinguishes blocked attempts from forbidden emissions',()=>{
 const ctx=buildEvaluationContext('teacher_certification_interview',[]);
 const safe=summarizeSceneMetricGuard(ctx,['feedback_quality','explanation_quality'],['explanation_quality']);assert.equal(safe.blockedInteractionCount,1);assert.equal(safe.violationCount,0);
 const leak=summarizeSceneMetricGuard(ctx,[],['feedback_quality']);assert.equal(leak.violationCount,1);assert.equal(leak.emittedInteractionCount,1);
});
