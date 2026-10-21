import { Pool } from 'pg';
import { refreshFewShotRelease } from '../src/annotation-feedback';
async function main(){
 const dryRun=!process.argv.includes('--apply');
 if(dryRun && !process.env.DATABASE_URL){console.log(JSON.stringify({dryRun:true,requiresDatabase:true,operation:'refresh-few-shot'}));return;}
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{console.log(JSON.stringify(await refreshFewShotRelease(pool,{version:process.argv.find(a=>a.startsWith('--version='))?.slice(10)??new Date().toISOString(),dryRun})));}finally{await pool.end();}
}main().catch(error=>{console.error(error.message);process.exitCode=1;});
