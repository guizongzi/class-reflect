/// <reference types="node" />

import { randomUUID } from "node:crypto";

export function createAgentTraceId(prefix = "agent") {
  return `${prefix}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomUUID().slice(0, 8)}`;
}

export function createAgentRequestId() {
  return `req_${randomUUID().slice(0, 12)}`;
}
