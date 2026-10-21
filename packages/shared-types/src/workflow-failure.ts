export type WorkflowFailureKind='schema_invalid'|'business_rule_rejected'|'provider_transient'|'provider_permanent'|'configuration'|'internal';
export type WorkflowFailure={kind:WorkflowFailureKind;code:string;safeMessage:string;retryable:boolean;traceId?:string;runId?:string;stepKey?:string;attempt:number;status?:number;retryAfterMs?:number};
export class WorkflowFailureError extends Error {constructor(public kind:WorkflowFailureKind,public code:string,public safeMessage:string,public meta:{status?:number;retryAfterMs?:number}={}){super(safeMessage);this.name='WorkflowFailureError';}}
export function classifyWorkflowFailure(error:unknown,context:Partial<Pick<WorkflowFailure,'traceId'|'runId'|'stepKey'|'attempt'>>={}):WorkflowFailure{
 const e=error as any;let kind:WorkflowFailureKind='internal',code='INTERNAL',safeMessage='工作流内部失败';
 if(error instanceof WorkflowFailureError){kind=error.kind;code=error.code;safeMessage=error.safeMessage;}
 else if(e?.name==='AbortError'||e?.name==='TimeoutError'){kind='provider_transient';code='PROVIDER_TIMEOUT';safeMessage='模型服务超时';}
 else if(Number.isInteger(e?.status)){kind=e.status===429||e.status>=500?'provider_transient':'provider_permanent';code=`PROVIDER_HTTP_${e.status}`;safeMessage='模型服务请求失败';}
 const status=error instanceof WorkflowFailureError?error.meta.status:e?.status;const retryAfterMs=error instanceof WorkflowFailureError?error.meta.retryAfterMs:e?.retryAfterMs;
 return {...context,attempt:context.attempt??1,kind,code,safeMessage,retryable:kind==='schema_invalid'||kind==='provider_transient',...(Number.isFinite(status)?{status}:{}),...(Number.isFinite(retryAfterMs)&&retryAfterMs>=0?{retryAfterMs}:{})};
}
export type FailurePolicy={schemaRetries:number;providerRetries:number;baseDelayMs:number;maxDelayMs:number};
export type FailureDecision={action:'retry'|'quarantine'|'human_review'|'fail';delayMs:number;priority?:'high'};
export function routeWorkflowFailure(failure:WorkflowFailure,policy:FailurePolicy):FailureDecision{
 if(failure.kind==='business_rule_rejected')return {action:'human_review',delayMs:0,priority:'high'};
 if(failure.kind==='schema_invalid')return {action:failure.attempt<=policy.schemaRetries?'retry':'quarantine',delayMs:0};
 if(failure.kind==='provider_transient'&&failure.attempt<=policy.providerRetries)return {action:'retry',delayMs:Math.max(failure.retryAfterMs||0,Math.min(policy.maxDelayMs,policy.baseDelayMs*2**Math.min(failure.attempt-1,20)))};
 return {action:'fail',delayMs:0};
}
export function parseRetryAfter(value:string|null,now=Date.now()):number|undefined{if(!value)return undefined;const seconds=Number(value);if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):undefined;}
