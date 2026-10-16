import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await checkDatabase();
  return NextResponse.json({ ok: db.ok, database: db.ok ? "ok" : "unavailable" }, { status: db.ok ? 200 : 503 });
}
