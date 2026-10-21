import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { freezeRegressionSet } from './annotation-feedback';
// Dedicated, disposable PostgreSQL database only. Never runs against DATABASE_URL implicitly.
test('PostgreSQL prevents all mutations of frozen parent and child rows',{skip:!process.env.ANNOTATION_TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.ANNOTATION_TEST_DATABASE_URL});const client=await pool.connect();const schema=`annotation_test_${randomUUID().replace(/-/g,'')}`;
 try{
 await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
 await client.query(readFileSync(`${__dirname}/../migrations/20261021_annotation_feedback.sql`,'utf8'));
 const parent=randomUUID(),child=randomUUID();
 await client.query(`INSERT INTO regression_sets(id,version) VALUES($1,'v1')`,[parent]);
 await client.query(`INSERT INTO regression_cases(id,set_id,source_hash,payload) VALUES($1,$2,'source','{}')`,[child,parent]);
 await freezeRegressionSet(client,parent);
 const snapshot=await client.query(`SELECT content_hash FROM regression_sets WHERE id=$1`,[parent]);
 for(const sql of [
  `UPDATE regression_sets SET version='v2' WHERE id='${parent}'`,
  `DELETE FROM regression_sets WHERE id='${parent}'`,
  `INSERT INTO regression_cases(id,set_id,source_hash,payload) VALUES('${randomUUID()}','${parent}','new','{}')`,
  `UPDATE regression_cases SET payload='{"changed":true}' WHERE id='${child}'`,
  `DELETE FROM regression_cases WHERE id='${child}'`,
  'TRUNCATE regression_sets CASCADE',
  'TRUNCATE regression_cases'
 ])await assert.rejects(client.query(sql));
 assert.deepEqual((await client.query(`SELECT content_hash FROM regression_sets WHERE id=$1`,[parent])).rows,snapshot.rows);
 }finally{await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await pool.end();}
});
