import type { TranslationProvider } from "../types";

export function createMockTranslationProvider(): TranslationProvider {
  return {
    async translate(input: { text: string; targetLanguage: string }) {
      return `[模拟${input.targetLanguage}译文] ${input.text}`;
    }
  };
}
