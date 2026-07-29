import type { TranslationProvider } from "../types";
import { createConfiguredLlmProvider } from "../llm/openai-compatible-llm";

export function createConfiguredTranslationProvider(): TranslationProvider {
  const llm = createConfiguredLlmProvider();
  return {
    async translate(input: { text: string; sourceLanguage?: string; targetLanguage: string }) {
      const result = await llm.generateJson<{ translatedText?: string }>({
        promptVersion: "translation.v0",
        payload: input
      });
      return String(result.translatedText || "");
    }
  };
}
