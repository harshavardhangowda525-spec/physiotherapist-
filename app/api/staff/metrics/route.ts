import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getMetrics } from "@/lib/enquiries";
import { integrationStatus } from "@/lib/config";
import { query } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireStaff(req);
    const [metrics, failed] = await Promise.all([
      getMetrics(),
      query(`SELECT n.id, n.channel, n.recipient, n.status, n.attempts, n.last_error, n.updated_at, e.reference
             FROM notifications n LEFT JOIN enquiries e ON e.id = n.enquiry_id
             WHERE n.status IN ('failed','not_configured') AND n.created_at > now() - interval '30 days' ORDER BY n.id DESC LIMIT 50`),
    ]);
    return NextResponse.json({ user, metrics, integrations: integrationStatus(), notificationIssues: failed }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
