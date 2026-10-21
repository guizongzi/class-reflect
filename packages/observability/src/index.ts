import {getTraceContext} from './trace-context';
export {withTraceContext,getTraceContext,type TraceContext} from './trace-context';
export function createLogger(scope: string) {
  return {
    info(message: string, meta?: unknown) {
      console.log(JSON.stringify({ level: "info", scope, message, timestamp:new Date().toISOString(), ...getTraceContext(), meta }));
    },
    error(message: string, meta?: unknown) {
      console.error(JSON.stringify({ level: "error", scope, message, timestamp:new Date().toISOString(), ...getTraceContext(), meta }));
    }
  };
}
