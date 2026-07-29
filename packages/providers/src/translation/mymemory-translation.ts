import { loadAppConfig } from "@class-reflect/config";
import type { TranslationProvider } from "../types";

export function createMyMemoryTranslationProvider(): TranslationProvider {
  return {
    async translate(input: { text: string; sourceLanguage?: string; targetLanguage: string }) {
      const text = input.text.trim();
      if (!text) return "";

      const config = loadAppConfig();
      const sourceLanguage = normalizeLanguage(input.sourceLanguage || "en");
      const targetLanguage = normalizeLanguage(input.targetLanguage || "zh-CN");
      const url = new URL("https://api.mymemory.translated.net/get");
      url.searchParams.set("q", text);
      url.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);
      if (config.myMemoryEmail) url.searchParams.set("de", config.myMemoryEmail);

      const response = await fetch(url);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`免费翻译接口请求失败 ${response.status}`);
      }

      const translated = body?.responseData?.translatedText;
      if (!translated) {
        throw new Error(body?.responseDetails || "免费翻译接口没有返回译文");
      }
      return String(translated).trim();
    }
  };
}

function normalizeLanguage(language: string) {
  return {
    zh: "zh-CN",
    cn: "zh-CN",
    chinese: "zh-CN",
    en: "en",
    english: "en"
  }[language.toLowerCase()] || language;
}
