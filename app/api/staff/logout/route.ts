import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const token = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  await destroySession(token).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
