import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processNotifications } from "@/lib/notify/outbox";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Scheduled retry of pending/failed notifications. Call with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processNotifications());
  } catch (err) {
    return errorResponse(err);
  }
}
