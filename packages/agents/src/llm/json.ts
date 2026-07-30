export function parseJsonObject(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回内容不是 JSON");
    return JSON.parse(match[0]);
  }
}
