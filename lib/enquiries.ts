import crypto from "node:crypto";
import { query, withTransaction } from "./db";
import { CONSENT_TEXT } from "./business";
import { enquiryInputSchema, type EnquiryInput } from "./validation";
import type { EnquiryStatus, TherapistPreference } from "./status";
import { STATUS_LABELS } from "./status";
import { processNotifications, queueNewEnquiryNotifications, queuePatientStatusMessage, queuePatientUpdateNotifications } from "./notify/outbox";

export type Enquiry = {
  id: number;
  reference: string;
  patient_name: string;
  contact_number: string;
  preferred_date: string;
  preferred_time: string;
  locality: string;
  service_requirement: string;
  therapist_preference: TherapistPreference;
  consent_at: string;
  source: "website" | "whatsapp" | "staff";
  status: EnquiryStatus;
  urgent_flag: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT = `SELECT id, reference, patient_name, contact_number, to_char(preferred_date,'YYYY-MM-DD') AS preferred_date,
  preferred_time, locality, service_requirement, therapist_preference, consent_at, source, status, urgent_flag, created_at, updated_at
  FROM enquiries`;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateReference(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "2-digit", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/-/g, "");
  const bytes = crypto.randomBytes(5);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `PT-${ymd}-${suffix}`;
}

export class ValidationError extends Error {
  constructor(public issues: { field: string; message: string }[]) {
    super("Invalid enquiry");
    this.name = "ValidationError";
  }
}

export type CreateResult = { enquiry: Enquiry; notifications: { sent: number; failed: number; notConfigured: number } };

/**
 * Validate → persist → reference → queue + attempt notifications.
 * The enquiry is committed before any notification is attempted, so a
 * provider outage can never lose a request.
 */
export async function createEnquiry(input: EnquiryInput): Promise<CreateResult> {
  const parsed = enquiryInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? ""), message: i.message })));
  }
  const v = parsed.data;
  const enquiry = await withTransaction(async (c) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = generateReference();
      const res = await c.query<Enquiry>(
        `INSERT INTO enquiries (reference, patient_name, contact_number, preferred_date, preferred_time, locality, service_requirement,
           therapist_preference, consent_at, consent_text, source, urgent_flag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11)
         ON CONFLICT (reference) DO NOTHING
         RETURNING id, reference, patient_name, contact_number, to_char(preferred_date,'YYYY-MM-DD') AS preferred_date, preferred_time, locality,
           service_requirement, therapist_preference, consent_at, source, status, urgent_flag, created_at, updated_at`,
        [ref, v.patientName, v.contactNumber, v.preferredDate, v.preferredTime, v.locality, v.serviceRequirement, v.therapistPreference, CONSENT_TEXT, v.source, v.urgentFlag],
      );
      if (res.rows[0]) {
        await c.query(`INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status, changed_by) VALUES ($1,NULL,'new',$2)`, [res.rows[0].id, `patient:${v.source}`]);
        return res.rows[0];
      }
    }
    throw new Error("Could not allocate a unique reference");
  });

  let notifications = { sent: 0, failed: 0, notConfigured: 0 };
  try {
    const ids = await queueNewEnquiryNotifications(enquiry.id, enquiry);
    notifications = await processNotifications(ids);
  } catch (err) {
    // Enquiry is already saved; failures are visible in the dashboard and retryable.
    console.error(`[enquiry ${enquiry.reference}] notification step failed:`, (err as Error).message);
    notifications.failed++;
  }
  return { enquiry, notifications };
}

/** Status lookup for patients: requires both reference and the phone number used. */
export async function findForPatient(reference: string, phone: string): Promise<Enquiry | null> {
  const rows = await query<Enquiry>(`${SELECT} WHERE reference = $1 AND contact_number = $2`, [reference, phone]);
  return rows[0] ?? null;
}

export async function getEnquiry(id: number): Promise<Enquiry | null> {
  const rows = await query<Enquiry>(`${SELECT} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

const TERMINAL: EnquiryStatus[] = ["cancelled", "completed"];

/** Patient-initiated cancel / reschedule. Never changes a confirmed visit silently: staff are notified. */
export async function patientRequestChange(reference: string, phone: string, kind: "cancel" | "reschedule", detail?: string) {
  const e = await findForPatient(reference, phone);
  if (!e) return { ok: false as const, reason: "not_found" as const };
  if (TERMINAL.includes(e.status)) return { ok: false as const, reason: "closed" as const, status: e.status };
  const to: EnquiryStatus = kind === "cancel" ? "cancelled" : "reschedule_requested";
  await withTransaction(async (c) => {
    await c.query(`UPDATE enquiries SET status=$2, updated_at=now() WHERE id=$1`, [e.id, to]);
    await c.query(`INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,'patient')`, [e.id, e.status, to]);
    if (detail) {
      await c.query(`INSERT INTO enquiry_notes (enquiry_id, author_name, body) VALUES ($1,'Patient (via assistant)',$2)`, [e.id, detail.slice(0, 500)]);
    }
  });
  try {
    await processNotifications(await queuePatientUpdateNotifications(e.id, e.reference, kind, detail));
  } catch (err) {
    console.error("[patient change] notify failed", (err as Error).message);
  }
  return { ok: true as const, status: to };
}

export type ListFilters = { q?: string; status?: string; date?: string; page?: number; pageSize?: number };

export async function listEnquiries(f: ListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    const digits = f.q.replace(/\D/g, "");
    where.push(`(patient_name ILIKE $${params.length} OR reference ILIKE $${params.length}${digits.length >= 4 ? ` OR contact_number LIKE '%' || $${params.push(digits)} || '%'` : ""})`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`status = $${params.length}`);
  }
  if (f.date) {
    params.push(f.date);
    where.push(`preferred_date = $${params.length}::date`);
  }
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await query<Enquiry>(`${SELECT} ${whereSql} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  const total = await query<{ count: string }>(`SELECT count(*) FROM enquiries ${whereSql}`, params);
  return { rows, total: Number(total[0].count), page, pageSize };
}

export async function updateStatus(id: number, to: EnquiryStatus, actor: string, notifyPatient = false) {
  const e = await getEnquiry(id);
  if (!e) return null;
  if (e.status === to) return e;
  await withTransaction(async (c) => {
    await c.query(`UPDATE enquiries SET status=$2, updated_at=now() WHERE id=$1`, [id, to]);
    await c.query(`INSERT INTO enquiry_status_history (enquiry_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,$4)`, [id, e.status, to, actor]);
    await c.query(`INSERT INTO audit_log (actor, action, enquiry_id, details) VALUES ($1,'status_change',$2,$3)`, [actor, id, JSON.stringify({ from: e.status, to })]);
  });
  if (notifyPatient) {
    try {
      await processNotifications(await queuePatientStatusMessage(id, e.contact_number, e.reference, STATUS_LABELS[to]));
    } catch (err) {
      console.error("[status] patient notify failed", (err as Error).message);
    }
  }
  return getEnquiry(id);
}

export async function addNote(id: number, authorId: number, authorName: string, body: string) {
  const rows = await query<{ id: number }>(
    `INSERT INTO enquiry_notes (enquiry_id, author_id, author_name, body) VALUES ($1,$2,$3,$4) RETURNING id`,
    [id, authorId, authorName, body],
  );
  return rows[0];
}

export async function getEnquiryDetail(id: number) {
  const e = await getEnquiry(id);
  if (!e) return null;
  const [notes, history, notifications] = await Promise.all([
    query(`SELECT id, author_name, body, created_at FROM enquiry_notes WHERE enquiry_id=$1 ORDER BY created_at`, [id]),
    query(`SELECT from_status, to_status, changed_by, created_at FROM enquiry_status_history WHERE enquiry_id=$1 ORDER BY created_at`, [id]),
    query(`SELECT id, kind, channel, recipient, status, attempts, last_error, updated_at FROM notifications WHERE enquiry_id=$1 ORDER BY id`, [id]),
  ]);
  return { enquiry: e, notes, history, notifications };
}

export async function getMetrics() {
  const byStatus = await query<{ status: string; count: string }>(`SELECT status, count(*) FROM enquiries GROUP BY status`);
  const recent = await query<{ last7: string; today: string }>(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last7,
            count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS today
     FROM enquiries`,
  );
  const failedNotifications = await query<{ count: string }>(`SELECT count(*) FROM notifications WHERE status = 'failed'`);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
    last7Days: Number(recent[0].last7),
    today: Number(recent[0].today),
    failedNotifications: Number(failedNotifications[0].count),
  };
}

export async function deleteEnquiry(id: number, actor: string) {
  const rows = await query<{ reference: string }>(`DELETE FROM enquiries WHERE id=$1 RETURNING reference`, [id]);
  if (rows[0]) await query(`INSERT INTO audit_log (actor, action, details) VALUES ($1,'delete_enquiry',$2)`, [actor, JSON.stringify({ reference: rows[0].reference })]);
  return Boolean(rows[0]);
}

/** Retention: removes closed enquiries older than `days`. */
export async function purgeOldEnquiries(days: number) {
  const rows = await query<{ id: number }>(
    `DELETE FROM enquiries WHERE status IN ('cancelled','completed') AND updated_at < now() - make_interval(days => $1) RETURNING id`,
    [days],
  );
  await query(`DELETE FROM conversations WHERE updated_at < now() - interval '7 days'`);
  await query(`DELETE FROM processed_webhook_events WHERE received_at < now() - interval '30 days'`);
  await query(`DELETE FROM staff_sessions WHERE expires_at < now()`);
  await query(`INSERT INTO audit_log (actor, action, details) VALUES ('system','retention_purge',$1)`, [JSON.stringify({ days, deleted: rows.length })]);
  return rows.length;
}
