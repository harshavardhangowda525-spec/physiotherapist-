import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { retryNotifications } from "@/lib/notify/outbox";
import { errorResponse } from "@/lib/http";

export async function POST(req: Request) {
  try {
    await requireStaff(req);
    const parsed = z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json(await retryNotifications(parsed.data.ids));
  } catch (err) {
    return errorResponse(err);
  }
}
