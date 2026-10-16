// Usage: npm run create-admin -- --email you@example.com --name "Your Name" [--role admin|staff]
// The password is typed interactively (never passed on the command line or stored in code).
import readline from "node:readline";
import { Writable } from "node:stream";
import { hashPassword, passwordProblems } from "../lib/auth";
import { query, resetPool } from "../lib/db";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(prompt: string): Promise<string> {
  if (process.env.ADMIN_PASSWORD_STDIN === "1") {
    return new Promise((res) => {
      let data = "";
      process.stdin.on("data", (c) => (data += c)).on("end", () => res(data.split("\n")[0].trim()));
    });
  }
  let muted = false;
  const out = new Writable({ write: (chunk, _e, cb) => { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((res) => {
    rl.question(prompt, (a) => { rl.close(); process.stdout.write("\n"); res(a); });
    muted = true;
  });
}

async function main() {
  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? "admin") as "admin" | "staff";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !["admin", "staff"].includes(role)) {
    console.error('Usage: npm run create-admin -- --email you@example.com --name "Your Name" [--role admin|staff]');
    process.exit(1);
  }
  const pw = await askHidden("Choose a password (min 12 chars, letters + numbers): ");
  const problem = passwordProblems(pw);
  if (problem) { console.error(problem); process.exit(1); }
  if (process.env.ADMIN_PASSWORD_STDIN !== "1") {
    const again = await askHidden("Repeat password: ");
    if (again !== pw) { console.error("Passwords do not match."); process.exit(1); }
  }
  await query(
    `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=TRUE`,
    [email.toLowerCase(), name, await hashPassword(pw), role],
  );
  await query(`DELETE FROM staff_sessions WHERE user_id = (SELECT id FROM staff_users WHERE email=$1)`, [email.toLowerCase()]);
  console.log(`Staff account ready: ${email} (${role}).`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => resetPool());
