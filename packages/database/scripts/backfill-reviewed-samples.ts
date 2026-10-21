import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { recordAnnotationFeedback } from '../src/annotation-feedback';
async function main(){
 if(!process.argv.includes('--apply')&&!process.env.DATABASE_URL){console.log(JSON.stringify({dryRun:true,requiresDatabase:true,operation:'backfill-reviewed-samples'}));return;}
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{
 await client.query('BEGIN');
 const result=await client.query(`SELECT id,lesson_id,review_status,raw_json FROM evidence_cards WHERE review_status IN ('accepted','rejected') ORDER BY id`);
 let recorded=0;
 for(const row of result.rows){const raw=row.raw_json??{};const context=raw.evaluationContext;const sourceText=raw.verifiedSourceText;
 // Historical acceptance is not proof of grounding: only explicitly verified originals qualify.
 if(!context || typeof sourceText!=='string')continue;
 await recordAnnotationFeedback(client,{eventKey:`backfill:${row.id}`,evidenceId:row.id,lessonId:row.lesson_id,sourceHash:createHash('sha256').update(sourceText).digest('hex'),scene:context.sceneType,sceneRevision:context.sceneRevision,category:raw.category??'',action:row.review_status==='accepted'?'accept':'reject',quote:raw.quote??'',sourceText,annotationComplete:raw.annotationComplete===true});recorded++;
 }
 await client.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');console.log(JSON.stringify({dryRun:!process.argv.includes('--apply'),scanned:result.rows.length,recorded}));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}main().catch(error=>{console.error(error.message);process.exitCode=1;});
