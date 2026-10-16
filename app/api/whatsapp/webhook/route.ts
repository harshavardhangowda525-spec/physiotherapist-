import { NextResponse } from "next/server";
import { whatsappConfig } from "@/lib/config";
import { verifyWhatsAppSignature } from "@/lib/notify/whatsapp";
import { handleWhatsAppPayload, type WaPayload } from "@/lib/whatsappInbound";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { tooMany } from "@/lib/http";

export const dynamic = "force-dynamic";

const NOT_CONFIGURED = { error: "WhatsApp integration is not configured on this server (test mode)." };

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const cfg = whatsappConfig();
  if (!cfg.configured) return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  const url = new URL(req.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === cfg.verifyToken) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const rl = rateLimit(`wa:${clientIp(req)}`, 600, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const cfg = whatsappConfig();
  if (!cfg.configured) return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  const raw = await req.text();
  if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: WaPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await handleWhatsAppPayload(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Non-2xx makes Meta retry; duplicates are de-duplicated by event id.
    console.error("[whatsapp] processing failed", (err as Error).message);
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
}
