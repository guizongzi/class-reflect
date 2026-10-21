import type {StepLease} from '@class-reflect/database';
import type {ProcessorResult} from '../processors/types';
export type StepDependencies={claim():Promise<StepLease|null>;cached():Promise<ProcessorResult|null>;renew():Promise<boolean>;complete(lease:StepLease,result:ProcessorResult):Promise<boolean>};
export async function executeStep(deps:StepDependencies,processor:(lease:StepLease)=>Promise<ProcessorResult>,heartbeatMs:number):Promise<ProcessorResult>{
 const lease=await deps.claim();if(!lease){const cached=await deps.cached();if(cached)return cached;throw new Error('步骤正在执行或租约已失效');}
 let lost=false,pending=false;
 const timer=setInterval(()=>{if(pending)return;pending=true;deps.renew().then(ok=>{if(!ok)lost=true;}).catch(()=>{lost=true;}).finally(()=>{pending=false;});},heartbeatMs);
 timer.unref();
 try{const result=await processor(lease);if(lost||!await deps.complete(lease,result))throw new Error('工作流租约已失效，结果提交被拒绝');return result;}finally{clearInterval(timer);}
}
