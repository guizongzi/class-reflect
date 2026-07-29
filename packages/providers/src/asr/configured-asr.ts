import { loadAppConfig } from "@class-reflect/config";
import type { AsrProvider } from "../types";
import { createAliyunAsrProvider } from "./aliyun-asr";
import { createMockAsrProvider } from "./mock-asr";

export function createConfiguredAsrProvider(): AsrProvider {
  const config = loadAppConfig();
  if (config.asrProvider === "aliyun") return createAliyunAsrProvider();
  return createMockAsrProvider();
}
