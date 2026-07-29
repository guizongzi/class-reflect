import type { TranslationProvider } from "../types";
import { createConfiguredLlmProvider } from "../llm/openai-compatible-llm";
import { loadAppConfig } from "@class-reflect/config";
import { createMockTranslationProvider } from "./mock-translation";
import { createMyMemoryTranslationProvider } from "./mymemory-translation";

export function createConfiguredTranslationProvider(): TranslationProvider {
  const config = loadAppConfig();
  if (config.translationProvider === "llm") return createLlmTranslationProvider();
  if (config.translationProvider === "mock") return createMockTranslationProvider();
  return createMyMemoryTranslationProvider();
}

export function createLlmTranslationProvider(): TranslationProvider {
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
