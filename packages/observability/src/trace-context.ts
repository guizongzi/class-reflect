import {AsyncLocalStorage} from 'node:async_hooks';
export type TraceContext={traceId:string;runId?:string;attemptId?:string;stepKey?:string};
const storage=new AsyncLocalStorage<TraceContext>();
export function withTraceContext<T>(context:TraceContext,fn:()=>T):T{return storage.run(Object.freeze({...context}),fn);}
export function getTraceContext(){return storage.getStore();}
