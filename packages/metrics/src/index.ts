export function calculateSpeechRate(segments: Array<{ startMs?: number; endMs?: number; text?: string }>) {
  const totalChars = segments.reduce((sum, segment) => sum + (segment.text?.length || 0), 0);
  const startMs = Math.min(...segments.map((segment) => segment.startMs ?? 0), 0);
  const endMs = Math.max(...segments.map((segment) => segment.endMs ?? 0), 0);
  const minutes = Math.max((endMs - startMs) / 60000, 1);
  return { value: totalChars / minutes, unit: "chars_per_minute" };
}
