import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "./db";

export type StaffUser = { id: number; email: string; name: string; role: "admin" | "staff" };
export const SESSION_COOKIE = "physio_staff_session";
const SESSION_HOURS = 12;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Password must include letters and numbers.";
  return null;
}

// Used so that unknown e-mails take as long as wrong passwords (no user enumeration by timing).
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12));

export async function verifyLogin(email: string, password: string): Promise<StaffUser | null> {
  const rows = await query<StaffUser & { password_hash: string; active: boolean }>(
    `SELECT id, email, name, role, password_hash, active FROM staff_users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  const u = rows[0];
  const ok = await bcrypt.compare(password, u?.password_hash ?? (await getDummyHash()));
  if (!u || !u.active || !ok) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export async function createSession(userId: number): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await query(`INSERT INTO staff_sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`, [hashToken(token), userId, expires]);
  return { token, expires };
}

export async function userFromToken(token: string | undefined): Promise<StaffUser | null> {
  if (!token) return null;
  const rows = await query<StaffUser>(
    `SELECT u.id, u.email, u.name, u.role FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function destroySession(token: string | undefined) {
  if (token) await query(`DELETE FROM staff_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export async function currentUser(): Promise<StaffUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", expires };
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite=strict). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; cookie is SameSite=strict anyway
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Not signed in" : "Forbidden");
  }
}

/** For API routes: resolves the staff user from the request cookie, enforcing role. */
export async function requireStaff(req: Request, role?: "admin"): Promise<StaffUser> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  const user = await userFromToken(token ? decodeURIComponent(token) : undefined);
  if (!user) throw new AuthError(401);
  if (role === "admin" && user.role !== "admin") throw new AuthError(403);
  if (req.method !== "GET" && !sameOrigin(req)) throw new AuthError(403);
  return user;
}
