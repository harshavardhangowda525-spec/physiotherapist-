import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { listEnquiries } from "@/lib/enquiries";
import { errorResponse } from "@/lib/http";
import { statusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireStaff(req);
    const u = new URL(req.url);
    const status = u.searchParams.get("status") || undefined;
    const date = u.searchParams.get("date") || undefined;
    if (status && !statusSchema.safeParse(status).success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    const data = await listEnquiries({
      q: u.searchParams.get("q")?.slice(0, 100) || undefined,
      status,
      date,
      page: Number(u.searchParams.get("page") ?? 1) || 1,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
