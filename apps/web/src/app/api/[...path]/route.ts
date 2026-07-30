import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const hopByHopHeaders = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function getApiBaseUrl() {
  return (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
}

async function proxyToApi(request: Request, context: RouteContext) {
  const params = await context.params;
  const path = (params.path || []).map(encodeURIComponent).join("/");
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path}${requestUrl.search}`, getApiBaseUrl());

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual"
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const apiResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers();
  apiResponse.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(apiResponse.body, {
    status: apiResponse.status,
    statusText: apiResponse.statusText,
    headers: responseHeaders
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export const GET = proxyToApi;
export const POST = proxyToApi;
export const PATCH = proxyToApi;
export const PUT = proxyToApi;
export const DELETE = proxyToApi;
