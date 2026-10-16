import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { addNote, getEnquiry } from "@/lib/enquiries";
import { errorResponse } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff(req);
    const id = Number((await ctx.params).id);
    const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(await req.json().catch(() => null));
    if (!Number.isInteger(id) || !parsed.success) return NextResponse.json({ error: "Invalid note" }, { status: 400 });
    if (!(await getEnquiry(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await addNote(id, user.id, user.name, parsed.data.body), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
