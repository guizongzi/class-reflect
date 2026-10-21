import { Pool } from 'pg';
import { freezeRegressionSet } from '../src/annotation-feedback';
async function main(){
 const id=process.argv.find(a=>a.startsWith('--id='))?.slice(5);if(!id)throw new Error('--id is required');
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,operation:'freeze-regression-set',id}));return;}
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{await client.query('BEGIN');const result=await freezeRegressionSet(client,id);await client.query('COMMIT');console.log(JSON.stringify(result));}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}main().catch(error=>{console.error(error.message);process.exitCode=1;});
