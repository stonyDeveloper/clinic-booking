import { headers } from "next/headers";

/**
 * Server-side calls to our own public API. This is how the page "uses the API"
 * rather than reaching into the database: every read and write the UI performs
 * goes through the same endpoints the grader calls.
 */

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}

function apiKey(): string {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API_KEY is not set");
  return key;
}

export type ApiResult = {
  status: number;
  body: unknown;
  headers: Headers;
};

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<ApiResult> {
  const base = await baseUrl();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { status: res.status, body, headers: res.headers };
}
