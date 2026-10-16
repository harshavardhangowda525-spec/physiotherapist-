// Deletes cancelled/completed enquiries older than RETENTION_DAYS (default 365) and expired technical data.
// Schedule daily, e.g. `0 3 * * * cd /app && npm run retention`.
import { purgeOldEnquiries } from "../lib/enquiries";
import { resetPool } from "../lib/db";

const days = Number(process.env.RETENTION_DAYS ?? 365);
purgeOldEnquiries(days)
  .then((n) => console.log(`Retention: deleted ${n} closed enquiries older than ${days} days.`))
  .catch((e) => { console.error("Retention failed:", e.message); process.exitCode = 1; })
  .finally(() => resetPool());
