import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { deleteEnquiry, getEnquiryDetail, updateStatus } from "@/lib/enquiries";
import { errorResponse } from "@/lib/http";
import { statusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireStaff(req);
    const id = await idOf(ctx);
    const detail = id && (await getEnquiryDetail(id));
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireStaff(req);
    const id = await idOf(ctx);
    const parsed = z.object({ status: statusSchema, notifyPatient: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
    if (!id || !parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const e = await updateStatus(id, parsed.data.status, user.email, parsed.data.notifyPatient ?? false);
    if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ enquiry: e });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Deletion (e.g. patient asks for their data to be removed). Admin only. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await requireStaff(req, "admin");
    const id = await idOf(ctx);
    if (!id || !(await deleteEnquiry(id, user.email))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
