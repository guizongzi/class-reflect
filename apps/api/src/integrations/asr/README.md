# ASR integration

放语音识别供应商适配。

统一输出格式应接近：

```ts
{
  startMs: number;
  endMs: number;
  speakerLabel: string;
  originalText: string;
  translatedText?: string | null;
  confidence?: number | null;
  sourceMeta?: unknown;
}
```

后续换 `qwen3-asr`、`fun-asr` 或其他云 ASR 时，application 和 domain 不应改动。
