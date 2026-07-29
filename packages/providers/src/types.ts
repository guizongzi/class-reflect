export interface ObjectStorageProvider {
  createUploadUrl(input: { objectKey: string; contentType: string }): Promise<string>;
  createReadUrl(input: { objectKey: string; expiresInSeconds?: number }): Promise<string>;
}

export interface AsrProvider {
  transcribe(input: { audioUrl: string }): Promise<Array<{
    startMs: number;
    endMs: number;
    text: string;
    speakerId?: string | number | null;
    speakerLabel?: string;
    sourceMeta?: Record<string, unknown>;
  }>>;
}

export interface LlmProvider {
  generateJson<T>(input: { promptVersion: string; payload: unknown }): Promise<T>;
}

export interface TranslationProvider {
  translate(input: { text: string; sourceLanguage?: string; targetLanguage: string }): Promise<string>;
}
