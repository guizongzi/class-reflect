import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAnnotationQuality, selectEligibleFewShot } from './annotation-feedback';
const good = { id:'1',lessonId:'other',sourceHash:'hash',scene:'simulated_demo',category:'explanation_quality',quote:'解释二进制',sourceText:'教师解释二进制的规则',annotationComplete:true,action:'accept',sceneRevision:1,eligible:true };
test('accept alone cannot promote an unverified or incomplete annotation',()=>{
 assert.equal(assessAnnotationQuality({...good,annotationComplete:false}).eligible,false);
 assert.equal(assessAnnotationQuality({...good,quote:'不存在'}).eligible,false);
 assert.equal(assessAnnotationQuality({...good,action:'revoke'}).eligible,false);
 assert.equal(assessAnnotationQuality(good).eligible,true);
});
test('few shot selection excludes current lesson, source, frozen sources and revoked rows',()=>{
 const rows=[good,{...good,id:'2',sourceHash:'frozen'},{...good,id:'3',lessonId:'current'},{...good,id:'4',sourceHash:'currenthash'},{...good,id:'5',eligible:false},{...good,id:'6',sourceHash:'six'},{...good,id:'7',sourceHash:'seven'}];
 const selected=selectEligibleFewShot(rows,{scene:good.scene,category:good.category,excludeLessonId:'current',excludeSourceHash:'currenthash',frozenSourceHashes:['frozen'],maxCards:99,characterBudget:1000});
 assert.deepEqual(selected.map(x=>x.id),['1','6']);
 assert.equal(selectEligibleFewShot(rows,{scene:good.scene,category:good.category,excludeLessonId:'current',excludeSourceHash:'currenthash',frozenSourceHashes:[],maxCards:2,characterBudget:1}).length,0);
});
import { recordAnnotationFeedback, selectFewShotCards, freezeRegressionSet } from './annotation-feedback';
test('duplicate audit event does not rewrite pool',async()=>{
 const calls:string[]=[];const client={async query(sql:string){calls.push(sql);return {rows:[]};}};
 const result=await recordAnnotationFeedback(client,{...good,eventKey:'same',evidenceId:'evidence'});
 assert.equal(result.recorded,false);assert.equal(calls.length,1);
});
test('revoke writes an ineligible pool row in caller transaction',async()=>{
 const calls:{sql:string;values:any[]}[]=[];const client={async query(sql:string,values:any[]=[]){calls.push({sql,values});return {rows:[{id:'event'}]};}};
 await recordAnnotationFeedback(client,{...good,action:'revoke',eventKey:'revocation',evidenceId:'evidence'});
 assert.equal(calls.length,2);assert.equal(calls[1].values[8],false);
 assert.ok(calls.every(c=>!/^BEGIN|COMMIT/.test(c.sql)));
});
test('published release selection rechecks live eligibility',async()=>{
 let n=0;const client={async query(){return ++n===1?{rows:[{id:'1',card:good,eligible:false}]}:{rows:[]};}};
 const cards=await selectFewShotCards(client,{releaseId:'r',scene:good.scene,category:good.category,excludeLessonId:'current',excludeSourceHash:'current',maxCards:2,characterBudget:1000});
 assert.equal(cards.length,0);
});
test('freezing locks parent before reading child set',async()=>{
 const calls:string[]=[];const client={async query(sql:string){calls.push(sql);return {rows:sql.includes('FOR UPDATE')?[{id:'set'}]:[]};}};
 await freezeRegressionSet(client,'set');assert.match(calls[0],/FOR UPDATE/);assert.match(calls[2],/frozen_at IS NULL/);
});
import { refreshFewShotRelease, renderFewShotCard } from './annotation-feedback';
test('release stores immutable card snapshot and eligibility event',async()=>{
 const calls:{sql:string;values:any[]}[]=[];const client={async query(sql:string,values:any[]=[]){calls.push({sql,values});return {rows:sql.startsWith('SELECT')?[{id:'1',card:good,last_event_id:'event'}]:[]};}};
 await refreshFewShotRelease(client,{version:'v1'});
 assert.match(calls[1].sql,/sample_ids,cards/);
 assert.equal(JSON.parse(calls[1].values[4])[0].releaseEligibleEventId,'event');
});
test('full serialized card including explanation consumes character budget',()=>{
 const row={...good,caseExplanation:'long explanation'.repeat(100)};
 assert.ok(renderFewShotCard(row).length>100);
 assert.equal(selectEligibleFewShot([row],{scene:good.scene,category:good.category,excludeLessonId:'current',excludeSourceHash:'current',frozenSourceHashes:[],maxCards:2,characterBudget:100}).length,0);
});
test('published few-shot rejects stale evidence and changed scene despite old eligible release',async()=>{
 const current={currentReviewStatus:'accepted',currentStale:false,currentScene:'simulated_demo',currentSceneRevision:1,currentSourceFormat:'teacher_certification_interview',lessonSourceFormat:'teacher_certification_interview',lessonSceneRevision:1};
 const rows=[{id:'valid',card:good,eligible:true,...current},{id:'stale',card:{...good,sourceHash:'stale'},eligible:true,...current,currentStale:true},{id:'changed',card:{...good,sourceHash:'changed'},eligible:true,...current,lessonSceneRevision:2},{id:'rejected',card:{...good,sourceHash:'rejected'},eligible:true,...current,currentReviewStatus:'rejected'}];let n=0;
 const client={async query(){return {rows:++n===1?rows:[]};}};
 const cards=await selectFewShotCards(client,{releaseId:'r',scene:good.scene,category:good.category,excludeLessonId:'current',excludeSourceHash:'current',maxCards:2,characterBudget:1000});assert.deepEqual(cards.map(c=>c.id),['valid']);
});
