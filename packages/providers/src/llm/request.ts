import {getWorkflowConfig} from '@class-reflect/config';
import {WorkflowFailureError,parseRetryAfter} from '@class-reflect/shared-types';
/** Timeout covers headers and body; raw provider error bodies never enter logs. */
export async function fetchLlmJson(url:string,init:RequestInit):Promise<any>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),getWorkflowConfig().llm.timeoutMs);
 try{const response=await fetch(url,{...init,signal:controller.signal});
 if(!response.ok)throw new WorkflowFailureError(response.status===429||response.status>=500?'provider_transient':'provider_permanent',`PROVIDER_HTTP_${response.status}`,'模型服务请求失败',{status:response.status,retryAfterMs:parseRetryAfter(response.headers.get('retry-after'))});
 try{return await response.json();}catch(error){if(controller.signal.aborted)throw new WorkflowFailureError('provider_transient','PROVIDER_TIMEOUT','模型服务超时');throw new WorkflowFailureError('schema_invalid','PROVIDER_JSON_INVALID','模型服务响应格式错误');}
 }catch(error){if(controller.signal.aborted)throw new WorkflowFailureError('provider_transient','PROVIDER_TIMEOUT','模型服务超时');if(error instanceof WorkflowFailureError)throw error;throw new WorkflowFailureError('provider_transient','PROVIDER_NETWORK','模型服务连接失败');}finally{clearTimeout(timeout);}
}
export function llmResponseFormat(schema:unknown,model:string,endpoint?:string){const c=getWorkflowConfig();if(c.llm.responseFormat==='json_schema'){if(!(c.llm.strictSchemaModels as string[]).includes(model)||!endpoint||!(c.llm.strictSchemaEndpoints as string[]).map(s=>s.replace(/\/+$/,'')).includes(endpoint.replace(/\/+$/,'')))throw new WorkflowFailureError('configuration','STRICT_SCHEMA_UNSUPPORTED','当前模型与服务端点未配置严格结构输出能力');return {type:'json_schema',json_schema:{name:'agent_output',strict:true,schema}};}return {type:'json_object'};}
