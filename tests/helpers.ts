import { getPool, query, resetPool } from "@/lib/db";
import { migrate } from "@/scripts/migrate";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://physio:physio@localhost:5432/physio_test";

export async function setupDb() {
  process.env.DATABASE_URL = TEST_DB;
  await resetPool();
  await migrate();
  await getPool().query(
    `TRUNCATE enquiries, enquiry_notes, enquiry_status_history, notifications, conversations, processed_webhook_events,
       whatsapp_optouts, staff_sessions, staff_users, audit_log RESTART IDENTITY CASCADE`,
  );
}

export function clearIntegrationEnv() {
  for (const k of Object.keys(process.env)) {
    if (/^(SMTP_|WHATSAPP_|STAFF_|NOTIFY_|AI_)/.test(k)) delete process.env[k];
  }
}

export function futureDate(days: number) {
  const d = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export const validInput = () => ({
  patientName: "Test Patient",
  contactNumber: "98765 43210",
  preferredDate: futureDate(3),
  preferredTime: "Morning (8am–12pm)",
  locality: "Jayanagar",
  serviceRequirement: "Knee stiffness after surgery",
  therapistPreference: "female" as const,
  consent: true as const,
  source: "website" as const,
});

export { query };
