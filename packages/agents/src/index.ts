export type AgentResult<T> = {
  output: T;
  promptVersion: string;
  warnings: string[];
};

export function runTranscriptNormalizer<T>(segments: T[]): AgentResult<T[]> {
  return {
    output: segments,
    promptVersion: "transcript-normalizer.v0",
    warnings: []
  };
}
