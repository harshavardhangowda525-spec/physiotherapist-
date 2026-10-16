import crypto from "node:crypto";
import { whatsappConfig } from "../config";
import type { SendResult } from "./email";

async function callGraph(body: Record<string, unknown>): Promise<SendResult> {
  const cfg = whatsappConfig();
  if (!cfg.configured) return { status: "not_configured" };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) return { status: "failed", error: `HTTP ${res.status}: ${json.error?.message ?? "unknown error"}`.slice(0, 500) };
    return { status: "sent", providerId: json.messages?.[0]?.id };
  } catch (err) {
    return { status: "failed", error: (err as Error).message.slice(0, 500) };
  }
}

/** Phone in E.164 (+91...) → WhatsApp recipient format (digits only). */
const waId = (phone: string) => phone.replace(/\D/g, "");

/** Free-form reply. Only valid inside the 24-hour customer-service window (i.e. replying to an inbound message). */
export function sendWhatsAppText(to: string, text: string): Promise<SendResult> {
  return callGraph({ to: waId(to), type: "text", text: { body: text.slice(0, 4000), preview_url: false } });
}

/** Business-initiated message: must use a pre-approved template. */
export function sendWhatsAppTemplate(to: string, template: string | undefined, params: string[]): Promise<SendResult> {
  const cfg = whatsappConfig();
  if (!cfg.configured || !template) return Promise.resolve({ status: "not_configured" });
  return callGraph({
    to: waId(to),
    type: "template",
    template: {
      name: template,
      language: { code: cfg.templateLanguage },
      components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p.slice(0, 1000) })) }],
    },
  });
}

/** Verifies Meta's X-Hub-Signature-256 header using the app secret (timing-safe). */
export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}
