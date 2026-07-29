export function createLogger(scope: string) {
  return {
    info(message: string, meta?: unknown) {
      console.log(JSON.stringify({ level: "info", scope, message, meta }));
    },
    error(message: string, meta?: unknown) {
      console.error(JSON.stringify({ level: "error", scope, message, meta }));
    }
  };
}
