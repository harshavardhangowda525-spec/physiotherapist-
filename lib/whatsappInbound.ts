import { query } from "./db";
import { whatsappConfig } from "./config";
import { converse } from "./chatService";
import { normalizePhone } from "./validation";
import { sendWhatsAppText } from "./notify/whatsapp";
import type { Turn } from "./conversation";

type WaMessage = { id: string; from: string; type: string; text?: { body: string }; interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }; button?: { text: string } };
type WaStatus = { id: string; status: "sent" | "delivered" | "read" | "failed"; errors?: { code: number; title: string }[] };
export type WaPayload = { object?: string; entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[] };

/** Records an event id; returns false if it was already processed (duplicate delivery). */
export async function markProcessed(eventId: string): Promise<boolean> {
  const rows = await query(`INSERT INTO processed_webhook_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId]);
  return rows.length > 0;
}

/** Formats an engine turn as WhatsApp text (quick replies become numbered options). */
export function turnToWhatsApp(t: Turn): { text: string; options: string[] } {
  const options = t.quickReplies.map((q) => q.value);
  const lines = t.messages.map((m) => m.text);
  if (t.quickReplies.length) lines.push("", ...t.quickReplies.map((q, i) => `${i + 1}. ${q.label}`), "", "Reply with a number or type your answer.");
  return { text: lines.join("\n"), options };
}

export type InboundResult = { processed: number; duplicates: number; statusUpdates: number };

export async function handleWhatsAppPayload(payload: WaPayload, send = sendWhatsAppText): Promise<InboundResult> {
  const out: InboundResult = { processed: 0, duplicates: 0, statusUpdates: 0 };
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const st of value.statuses ?? []) {
        if (!(await markProcessed(`status:${st.id}:${st.status}`))) { out.duplicates++; continue; }
        await query(`UPDATE notifications SET status=$2, last_error=$3, updated_at=now() WHERE provider_message_id=$1`, [
          st.id, st.status, st.status === "failed" ? (st.errors?.map((e) => `${e.code} ${e.title}`).join("; ") ?? "failed") : null,
        ]);
        out.statusUpdates++;
      }
      for (const msg of value.messages ?? []) {
        if (!(await markProcessed(`msg:${msg.id}`))) { out.duplicates++; continue; }
        const phone = normalizePhone(msg.from) ?? "+" + msg.from.replace(/\D/g, "");
        const text = (msg.text?.body ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? msg.button?.text ?? "").trim();
        const upper = text.toUpperCase();
        if (upper === "STOP" || upper === "UNSUBSCRIBE") {
          await query(`INSERT INTO whatsapp_optouts (phone) VALUES ($1) ON CONFLICT DO NOTHING`, [phone]);
          await send(phone, "You've been unsubscribed from WhatsApp updates from Physiotherapy Treatment at Home. Reply START to receive messages again.");
          out.processed++;
          continue;
        }
        if (upper === "START") {
          await query(`DELETE FROM whatsapp_optouts WHERE phone=$1`, [phone]);
        }
        if (!text) {
          await send(phone, "Sorry, I can only read text messages. Please type your message, or call 077158 77047.");
          out.processed++;
          continue;
        }
        const convId = `wa:${phone}`;
        // Map numbered replies to the options we last offered.
        const prev = await query<{ state: { waOptions?: string[] } }>(`SELECT state FROM conversations WHERE id=$1`, [convId]);
        const options = prev[0]?.state?.waOptions ?? [];
        const n = Number(text);
        const input = Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : upper === "START" ? "start" : text;
        let t: Turn;
        try {
          t = await converse(convId, "whatsapp", input);
        } catch (err) {
          // Allow Meta's retry of this event to be processed again.
          await query(`DELETE FROM processed_webhook_events WHERE event_id=$1`, [`msg:${msg.id}`]).catch(() => {});
          throw err;
        }
        const wa = turnToWhatsApp(t);
        await query(`UPDATE conversations SET state = state || jsonb_build_object('waOptions', $2::jsonb) WHERE id=$1`, [convId, JSON.stringify(wa.options)]);
        const res = await send(phone, wa.text);
        if (res.status !== "sent") console.error(`[whatsapp] reply to ${msg.id} not sent: ${res.status === "failed" ? res.error : res.status}`);
        out.processed++;
      }
    }
  }
  return out;
}

export function whatsappReady() {
  return whatsappConfig().configured;
}
