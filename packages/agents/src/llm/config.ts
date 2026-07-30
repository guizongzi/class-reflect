export function readAgentLlmConfig() {
  try {
    const raw = process.env.APP_CONFIG_ENV ? JSON.parse(process.env.APP_CONFIG_ENV) : {};
    const baseUrl = process.env.LLM_BASE_URL || raw.LLM_BASE_URL || raw.llm?.baseUrl;
    const apiKey = process.env.LLM_API_KEY || raw.LLM_API_KEY || raw.llm?.apiKey;
    const model = process.env.LLM_MODEL || raw.LLM_MODEL || raw.llm?.model;

    if (!baseUrl || !apiKey || !model) {
      return null;
    }

    return { baseUrl: String(baseUrl), apiKey: String(apiKey), model: String(model) };
  } catch {
    return null;
  }
}

export function trimSlash(value: string) {
  return String(value || "").replace(/\/+$/, "");
}
