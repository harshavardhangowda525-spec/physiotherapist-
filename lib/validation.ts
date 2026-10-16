import { z } from "zod";
import { STATUSES } from "./status";

export const CLINIC_TZ = "Asia/Kolkata";
export const MAX_ADVANCE_DAYS = 90;

/** Today's date (YYYY-MM-DD) in the clinic's timezone. */
export function todayInClinicTz(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.replace(/^\+/, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return "+91" + d;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type DateParse = { ok: true; date: string } | { ok: false; error: string };

/** Parses a patient's preferred date. Accepts today/tomorrow, DD/MM/YYYY, YYYY-MM-DD, "17 Oct". */
export function parsePreferredDate(input: string, now = new Date()): DateParse {
  const today = todayInClinicTz(now);
  const s = input.trim().toLowerCase();
  let iso: string | null = null;
  if (s === "today") iso = today;
  else if (s === "tomorrow") iso = addDays(today, 1);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  else {
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    } else {
      m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/);
      if (m && MONTHS.includes(m[2])) {
        const month = String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0");
        let y = m[3] ?? today.slice(0, 4);
        iso = `${y}-${month}-${m[1].padStart(2, "0")}`;
        if (!m[3] && iso < today) {
          y = String(Number(y) + 1);
          iso = `${y}-${month}-${m[1].padStart(2, "0")}`;
        }
      }
    }
  }
  if (!iso) return { ok: false, error: "Please enter the date like 25/10/2026, or type \"today\" or \"tomorrow\"." };
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    return { ok: false, error: "That doesn't look like a valid calendar date. Please try again, e.g. 25/10/2026." };
  }
  if (iso < today) return { ok: false, error: "That date is in the past. Please choose today or a future date." };
  if (iso > addDays(today, MAX_ADVANCE_DAYS)) {
    return { ok: false, error: `Please choose a date within the next ${MAX_ADVANCE_DAYS} days.` };
  }
  return { ok: true, date: iso };
}

const clean = (max: number, min = 2) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min).max(max));

export const enquiryInputSchema = z.object({
  patientName: clean(80).refine((v) => /\p{L}/u.test(v), "Name must contain letters"),
  contactNumber: z.string().transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid Indian mobile number" });
      return z.NEVER;
    }
    return n;
  }),
  preferredDate: z.string().transform((v, ctx) => {
    const r = parsePreferredDate(v);
    if (!r.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      return z.NEVER;
    }
    return r.date;
  }),
  preferredTime: clean(60),
  locality: clean(100),
  serviceRequirement: clean(500, 3),
  therapistPreference: z.enum(["female", "male", "no_preference"]),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to submit a request" }) }),
  source: z.enum(["website", "whatsapp", "staff"]),
  urgentFlag: z.boolean().default(false),
});
export type EnquiryInput = z.input<typeof enquiryInputSchema>;
export type ValidEnquiry = z.output<typeof enquiryInputSchema>;

export const statusSchema = z.enum(STATUSES);
export const referenceSchema = z.string().trim().toUpperCase().regex(/^PT-\d{6}-[A-Z0-9]{5}$/);
