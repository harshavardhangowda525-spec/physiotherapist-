import { query } from "../db";
import { emailConfig, whatsappConfig } from "../config";
import { sendEmail, type SendResult } from "./email";
import { sendWhatsAppTemplate } from "./whatsapp";
import { staffNewEnquiryText, staffPatientUpdateText, type EnquirySummary } from "./messages";

type Payload =
  | { type: "email"; subject: string; text: string }
  | { type: "whatsapp_template"; template: string | undefined; params: string[] };

export type NotificationRow = {
  id: number;
  enquiry_id: number | null;
  kind: string;
  channel: "email" | "whatsapp";
  recipient: string;
  payload: Payload;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

/** Hook for tests to simulate provider outages. */
export const transport = {
  email: (to: string, subject: string, text: string): Promise<SendResult> => sendEmail(to, subject, text),
  whatsappTemplate: (to: string, template: string | undefined, params: string[]): Promise<SendResult> =>
    sendWhatsAppTemplate(to, template, params),
};

async function insert(enquiryId: number, kind: string, channel: "email" | "whatsapp", recipient: string, payload: Payload) {
  const rows = await query<{ id: number }>(
    `INSERT INTO notifications (enquiry_id, kind, channel, recipient, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [enquiryId, kind, channel, recipient, JSON.stringify(payload)],
  );
  return rows[0].id;
}

/**
 * Queues staff notifications for a new enquiry on every channel. When a channel
 * isn't configured a single "not_configured" row is recorded so staff can see
 * that nobody was alerted through it.
 */
export async function queueNewEnquiryNotifications(enquiryId: number, e: EnquirySummary): Promise<number[]> {
  const ids: number[] = [];
  const text = staffNewEnquiryText(e);
  const email = emailConfig();
  for (const to of email.recipients.length ? email.recipients : ["(no recipients configured)"]) {
    ids.push(await insert(enquiryId, "staff_new_enquiry", "email", to, { type: "email", subject: `New home physiotherapy enquiry ${e.reference}`, text }));
  }
  const wa = whatsappConfig();
  for (const to of wa.staffRecipients.length ? wa.staffRecipients : ["(no recipients configured)"]) {
    ids.push(
      await insert(enquiryId, "staff_new_enquiry", "whatsapp", to, {
        type: "whatsapp_template",
        template: wa.staffAlertTemplate,
        params: [e.reference, e.patient_name, e.contact_number, e.preferred_date, e.preferred_time, e.locality],
      }),
    );
  }
  return ids;
}

export async function queuePatientUpdateNotifications(enquiryId: number, reference: string, request: "cancel" | "reschedule", detail?: string) {
  const ids: number[] = [];
  const email = emailConfig();
  const text = staffPatientUpdateText(reference, request, detail);
  for (const to of email.recipients.length ? email.recipients : ["(no recipients configured)"]) {
    ids.push(await insert(enquiryId, "staff_patient_update", "email", to, { type: "email", subject: `Patient update on ${reference}`, text }));
  }
  return ids;
}

/** Business-initiated status message to a patient — template only, and only if they haven't opted out. */
export async function queuePatientStatusMessage(enquiryId: number, phone: string, reference: string, statusLabel: string) {
  const wa = whatsappConfig();
  const opted = await query(`SELECT 1 FROM whatsapp_optouts WHERE phone = $1`, [phone]);
  const id = await insert(enquiryId, "patient_status_update", "whatsapp", phone, {
    type: "whatsapp_template",
    template: wa.patientStatusTemplate,
    params: [reference, statusLabel],
  });
  if (opted.length) {
    await query(`UPDATE notifications SET status='skipped_opted_out', updated_at=now() WHERE id=$1`, [id]);
    return [];
  }
  return [id];
}

async function deliver(n: NotificationRow): Promise<SendResult> {
  if (n.recipient.startsWith("(")) return { status: "not_configured" };
  if (n.payload.type === "email") return transport.email(n.recipient, n.payload.subject, n.payload.text);
  return transport.whatsappTemplate(n.recipient, n.payload.template, n.payload.params);
}

/** Attempts delivery of the given notifications (or all pending/failed ones). Never throws for provider errors. */
export async function processNotifications(ids?: number[]): Promise<{ sent: number; failed: number; notConfigured: number }> {
  const rows = ids
    ? await query<NotificationRow>(`SELECT * FROM notifications WHERE id = ANY($1::bigint[]) AND status IN ('pending','failed')`, [ids])
    : await query<NotificationRow>(`SELECT * FROM notifications WHERE status IN ('pending','failed') AND attempts < 10 ORDER BY id LIMIT 100`);
  const tally = { sent: 0, failed: 0, notConfigured: 0 };
  for (const n of rows) {
    let result: SendResult;
    try {
      result = await deliver(n);
    } catch (err) {
      result = { status: "failed", error: (err as Error).message };
    }
    if (result.status === "sent") tally.sent++;
    else if (result.status === "failed") tally.failed++;
    else tally.notConfigured++;
    await query(
      `UPDATE notifications SET status=$2, attempts=attempts+1, last_error=$3, provider_message_id=COALESCE($4, provider_message_id), updated_at=now() WHERE id=$1`,
      [n.id, result.status, result.status === "failed" ? result.error : null, result.status === "sent" ? result.providerId ?? null : null],
    );
    if (result.status === "failed") console.error(`[notify] ${n.channel} notification ${n.id} failed: ${result.error}`);
  }
  return tally;
}

/** Retry: re-queues failed or previously unconfigured notifications (e.g. after credentials are added). */
export async function retryNotifications(ids?: number[]) {
  const rows = ids
    ? await query<{ id: number }>(`UPDATE notifications SET status='pending', updated_at=now() WHERE id = ANY($1::bigint[]) AND status IN ('failed','not_configured') RETURNING id`, [ids])
    : await query<{ id: number }>(`UPDATE notifications SET status='pending', updated_at=now() WHERE status IN ('failed','not_configured') RETURNING id`);
  return processNotifications(rows.map((r) => r.id));
}
