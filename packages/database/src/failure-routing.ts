import {randomUUID} from 'node:crypto';
import {routeWorkflowFailure,WorkflowFailureError,type WorkflowFailure,type FailurePolicy} from '@class-reflect/shared-types';
import type {SqlClient} from './step-execution';
type CircuitPolicy=FailurePolicy&{circuitThreshold:number;circuitOpenMs:number};
export type ProviderProbe={epoch:number;probeToken:string|null};
export async function acquireProviderProbe(db:SqlClient,key:string,probeMs:number):Promise<ProviderProbe>{
 const r=await db.query(`insert into provider_circuits(provider_key,probe_until) values($1,null)
 on conflict(provider_key) do update set probe_until=case when provider_circuits.open_until is not null then clock_timestamp()+$2*interval '1 millisecond' else null end,
 probe_token=case when provider_circuits.open_until is not null then $3::uuid else null end
 where (provider_circuits.open_until is null or provider_circuits.open_until<=clock_timestamp()) and (provider_circuits.probe_until is null or provider_circuits.probe_until<=clock_timestamp()) returning provider_key,epoch,probe_token`,[key,probeMs,randomUUID()]);
 if(!r.rows.length)throw new WorkflowFailureError('provider_transient','CIRCUIT_OPEN','模型服务熔断中，任务稍后重试',{retryAfterMs:probeMs});
 return {epoch:Number(r.rows[0].epoch),probeToken:r.rows[0].probe_token??null};
}
export async function resetProviderCircuit(db:SqlClient,key:string,probe:ProviderProbe){
 if(!probe || !Number.isInteger(probe.epoch))return false;
 const r=await db.query(`update provider_circuits set failure_count=0,open_until=null,probe_until=null,probe_token=null,epoch=epoch+1,updated_at=clock_timestamp()
 where provider_key=$1 and epoch=$2 and probe_token is not distinct from $3::uuid
 and (probe_token is null or probe_until>clock_timestamp()) returning provider_key`,[key,probe.epoch,probe.probeToken]);
 return !!r.rows.length;
}
/** Caller owns transaction; authorization precedes all audit, queue and circuit mutations. */
export async function recordWorkflowFailure(db:SqlClient,failure:WorkflowFailure,policy:CircuitPolicy,providerKey:string,executionToken?:number,providerProbe?:ProviderProbe){
 if(!failure.runId || !Number.isInteger(executionToken) || (executionToken as number)<1)throw new Error('缺少有效执行令牌，拒绝失败路由写入');
 const active=await db.query(`select id from workflow_runs where id=$1 and fencing_token=$2 and status='running' and lease_until>clock_timestamp() for update`,[failure.runId,executionToken]);
 if(!active.rows.length)throw new Error('工作流执行令牌失效，拒绝旧任务失败写入');
 const decision=routeWorkflowFailure(failure,policy);
 const r=await db.query(`insert into workflow_failures(trace_id,workflow_run_id,step_key,attempt,kind,code,safe_message,disposition,retry_at) values($1,$2,$3,$4,$5,$6,$7,$8,case when $8='retry' then clock_timestamp()+$9*interval '1 millisecond' else null end) returning id`,[failure.traceId||null,failure.runId,failure.stepKey||null,failure.attempt,failure.kind,failure.code,failure.safeMessage,decision.action,decision.delayMs]);
 if(failure.kind==='provider_transient'&&failure.code!=='CIRCUIT_OPEN'){
  if(providerProbe?.probeToken){
   await db.query(`update provider_circuits set failure_count=failure_count+1,epoch=epoch+1,probe_until=null,probe_token=null,
   open_until=case when failure_count+1>=$2 or open_until is not null then clock_timestamp()+$3*interval '1 millisecond' else null end,updated_at=clock_timestamp()
   where provider_key=$1 and epoch=$4 and probe_token is not distinct from $5::uuid
   and (probe_token is null or probe_until>clock_timestamp())`,[providerKey,policy.circuitThreshold,Math.max(policy.circuitOpenMs,failure.retryAfterMs||0),providerProbe.epoch,providerProbe.probeToken]);
  }else{
   await db.query(`insert into provider_circuits(provider_key,failure_count,open_until,epoch) values($1,1,case when 1>=$2 then clock_timestamp()+$3*interval '1 millisecond' else null end,1)
   on conflict(provider_key) do update set failure_count=provider_circuits.failure_count+1,epoch=provider_circuits.epoch+1,probe_until=null,probe_token=null,open_until=case when provider_circuits.failure_count+1>=$2 then clock_timestamp()+$3*interval '1 millisecond' else null end,updated_at=clock_timestamp()`,[providerKey,policy.circuitThreshold,Math.max(policy.circuitOpenMs,failure.retryAfterMs||0)]);
  }
 }
 if(decision.action==='human_review')await db.query('insert into workflow_review_queue(failure_id,trace_id,workflow_run_id,priority) values($1,$2,$3,10)',[r.rows[0].id,failure.traceId||null,failure.runId]);
 const updated=await db.query(`update workflow_runs set status=$2,error_kind=$3,error_message=$4,next_retry_at=case when $2='queued' then greatest(clock_timestamp()+$5*interval '1 millisecond',coalesce((select open_until from provider_circuits where provider_key=$6),clock_timestamp())) else null end,retry_attempt=retry_attempt+1,lease_until=null,locked_by=null,finished_at=case when $2='failed' then clock_timestamp() else null end,updated_at=clock_timestamp()
 where id=$1 and fencing_token=$7 and status='running' and lease_until>clock_timestamp() returning id`,[failure.runId,decision.action==='retry'?'queued':decision.action==='human_review'?'waiting_for_human':'failed',failure.kind,failure.safeMessage,decision.delayMs,providerKey,executionToken]);
 if(!updated.rows.length)throw new Error('工作流执行令牌失效，失败路由事务必须回滚');
 return decision;
}
