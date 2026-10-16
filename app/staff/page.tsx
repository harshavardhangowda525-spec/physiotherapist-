import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { DatabaseUnavailableError } from "@/lib/db";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff dashboard — Physiotherapy Treatment at Home" };

export default async function StaffPage() {
  let user;
  try {
    user = await currentUser();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return (
        <main className="container">
          <div className="alert error" role="alert">
            The database is currently unavailable, so the dashboard can&apos;t load. New chat submissions are being refused with a message asking
            patients to call 077158 77047. Check the database server and <code>/api/health</code>.
          </div>
        </main>
      );
    }
    throw err;
  }
  if (!user) redirect("/staff/login");
  return <Dashboard user={user} />;
}
