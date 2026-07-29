import type { AsrProvider } from "../types";

export function createMockAsrProvider(): AsrProvider {
  return {
    async transcribe() {
      return [
        { startMs: 0, endMs: 9000, speakerLabel: "教师", text: "这是模拟逐字稿。请把 ASR_PROVIDER 设置为 aliyun 后运行真实转写。" }
      ];
    }
  };
}
