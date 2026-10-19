"use client";
import { useState } from "react";
import { Atmosphere } from "@/components/Atmosphere";
import { BrandMark } from "@/components/Icons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Sign-in failed.");
      else window.location.href = "/staff";
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Atmosphere />
      <main className="login">
        <div className="login-card glass glass-edge">
          <span className="brand-mark">
            <BrandMark size={22} />
          </span>
          <div>
            <h1>Clinic staff</h1>
            <p className="muted">Sign in to review appointment requests. Authorised staff only — patient information is confidential.</p>
          </div>
          <form onSubmit={submit} className="stack">
            {error && (
              <div className="banner banner--error" role="alert">
                {error}
              </div>
            )}
            <label className="field" htmlFor="email">
              Email
              <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field" htmlFor="password">
              Password
              <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
