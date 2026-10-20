import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEvaluationContext} from '@class-reflect/shared-types';
import {buildReportFromAcceptedEvidence} from './index';
import type {TeachingEvidenceCard} from '@class-reflect/shared-types';
const scene=buildEvaluationContext('teacher_certification_interview',[],2);
const base={id:'c',title:'讲解步骤',category:'explanation_quality',sentiment:'positive',fact:'分步讲解',interpretation:'过程可跟随',startMs:0,endMs:1000,quote:'第一步',transcriptSegmentIds:['s'],metricIds:[],classroomEventIds:[],applicableLessonFormats:['teacher_certification_interview'],confidence:'high',uncertaintyNote:null,reviewStatus:'accepted',evaluationContext:scene} as TeachingEvidenceCard;
test('demo report has dedicated presentation language and excludes interactive or obsolete evidence',()=>{
 const r=buildReportFromAcceptedEvidence({lesson:{id:'l',lessonTitle:'二进制',courseTitle:'试讲',lessonFormat:'teacher_certification_interview',status:'completed'},evaluationContext:scene,evidenceCards:[base,{...base,id:'x',category:'feedback_quality',title:'不应出现的互动卡'},{...base,id:'old',evaluationContext:{...scene,sceneRevision:1},title:'不应出现的旧场景卡'}],metrics:[{id:'m',name:'学生回答或齐答次数',value:10}]});
 assert.match(r.markdownContent,/模拟试讲/);assert.match(r.markdownContent,/教学呈现/);assert.doesNotMatch(r.markdownContent,/不应出现/);assert.doesNotMatch(r.markdownContent,/学生回答或齐答次数/);assert.equal(r.generatedFrom.evidenceCount,1);
 assert.doesNotMatch(r.markdownContent,/围绕课堂结构、教学互动、学习检查/);
});
