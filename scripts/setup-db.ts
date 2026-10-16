// Runs during deployment (`npm run vercel-build`):
// 1. creates/updates the database tables (idempotent);
// 2. if ADMIN_EMAIL and ADMIN_PASSWORD are set and NO admin exists yet, creates the first admin.
//    An existing admin is never overwritten — change passwords with `npm run create-admin`.
import { migrate } from "./migrate";
import { query, resetPool } from "../lib/db";
import { hashPassword, passwordProblems } from "../lib/auth";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it in your hosting provider's environment variables.");
  }
  await migrate();
  console.log("[setup] Database schema is up to date.");

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const admins = await query<{ n: number }>(`SELECT count(*)::int AS n FROM staff_users WHERE role = 'admin'`);
  if (admins[0].n > 0) {
    console.log("[setup] An admin account already exists — skipping admin creation.");
    return;
  }
  if (!email || !password) {
    console.warn("[setup] No admin account exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD and redeploy to create one.");
    return;
  }
  const problem = passwordProblems(password);
  if (problem) throw new Error(`[setup] ADMIN_PASSWORD rejected: ${problem}`);
  await query(`INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,'admin')`, [
    email,
    process.env.ADMIN_NAME?.trim() || "Clinic Admin",
    await hashPassword(password),
  ]);
  console.log(`[setup] First admin account created for ${email}.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => resetPool());
