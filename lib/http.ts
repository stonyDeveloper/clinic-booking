import { NextResponse } from "next/server";

/** Success shape. */
export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

/**
 * The spec's only error shape: `{ "error": "<message>" }` — never anything
 * extra, never a stack trace.
 */
export function fail(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

/** Reads a JSON body, returning `undefined` when it is not valid JSON. */
export async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
