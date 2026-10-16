import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearIntegrationEnv, query, setupDb, validInput, futureDate } from "./helpers";
import { createEnquiry, ValidationError, patientRequestChange, findForPatient, updateStatus } from "@/lib/enquiries";
import { transport, retryNotifications } from "@/lib/notify/outbox";
import { DatabaseUnavailableError, resetPool } from "@/lib/db";
import { hashPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { resetRateLimits } from "@/lib/rateLimit";
import { handleWhatsAppPayload } from "@/lib/whatsappInbound";
import { converse } from "@/lib/chatService";
import * as enquiriesRoute from "@/app/api/staff/enquiries/route";
import * as exportRoute from "@/app/api/staff/export/route";
import * as detailRoute from "@/app/api/staff/enquiries/[id]/route";
import * as webhookRoute from "@/app/api/whatsapp/webhook/route";
import * as chatRoute from "@/app/api/chat/route";
import * as loginRoute from "@/app/api/staff/login/route";

const realEmail = transport.email;
const realWa = transport.whatsappTemplate;

beforeEach(async () => {
  clearIntegrationEnv();
  resetRateLimits();
  transport.email = realEmail;
  transport.whatsappTemplate = realWa;
  await setupDb();
});
afterAll(() => resetPool());

function configureEmail() {
  process.env.SMTP_HOST = "smtp.test.invalid";
  process.env.NOTIFY_FROM_EMAIL = "noreply@test.invalid";
  process.env.STAFF_NOTIFICATION_EMAILS = "staff-a@test.invalid,staff-b@test.invalid";
}

async function staffCookie(role: "admin" | "staff" = "staff") {
  const rows = await query<{ id: number }>(
    `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,'Test Staff',$2,$3) RETURNING id`,
    [`${role}-${crypto.randomUUID()}@test.invalid`, await hashPassword("correct-horse-42"), role],
  );
  const { token } = await createSession(rows[0].id);
  return `${SESSION_COOKIE}=${token}`;
}

describe("enquiry persistence & notifications", () => {
  it("scenario 1: persists a valid enquiry with reference, consent and notification log", async () => {
    configureEmail();
    const sent: string[] = [];
    transport.email = async (to, _s, text) => { sent.push(to + "|" + text); return { status: "sent", providerId: "m1" }; };
    const { enquiry, notifications } = await createEnquiry(validInput());
    expect(enquiry.reference).toMatch(/^PT-\d{6}-[A-Z0-9]{5}$/);
    expect(enquiry.contact_number).toBe("+919876543210");
    expect(enquiry.status).toBe("new");
    expect(notifications.sent).toBe(2);
    expect(sent[0]).toContain("NEW HOME PHYSIOTHERAPY ENQUIRY");
    expect(sent[0]).toContain(`Reference: ${enquiry.reference}`);
    const db = await query(`SELECT consent_at, consent_text FROM enquiries WHERE id=$1`, [enquiry.id]);
    expect(db[0].consent_at).toBeTruthy();
    // WhatsApp is not configured → recorded honestly, not as sent
    const wa = await query(`SELECT status FROM notifications WHERE enquiry_id=$1 AND channel='whatsapp'`, [enquiry.id]);
    expect(wa[0].status).toBe("not_configured");
  });

  it("scenario 2: server-side validation rejects bad input and stores nothing", async () => {
    await expect(createEnquiry({ ...validInput(), contactNumber: "123" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createEnquiry({ ...validInput(), consent: false as unknown as true })).rejects.toBeInstanceOf(ValidationError);
    await expect(createEnquiry({ ...validInput(), preferredDate: "2001-01-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createEnquiry({ ...validInput(), patientName: "" })).rejects.toBeInstanceOf(ValidationError);
    expect((await query(`SELECT count(*)::int AS n FROM enquiries`))[0].n).toBe(0);
  });

  it("scenario 6: notification failure keeps the enquiry and can be retried", async () => {
    configureEmail();
    transport.email = async () => ({ status: "failed", error: "SMTP 421 service unavailable" });
    const { enquiry, notifications } = await createEnquiry(validInput());
    expect(notifications.failed).toBe(2);
    expect(await findForPatient(enquiry.reference, "+919876543210")).not.toBeNull();
    const failed = await query(`SELECT id, last_error, attempts FROM notifications WHERE status='failed'`);
    expect(failed).toHaveLength(2);
    expect(failed[0].last_error).toContain("SMTP 421");
    transport.email = async () => ({ status: "sent", providerId: "ok" });
    const r = await retryNotifications(failed.map((f) => f.id));
    expect(r.sent).toBe(2);
    expect((await query(`SELECT count(*)::int AS n FROM notifications WHERE status='sent'`))[0].n).toBe(2);
  });

  it("scenario 6b: a thrown provider error is also contained", async () => {
    configureEmail();
    transport.email = async () => { throw new Error("socket hang up"); };
    const { enquiry } = await createEnquiry(validInput());
    expect(enquiry.id).toBeGreaterThan(0);
    expect((await query(`SELECT count(*)::int AS n FROM notifications WHERE status='failed'`))[0].n).toBe(2);
  });

  it("scenario 7: patient cancellation / reschedule updates status, notes and notifies staff", async () => {
    configureEmail();
    transport.email = async () => ({ status: "sent" });
    const { enquiry } = await createEnquiry(validInput());
    expect((await patientRequestChange(enquiry.reference, "+919999999999", "cancel")).ok).toBe(false); // wrong phone
    const r = await patientRequestChange(enquiry.reference, "+919876543210", "reschedule", "Monday evening instead");
    expect(r).toEqual({ ok: true, status: "reschedule_requested" });
    const notes = await query(`SELECT body FROM enquiry_notes WHERE enquiry_id=$1`, [enquiry.id]);
    expect(notes[0].body).toBe("Monday evening instead");
    expect((await query(`SELECT count(*)::int AS n FROM notifications WHERE kind='staff_patient_update'`))[0].n).toBe(2);
    await patientRequestChange(enquiry.reference, "+919876543210", "cancel");
    expect((await patientRequestChange(enquiry.reference, "+919876543210", "cancel")).ok).toBe(false); // already closed
  });

  it("scenario 4: only staff can confirm; status text to patient stays 'not confirmed' until then", async () => {
    const { enquiry } = await createEnquiry(validInput());
    const id = "web:" + "a".repeat(24);
    await converse(id, "website", "menu:status");
    await converse(id, "website", enquiry.reference);
    let t = await converse(id, "website", "9876543210");
    expect(t.messages[0].text).toMatch(/not yet a confirmed appointment/);
    await updateStatus(enquiry.id, "confirmed", "staff@test");
    await converse(id, "website", "menu:status");
    await converse(id, "website", enquiry.reference);
    t = await converse(id, "website", "9876543210");
    expect(t.messages[0].text).toMatch(/confirmed by the clinic team/);
  });

  it("end-to-end via the chat API persists a request", async () => {
    const post = (body: unknown) => chatRoute.POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "1.1.1.1" } }));
    const first = await (await post({ message: "start" })).json();
    const conversationId = first.conversationId;
    for (const m of ["menu:request", "Ravi Kumar", "9123456789", futureDate(4), "10am-12pm", "BTM Layout", "Shoulder pain", "no_preference", "yes"]) {
      await post({ conversationId, message: m });
    }
    const done = await (await post({ conversationId, message: "submit" })).json();
    expect(done.messages[0].text).toContain("This is a request, not a confirmed booking");
    const rows = await query(`SELECT patient_name, source, status FROM enquiries`);
    expect(rows).toEqual([{ patient_name: "Ravi Kumar", source: "website", status: "new" }]);
  });

  it("rate-limits the chat API", async () => {
    process.env.RATE_LIMIT_CHAT_PER_MIN = "3";
    const post = () => chatRoute.POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ message: "start" }), headers: { "x-forwarded-for": "2.2.2.2" } }));
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await post()).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    delete process.env.RATE_LIMIT_CHAT_PER_MIN;
  });
});

describe("staff dashboard access", () => {
  it("scenario 10: unauthenticated and forged sessions are rejected", async () => {
    await createEnquiry(validInput());
    const anon = await enquiriesRoute.GET(new Request("http://localhost/api/staff/enquiries"));
    expect(anon.status).toBe(401);
    const forged = await enquiriesRoute.GET(new Request("http://localhost/api/staff/enquiries", { headers: { cookie: `${SESSION_COOKIE}=forged` } }));
    expect(forged.status).toBe(401);
    expect(JSON.stringify(await forged.json())).not.toContain("Test Patient");
  });

  it("scenario 10b: staff cannot export or delete (admin only); admin can", async () => {
    const { enquiry } = await createEnquiry(validInput());
    const staff = await staffCookie("staff");
    const ok = await enquiriesRoute.GET(new Request("http://localhost/api/staff/enquiries?q=Test", { headers: { cookie: staff } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).rows[0].reference).toBe(enquiry.reference);
    expect((await exportRoute.GET(new Request("http://localhost/api/staff/export", { headers: { cookie: staff } }))).status).toBe(403);
    const del = await detailRoute.DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { cookie: staff } }), { params: Promise.resolve({ id: String(enquiry.id) }) });
    expect(del.status).toBe(403);
    const admin = await staffCookie("admin");
    const csv = await exportRoute.GET(new Request("http://localhost/api/staff/export", { headers: { cookie: admin } }));
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain(enquiry.reference);
  });

  it("rejects cross-origin state changes", async () => {
    const { enquiry } = await createEnquiry(validInput());
    const staff = await staffCookie();
    const res = await detailRoute.PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "confirmed" }), headers: { cookie: staff, origin: "https://evil.example", host: "localhost" } }),
      { params: Promise.resolve({ id: String(enquiry.id) }) },
    );
    expect(res.status).toBe(403);
  });

  it("login: wrong password is rejected and brute force is rate limited", async () => {
    await query(`INSERT INTO staff_users (email, name, password_hash, role) VALUES ('a@test.invalid','A',$1,'admin')`, [await hashPassword("correct-horse-42")]);
    const login = (pw: string) => loginRoute.POST(new Request("http://localhost/api/staff/login", { method: "POST", body: JSON.stringify({ email: "a@test.invalid", password: pw }), headers: { "x-forwarded-for": "3.3.3.3" } }));
    expect((await login("wrong")).status).toBe(401);
    const good = await login("correct-horse-42");
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    for (let i = 0; i < 9; i++) await login("wrong");
    expect((await login("correct-horse-42")).status).toBe(429);
  });
});

describe("WhatsApp", () => {
  const msg = (id: string, text: string) => ({ entry: [{ changes: [{ value: { messages: [{ id, from: "919876543210", type: "text", text: { body: text } }] } }] }] });

  it("scenario 11: missing credentials → webhook reports not configured, never pretends to be live", async () => {
    const get = await webhookRoute.GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1"));
    expect(get.status).toBe(503);
    const post = await webhookRoute.POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: "{}" }));
    expect(post.status).toBe(503);
    expect((await post.json()).error).toMatch(/not configured/);
  });

  it("verifies the handshake token and the payload signature when configured", async () => {
    Object.assign(process.env, { WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_APP_SECRET: "s3cret", WHATSAPP_VERIFY_TOKEN: "verify-me" });
    const ok = await webhookRoute.GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(await ok.text()).toBe("42");
    const bad = await webhookRoute.GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"));
    expect(bad.status).toBe(403);
    const unsigned = await webhookRoute.POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: JSON.stringify(msg("x", "hi")), headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(unsigned.status).toBe(401);
  });

  it("scenario 5: duplicate webhook deliveries are processed once", async () => {
    const sent: string[] = [];
    const send = async (_to: string, text: string) => { sent.push(text); return { status: "sent" as const }; };
    const first = await handleWhatsAppPayload(msg("wamid.1", "hi"), send);
    const dup = await handleWhatsAppPayload(msg("wamid.1", "hi"), send);
    expect(first.processed).toBe(1);
    expect(dup).toEqual({ processed: 0, duplicates: 1, statusUpdates: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("1. Request a home physiotherapy appointment");
  });

  it("full WhatsApp request flow with numbered replies; STOP opts out", async () => {
    const sent: string[] = [];
    const send = async (_to: string, text: string) => { sent.push(text); return { status: "sent" as const }; };
    const steps = ["hi", "1", "Meena", "9876543210", futureDate(3), "evening", "Basavanagudi", "Hip replacement rehab", "1", "1", "1"];
    let i = 0;
    for (const s of steps) await handleWhatsAppPayload(msg(`w${i++}`, s), send);
    expect(sent.at(-1)).toContain("This is a request, not a confirmed booking");
    const rows = await query(`SELECT source, contact_number FROM enquiries`);
    expect(rows).toEqual([{ source: "whatsapp", contact_number: "+919876543210" }]);
    await handleWhatsAppPayload(msg("stop1", "STOP"), send);
    expect((await query(`SELECT phone FROM whatsapp_optouts`))[0].phone).toBe("+919876543210");
  });

  it("delivery-failure status callbacks are recorded against the notification", async () => {
    const { enquiry } = await createEnquiry(validInput());
    await query(`INSERT INTO notifications (enquiry_id, kind, channel, recipient, payload, status, provider_message_id) VALUES ($1,'x','whatsapp','+91','{}','sent','wamid.out')`, [enquiry.id]);
    await handleWhatsAppPayload({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.out", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }] });
    const n = await query(`SELECT status, last_error FROM notifications WHERE provider_message_id='wamid.out'`);
    expect(n[0]).toEqual({ status: "failed", last_error: "131026 Message undeliverable" });
  });
});

describe("database failure", () => {
  it("scenario 12: an unreachable database surfaces as DatabaseUnavailableError / HTTP 503, not a fake success", async () => {
    process.env.DATABASE_URL = "postgres://physio:physio@127.0.0.1:1/none";
    await resetPool();
    await expect(createEnquiry(validInput())).rejects.toBeInstanceOf(DatabaseUnavailableError);
    const res = await chatRoute.POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ conversationId: "web:" + "b".repeat(24), message: "menu" }), headers: { "x-forwarded-for": "4.4.4.4" } }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("077158 77047");
    // greeting still works without a database
    const greet = await chatRoute.POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ message: "start" }), headers: { "x-forwarded-for": "4.4.4.4" } }));
    expect(greet.status).toBe(200);
    vi.restoreAllMocks();
  });
});
