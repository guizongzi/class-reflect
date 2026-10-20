import assert from 'node:assert/strict';
import test from 'node:test';
import {Pool} from 'pg';
import {buildEvaluationContext} from '@class-reflect/shared-types';
import {isSceneEvidenceRowCurrent,isSceneReportRowCurrent,saveTeachingEvidenceCards} from './index';
const ctx=buildEvaluationContext('teacher_certification_interview',[],2);
test('persisted partitions exclude stale, untagged, old-revision and interactive presentation cards',()=>{
 const row={raw_json:{category:'explanation_quality',evaluationContext:ctx}};
 assert.equal(isSceneEvidenceRowCurrent(row,'teacher_certification_interview',2),true);
 for(const r of [{raw_json:{}},{raw_json:{...row.raw_json,stale:true}},{raw_json:{...row.raw_json,evaluationContext:{...ctx,sceneRevision:1}}},{raw_json:{...row.raw_json,category:'feedback_quality'}}])assert.equal(isSceneEvidenceRowCurrent(r,'teacher_certification_interview',2),false);
 assert.equal(isSceneReportRowCurrent({generated_from:{evaluationContext:ctx}},'recorded_online_class',2),false);
});
test('concurrent scene change aborts evidence writes and rolls back',async()=>{
 const old=Pool.prototype.connect;const oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://unused/test';const calls:string[]=[];
 const client={query:async(sql:string)=>{calls.push(sql);if(sql.includes('select * from lessons'))return {rows:[{lesson_format:'teacher_certification_interview',scene_revision:3}]};return {rows:[]};},release:()=>{}};
 Pool.prototype.connect=(async()=>client) as any;
 try{await assert.rejects(saveTeachingEvidenceCards({lessonId:'l',videoId:'v',cards:[],sourceModel:'test',evaluationContext:ctx}),/场景已变更/);assert.ok(calls.includes('rollback'));assert.equal(calls.some(s=>s.includes('delete from evidence_cards')),false);}
 finally{Pool.prototype.connect=old;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;}
});
test('stale metric writes roll back before deleting current metrics',async()=>{
 const {saveClassroomMetrics}=await import('./index');
 const old=Pool.prototype.connect;const oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://unused/test';const calls:string[]=[];
 Pool.prototype.connect=(async()=>({query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('select * from lessons')?[{lesson_format:'teacher_certification_interview',scene_revision:3}]:[]};},release:()=>{}})) as any;
 try{await assert.rejects(saveClassroomMetrics({lessonId:'l',videoId:'v',metrics:[],evaluationContext:ctx}),/指标场景已变更/);assert.ok(calls.includes('rollback'));assert.equal(calls.some(s=>s.includes('delete from classroom_metrics')),false);}
 finally{Pool.prototype.connect=old;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;}
});
test('automatic effective role change invalidates prior scene results',async()=>{
 const {updateTranscriptSegmentsProjection}=await import('./index');
 const old=Pool.prototype.connect;const oldQuery=Pool.prototype.query;const oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://unused/test';const calls:string[]=[];
 Pool.prototype.query=(async()=>({rows:[]})) as any;
 Pool.prototype.connect=(async()=>({query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('select * from transcript_segments')?[{id:'s',speaker_label:'学生',agent_speaker_role:'student'}]:[]};},release:()=>{}})) as any;
 try{await updateTranscriptSegmentsProjection({lessonId:'l',videoId:'v',segments:[{id:'s',text:'讲授',speakerLabel:'教师',startMs:0,endMs:100}]});assert.ok(calls.some(s=>s.includes('scene_revision=scene_revision+1')));assert.ok(calls.some(s=>s.includes('update reports')));}
 finally{Pool.prototype.connect=old;Pool.prototype.query=oldQuery;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;}
});
