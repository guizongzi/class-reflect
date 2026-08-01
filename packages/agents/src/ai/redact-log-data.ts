type LogOptions = {
  includeBody: boolean;
  maxStringLength?: number;
  maxArrayLength?: number;
};

const sensitiveKey = /(api[-_]?key|authorization|cookie|password|access[-_]?token|refresh[-_]?token|secret|credential|student.?name|student.?contact|contact.?phone|email|phone|mobile)/i;
const binaryKey = /(^|[_-])(raw_)?(video|audio|file)(content|data)?$|base64|binary|buffer|blob|bytes/i;
const bodyKey = /^(text|content|prompt|instruction|rawOutput|parsedOutput|output)$/i;

export function prepareAgentLogData(value: unknown, options: LogOptions, depth = 0): unknown {
  if (typeof value === "string") return prepareString(value, options, false);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 8) return { truncated: true, reason: "max_depth" };

  if (Array.isArray(value)) {
    const maxArrayLength = options.maxArrayLength ?? 30;
    if (value.length <= maxArrayLength) {
      return value.map((item) => prepareAgentLogData(item, options, depth + 1));
    }
    const headSize = Math.ceil(maxArrayLength / 2);
    const tailSize = Math.floor(maxArrayLength / 2);
    return {
      items: [
        ...value.slice(0, headSize).map((item) => prepareAgentLogData(item, options, depth + 1)),
        ...value.slice(-tailSize).map((item) => prepareAgentLogData(item, options, depth + 1))
      ],
      truncated: true,
      originalLength: value.length
    };
  }

  const candidate = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(candidate)) {
    if (sensitiveKey.test(key) || binaryKey.test(key)) {
      result[key] = "[REDACTED]";
    } else if (bodyKey.test(key)) {
      result[key] = typeof item === "string"
        ? prepareString(item, options, true)
        : options.includeBody
          ? prepareAgentLogData(item, options, depth + 1)
          : summarizeOmittedValue(item);
    } else {
      result[key] = prepareAgentLogData(item, options, depth + 1);
    }
  }
  return result;
}

function prepareString(value: string, options: LogOptions, isBody: boolean) {
  if (isBody && !options.includeBody) {
    return { omitted: true, originalLength: value.length };
  }
  const redactedValue = redactSensitiveText(value);
  const maxStringLength = options.maxStringLength ?? 2_000;
  if (redactedValue.length <= maxStringLength) return redactedValue;
  const half = Math.floor(maxStringLength / 2);
  return {
    preview: `${redactedValue.slice(0, half)}...${redactedValue.slice(-half)}`,
    truncated: true,
    originalLength: value.length
  };
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)1\d{10}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/((?:学生)?姓名|联系方式|联系电话|电话|手机号|微信|邮箱)\s*[:：]\s*[^，。；;\s]+/g, "$1：[REDACTED]");
}

function summarizeOmittedValue(value: unknown) {
  if (typeof value === "string") return { omitted: true, originalLength: value.length };
  if (Array.isArray(value)) return { omitted: true, originalLength: value.length };
  if (value && typeof value === "object") return { omitted: true, keys: Object.keys(value as Record<string, unknown>).slice(0, 20) };
  return { omitted: true };
}
