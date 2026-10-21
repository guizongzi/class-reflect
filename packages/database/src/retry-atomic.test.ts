import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';
import {retryWorkflowRunForLesson} from './index';
test('retry publishes queued only inside the transaction after resetting artifacts',async()=>{
 const oldConnect=Pool.prototype.connect,oldQuery=Pool.prototype.query,oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://unused/test';
 const events:Array<{tx:boolean;sql:string}>=[];
 const run={id:'r',lesson_id:'l',video_id:'v',status:'failed',current_step:'normalize_transcript',input:{},output:{},retry_count:0};
 const answer=(sql:string)=>({rows:sql.includes('select *')&&sql.includes('workflow_runs')?[run]:[]});
 Pool.prototype.query=(async(sql:string)=>{events.push({tx:false,sql});return answer(sql);}) as any;
 Pool.prototype.connect=(async()=>({query:async(sql:string)=>{events.push({tx:true,sql});return sql.includes('for update')?{rows:[run]}:answer(sql);},release:()=>{}})) as any;
 try{await retryWorkflowRunForLesson({lessonId:'l',fromStepKey:'normalize_transcript'});const published=events.findIndex(e=>e.sql.includes("status = 'queued'"));assert.ok(published>=0);assert.equal(events[published].tx,true);assert.ok(events.slice(0,published).some(e=>e.sql.includes('delete from evidence_cards')));assert.equal(events.filter(e=>e.sql==='begin').length,1);assert.equal(events.filter(e=>e.sql==='commit').length,1);}
 finally{Pool.prototype.query=oldQuery;Pool.prototype.connect=oldConnect;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;}
});
