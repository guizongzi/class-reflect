import assert from "node:assert/strict";
import test from "node:test";
import { prepareAgentLogData } from "./redact-log-data";

test("agent debug logs redact secrets and omit transcript bodies by default", () => {
  const result = prepareAgentLogData({
    Authorization: "Bearer should-not-appear",
    apiKey: "should-not-appear",
    transcriptSegments: [{ id: "segment-1", text: "课堂逐字稿正文" }]
  }, { includeBody: false });

  assert.deepEqual(result, {
    Authorization: "[REDACTED]",
    apiKey: "[REDACTED]",
    transcriptSegments: [{ id: "segment-1", text: { omitted: true, originalLength: 7 } }]
  });
});

test("agent debug logs truncate long body fields when body logging is enabled", () => {
  const value = "a".repeat(2_500);
  const result = prepareAgentLogData({ prompt: value }, { includeBody: true, maxStringLength: 2_000 });

  assert.deepEqual(result, {
    prompt: {
      preview: `${"a".repeat(1_000)}...${"a".repeat(1_000)}`,
      truncated: true,
      originalLength: 2_500
    }
  });
});

test("agent debug logs always redact student identifiers even when body logging is enabled", () => {
  const result = prepareAgentLogData({
    studentName: "张三",
    contactPhone: "13800138000",
    text: "学生姓名：张三，联系电话 13800138000，邮箱 test@example.com"
  }, { includeBody: true });

  assert.deepEqual(result, {
    studentName: "[REDACTED]",
    contactPhone: "[REDACTED]",
    text: "学生姓名：[REDACTED]，联系电话 [REDACTED_PHONE]，邮箱 [REDACTED_EMAIL]"
  });
});
