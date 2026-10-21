import {WorkflowFailureError} from '@class-reflect/shared-types';
import {AsyncLocalStorage} from 'node:async_hooks';
export type SqlClient={query(sql:string,values?:any[]):Promise<{rows:any[];rowCount?:number|null}>};
export type ExecutionGuard={runId:string;token:number;traceId:string;lessonId?:string;sceneRevision?:number;videoId?:string;inputVersion?:{scene_revision:number;transcript_version:string};executionId?:string};
const storage=new AsyncLocalStorage<ExecutionGuard>();
export function withExecutionGuard<T>(guard:ExecutionGuard,fn:()=>T):T{return storage.run(guard,fn);}
export function getExecutionGuard(){return storage.getStore();}
export async function assertExecutionFence(db:SqlClient){
 const guard=storage.getStore();if(!guard)return;
 const row=(await db.query(`select id from workflow_runs where id=$1 and fencing_token=$2 and lease_until>clock_timestamp() and status='running' for update`,[guard.runId,guard.token])).rows[0];
 if(!row)throw new Error('工作流租约已失效，拒绝旧执行写入');
 await db.query("select set_config('app.trace_id',$1,true)",[guard.traceId]);
 if(guard.executionId)await db.query("select set_config('app.execution_id',$1,true)",[guard.executionId]);
}
async function assertCommitFence(db:SqlClient){
 const g=getExecutionGuard();if(!g)return;
 const r=await db.query("select id from workflow_runs where id=$1 and fencing_token=$2 and (lease_until>clock_timestamp() or status<>'running')",[g.runId,g.token]);
 if(!r.rows[0])throw new Error('工作流租约已失效，提交被拒绝');
}
export async function claimStep(db:SqlClient,input:{runId:string;stepKey:string;inputHash:string;workerToken:number;leaseMs:number}){
 const result=await db.query(`insert into workflow_step_executions(workflow_run_id,step_key,input_hash,fencing_token,status,lease_until)
 select $1,$2,$3,$4,'running',now()+$5*interval '1 millisecond'
 where exists(select 1 from workflow_runs where id=$1 and fencing_token=$4 and lease_until>clock_timestamp() and status='running')
 on conflict(workflow_run_id,step_key,input_hash) do update set fencing_token=excluded.fencing_token,status='running',lease_until=excluded.lease_until,attempt=workflow_step_executions.attempt+1
 where workflow_step_executions.status<>'completed' and (workflow_step_executions.lease_until<=clock_timestamp() or workflow_step_executions.fencing_token<>excluded.fencing_token)
 returning id,workflow_run_id,fencing_token,attempt`,[input.runId,input.stepKey,input.inputHash,input.workerToken,input.leaseMs]);
 const row=result.rows[0];return row?{executionId:String(row.id),runId:input.runId,workerToken:input.workerToken,attempt:Number(row.attempt)}:null;
}
export type StepLease={executionId:string;runId:string;workerToken:number;attempt:number};
export async function completeStep(db:SqlClient,lease:StepLease,result:Record<string,unknown>){
 const r=await db.query(`update workflow_step_executions set status='completed',output=$4::jsonb,finished_at=now() where id=$1 and workflow_run_id=$2 and fencing_token=$3 and attempt=$5 and lease_until>clock_timestamp() and status='running' and exists(select 1 from workflow_runs where id=$2 and fencing_token=$3 and lease_until>clock_timestamp() and status='running') returning id`,[lease.executionId,lease.runId,lease.workerToken,JSON.stringify(result),lease.attempt]);return !!r.rows[0];
}
export async function renewStepLease(db:SqlClient,input:{runId:string;token:number;leaseMs:number}){
 const r=await db.query(`update workflow_runs set lease_until=now()+$3*interval '1 millisecond' where id=$1 and fencing_token=$2 and lease_until>clock_timestamp() and status='running' returning id`,[input.runId,input.token,input.leaseMs]);if(r.rows[0])await db.query(`update workflow_step_executions set lease_until=clock_timestamp()+$3*interval '1 millisecond' where workflow_run_id=$1 and fencing_token=$2 and status='running'`,[input.runId,input.token,input.leaseMs]);return !!r.rows[0];
}

export async function assertInputVersion(db:SqlClient){
 const guard=getExecutionGuard();if(!guard?.inputVersion||!guard.lessonId||!guard.videoId)return;
 const r=await db.query(`select l.scene_revision,(select coalesce(sum(version),0)::text||':'||count(*)::text from transcript_segments t where t.lesson_id=l.id and t.video_id=$2) as transcript_version from lessons l where l.id=$1 for update`,[guard.lessonId,guard.videoId]);
 const current=r.rows[0];
 if(!current||Number(current.scene_revision)!==Number(guard.inputVersion.scene_revision)||String(current.transcript_version)!==String(guard.inputVersion.transcript_version))throw new WorkflowFailureError('business_rule_rejected','INPUT_VERSION_CHANGED','原文或场景已变化，请重新计算');
}

/** Fence every result mutation, including legacy repository paths, in the same transaction. */
export function fencedPool<T extends {query:any;connect:any}>(pool:T):T{
 return new Proxy(pool,{get(target,key){
  if(key==='connect')return async()=>{
   const client=await target.connect();const raw=client.query.bind(client);let guarded=false,inputChecked=false;
   return new Proxy(client,{get(c,k){if(k!=='query')return typeof c[k]==='function'?c[k].bind(c):c[k];return async(sql:any,...args:any[])=>{
    const command=typeof sql==='string'?sql.trim().toLowerCase():'';
    if(command==='begin'){const r=await raw(sql,...args);try{await assertExecutionFence({query:raw});await assertInputVersion({query:raw});guarded=true;inputChecked=true;return r;}catch(e){await raw('rollback');throw e;}}
    if(command==='commit'&&guarded){const g=getExecutionGuard();if(g){const r=await raw("select id from workflow_runs where id=$1 and fencing_token=$2 and (lease_until>clock_timestamp() or status<>'running')",[g.runId,g.token]);if(!r.rows[0]){await raw('rollback');throw new Error('工作流租约已失效，提交被拒绝');}}}
    if(!inputChecked&&/\b(insert into|update|delete from)\s+(transcript_segments|lesson_sections|classroom_metrics|classroom_events|evidence_cards|reports)\b/i.test(command)){await assertInputVersion({query:raw});inputChecked=true;}
    return raw(sql,...args);
   };}});
  };
  if(key==='query')return async(sql:any,...args:any[])=>{
   if(!getExecutionGuard()||typeof sql!=='string'||!/^\s*(insert|update|delete|with)\b/i.test(sql))return target.query(sql,...args);
   const client=await target.connect();try{await client.query('begin');await assertExecutionFence(client);if(/\b(insert into|update|delete from)\s+(transcript_segments|lesson_sections|classroom_metrics|classroom_events|evidence_cards|reports)\b/i.test(sql))await assertInputVersion(client);const r=await client.query(sql,...args);await assertCommitFence(client);await client.query('commit');return r;}catch(e){await client.query('rollback');throw e;}finally{client.release();}
  };
  const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
 }});
}
