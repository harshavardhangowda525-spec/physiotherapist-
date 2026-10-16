import fs from "node:fs";
import path from "node:path";
import { getPool, resetPool } from "../lib/db";

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await getPool().query(sql);
}

if (require.main === module) {
  migrate()
    .then(() => console.log("Database schema is up to date."))
    .catch((e) => {
      console.error("Migration failed:", e.message);
      process.exitCode = 1;
    })
    .finally(() => resetPool());
}
