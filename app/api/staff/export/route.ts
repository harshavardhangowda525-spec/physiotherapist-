import { requireStaff } from "@/lib/auth";
import { query } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { csvCell } from "@/lib/csv";
import { STATUS_LABELS, THERAPIST_PREF_LABELS, type EnquiryStatus, type TherapistPreference } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireStaff(req, "admin");
    const rows = await query<Record<string, unknown>>(
      `SELECT reference, patient_name, contact_number, to_char(preferred_date,'YYYY-MM-DD') AS preferred_date, preferred_time, locality,
              service_requirement, therapist_preference, consent_at, source, status, created_at FROM enquiries ORDER BY created_at DESC`,
    );
    await query(`INSERT INTO audit_log (actor, action, details) VALUES ($1,'export_csv',$2)`, [user.email, JSON.stringify({ rows: rows.length })]);
    const header = ["Reference", "Patient", "Phone", "Preferred date", "Preferred time", "Locality", "Requirement", "Therapist preference", "Consent at", "Source", "Status", "Created"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.reference, r.patient_name, r.contact_number, r.preferred_date, r.preferred_time, r.locality, r.service_requirement,
        THERAPIST_PREF_LABELS[r.therapist_preference as TherapistPreference], new Date(r.consent_at as string).toISOString(), r.source,
        STATUS_LABELS[r.status as EnquiryStatus], new Date(r.created_at as string).toISOString(),
      ].map(csvCell).join(","));
    }
    return new Response(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
