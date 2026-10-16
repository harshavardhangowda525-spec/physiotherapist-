import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import { DatabaseUnavailableError } from "./db";
import { ValidationError } from "./enquiries";

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ValidationError) return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  if (err instanceof DatabaseUnavailableError) {
    console.error("[api] database unavailable", (err as { cause?: Error }).cause?.message);
    return NextResponse.json({ error: "Service temporarily unavailable. Please call the clinic on 077158 77047." }, { status: 503 });
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export const tooMany = (retryAfterSec: number) =>
  NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
