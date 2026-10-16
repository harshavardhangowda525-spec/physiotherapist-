import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sameOrigin, SESSION_COOKIE, sessionCookieOptions, verifyLogin } from "@/lib/auth";
import { query } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { errorResponse, tooMany } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rl = rateLimit(`login:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const parsed = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  try {
    const user = await verifyLogin(parsed.data.email, parsed.data.password);
    if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    const { token, expires } = await createSession(user.id);
    await query(`INSERT INTO audit_log (actor, action) VALUES ($1,'login')`, [user.email]);
    const res = NextResponse.json({ ok: true, user: { name: user.name, role: user.role } });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expires));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
