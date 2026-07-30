export const logger = {
  info(message: string, meta?: unknown) {
    console.log(JSON.stringify({ level: "info", scope: "agents.llm", message, meta }));
  },
  error(message: string, meta?: unknown) {
    console.error(JSON.stringify({ level: "error", scope: "agents.llm", message, meta }));
  }
};
