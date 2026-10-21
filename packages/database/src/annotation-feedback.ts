import { createHash, randomUUID } from 'node:crypto';
export interface Queryable { query(text:string, values?:any[]):Promise<{rows:any[];rowCount?:number|null}> }
export interface AnnotationInput {eventKey:string;evidenceId:string;lessonId:string;sourceHash:string;scene:string;sceneRevision:number;category:string;action:string;quote:string;sourceText:string;annotationComplete:boolean;reviewerId?:string;traceId?:string;caseExplanation?:string}
export interface FewShotCard {id:string;lessonId:string;sourceHash:string;scene:string;category:string;quote:string;sourceText:string;annotationComplete:boolean;action:string;sceneRevision:number;eligible:boolean;caseExplanation?:string}
export function assessAnnotationQuality(input:Pick<AnnotationInput,'action'|'quote'|'sourceText'|'annotationComplete'|'sourceHash'|'scene'|'sceneRevision'>) {
 const reasons:string[]=[];
 if(input.action!=='accept') reasons.push('not_accepted');
 if(!input.annotationComplete) reasons.push('annotation_incomplete');
 if(typeof input.quote!=='string' || !input.quote.trim() || typeof input.sourceText!=='string' || !input.sourceText.includes(input.quote)) reasons.push('quote_not_grounded');
 if(!input.sourceHash || !['real_classroom','recorded_instruction','simulated_demo'].includes(input.scene) || !Number.isInteger(input.sceneRevision) || input.sceneRevision<1) reasons.push('provenance_incomplete');
 return {eligible:reasons.length===0,reasons};
}
export async function recordAnnotationFeedback(client:Queryable,input:AnnotationInput) {
 if(!input.eventKey || !input.evidenceId || !input.lessonId || !input.category) throw new Error('Annotation provenance is incomplete');
 const quality=assessAnnotationQuality(input);
 // The caller owns the transaction: an audit event and eligibility update commit together.
 const event=await client.query(`INSERT INTO annotation_events(id,event_key,evidence_id,lesson_id,action,payload,trace_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(event_key) DO NOTHING RETURNING id`,[randomUUID(),input.eventKey,input.evidenceId,input.lessonId,input.action,JSON.stringify({...input,quality}),input.traceId??null]);
 if(!event.rows.length) return {recorded:false,...quality};
 await client.query(`INSERT INTO sample_pool(id,evidence_id,lesson_id,source_hash,scene,category,scene_revision,card,eligible,last_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(evidence_id) DO UPDATE SET source_hash=EXCLUDED.source_hash,scene=EXCLUDED.scene,category=EXCLUDED.category,scene_revision=EXCLUDED.scene_revision,card=EXCLUDED.card,eligible=EXCLUDED.eligible,last_event_id=EXCLUDED.last_event_id,updated_at=now()`,[randomUUID(),input.evidenceId,input.lessonId,input.sourceHash,input.scene,input.category,input.sceneRevision,JSON.stringify(input),quality.eligible,event.rows[0].id]);
 return {recorded:true,...quality};
}
interface Selection {scene:string;category:string;excludeLessonId:string;excludeSourceHash:string;frozenSourceHashes:string[];maxCards:number;characterBudget:number}
export function renderFewShotCard(card:FewShotCard){return JSON.stringify({category:card.category,quote:card.quote,caseExplanation:card.caseExplanation??''});}
export function selectEligibleFewShot(rows:FewShotCard[],input:Selection) {
 if(!Number.isFinite(input.maxCards) || !Number.isFinite(input.characterBudget) || input.characterBudget<0) throw new Error('Invalid few-shot selection budget');
 const seen=new Set<string>();let used=0;const result:FewShotCard[]=[];
 for(const row of rows){
  if(result.length>=Math.min(2,Math.max(0,input.maxCards))) break;
  if(!row.eligible || !assessAnnotationQuality(row).eligible || row.scene!==input.scene || row.category!==input.category || row.lessonId===input.excludeLessonId || row.sourceHash===input.excludeSourceHash || input.frozenSourceHashes.includes(row.sourceHash) || seen.has(row.sourceHash)) continue;
  const rendered=renderFewShotCard(row);
  if(used+rendered.length>input.characterBudget) continue;
  used+=rendered.length;seen.add(row.sourceHash);result.push(row);
 }return result;
}
export async function refreshFewShotRelease(client:Queryable,input:{version:string;dryRun?:boolean}){
 const rows=await client.query(`SELECT id,card,last_event_id FROM sample_pool WHERE eligible=true AND source_hash NOT IN (SELECT rc.source_hash FROM regression_cases rc JOIN regression_sets rs ON rs.id=rc.set_id WHERE rs.frozen_at IS NOT NULL) ORDER BY updated_at DESC,id`);
 const cards=rows.rows.map(row=>({...row.card,id:row.id,releaseEligibleEventId:row.last_event_id})).filter(row=>assessAnnotationQuality(row).eligible);
 const hash=createHash('sha256').update(JSON.stringify(cards)).digest('hex');const id=randomUUID();
 if(!input.dryRun) await client.query(`INSERT INTO few_shot_releases(id,version,content_hash,sample_ids,cards) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,[id,input.version,hash,JSON.stringify(cards.map(c=>c.id)),JSON.stringify(cards)]);
 return {id,version:input.version,hash,sampleCount:cards.length,dryRun:!!input.dryRun};
}
export async function selectFewShotCards(client:Queryable,input:Omit<Selection,'frozenSourceHashes'> & {releaseId:string}){
 // Eligibility is checked live, so revocation invalidates even an already published release.
 const rows=await client.query(`SELECT sp.id,snapshot.card,sp.eligible,
 ec.review_status AS "currentReviewStatus",coalesce(ec.raw_json->>'stale','false')='true' AS "currentStale",
 ec.raw_json->'evaluationContext'->>'sceneType' AS "currentScene",
 ec.raw_json->'evaluationContext'->>'sceneRevision' AS "currentSceneRevision",
 ec.raw_json->'evaluationContext'->>'sourceFormat' AS "currentSourceFormat",
 CASE WHEN l.lesson_format='teacher_qualification_demo' THEN 'teacher_certification_interview' ELSE l.lesson_format END AS "lessonSourceFormat",
 l.scene_revision AS "lessonSceneRevision"
 FROM few_shot_releases fr CROSS JOIN LATERAL jsonb_array_elements(fr.cards) AS snapshot(card)
 JOIN sample_pool sp ON sp.id::text=snapshot.card->>'id' AND sp.last_event_id::text=snapshot.card->>'releaseEligibleEventId'
 JOIN evidence_cards ec ON ec.id=sp.evidence_id AND ec.lesson_id=sp.lesson_id
 JOIN lessons l ON l.id=ec.lesson_id
 WHERE fr.id=$1 AND sp.eligible=true AND ec.review_status IN ('accepted','edited_and_accepted')
 AND ec.raw_json->>'stale' IS DISTINCT FROM 'true'
 AND ec.raw_json->'evaluationContext'->>'sceneType'=snapshot.card->>'scene'
 AND ec.raw_json->'evaluationContext'->>'sceneRevision'=snapshot.card->>'sceneRevision'
 AND ec.raw_json->'evaluationContext'->>'sceneRevision'=l.scene_revision::text
 AND ec.raw_json->'evaluationContext'->>'sourceFormat' IS NOT DISTINCT FROM
 CASE WHEN l.lesson_format='teacher_qualification_demo' THEN 'teacher_certification_interview' ELSE l.lesson_format END
 ORDER BY sp.id`,[input.releaseId]);
 const frozen=await client.query(`SELECT DISTINCT rc.source_hash FROM regression_cases rc JOIN regression_sets rs ON rs.id=rc.set_id WHERE rs.frozen_at IS NOT NULL`);
 return selectEligibleFewShot(rows.rows.map(row=>({...row.card,id:row.id,eligible:row.eligible && ['accepted','edited_and_accepted'].includes(row.currentReviewStatus) && row.currentStale===false && row.currentScene===row.card.scene && Number(row.currentSceneRevision)===row.card.sceneRevision && Number(row.lessonSceneRevision)===row.card.sceneRevision && row.currentSourceFormat===row.lessonSourceFormat})),{...input,frozenSourceHashes:frozen.rows.map(row=>row.source_hash)});
}
/** Requires a caller-owned transaction, shared with any dataset construction writes. */
export async function freezeRegressionSet(client:Queryable,id:string){
 const parent=await client.query(`SELECT id,frozen_at,content_hash FROM regression_sets WHERE id=$1 FOR UPDATE`,[id]);
 if(!parent.rows.length) throw new Error('Regression set not found');
 if(parent.rows[0].frozen_at) return {id,hash:String(parent.rows[0].content_hash),alreadyFrozen:true};
 const cases=await client.query(`SELECT id,source_hash,payload FROM regression_cases WHERE set_id=$1 ORDER BY id`,[id]);
 const hash=createHash('sha256').update(JSON.stringify(cases.rows)).digest('hex');
 await client.query(`UPDATE regression_sets SET frozen_at=now(),content_hash=$2 WHERE id=$1 AND frozen_at IS NULL`,[id,hash]);
 return {id,hash,caseCount:cases.rows.length};
}
