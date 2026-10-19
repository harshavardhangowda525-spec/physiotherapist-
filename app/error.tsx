"use client";
import { useEffect } from "react";
import { Atmosphere } from "@/components/Atmosphere";

// Shown instead of Next's blank "Application error" screen when a page crashes in the browser.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);
  return (
    <>
      <Atmosphere />
      <main className="login">
        <div className="login-card glass glass-edge" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted">
            Please try again. If you were submitting an appointment request, it may not have been sent — you can call the clinic on{" "}
            <a href="tel:+917715877047">077158 77047</a>.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={reset}>Try again</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload page</button>
          </div>
          <details className="muted" open>
            <summary>Technical details (for the clinic&apos;s web team)</summary>
            <code className="mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {error.name}: {error.message}
              {error.digest ? `\nDigest: ${error.digest}` : ""}
              {`\nPage: ${typeof window !== "undefined" ? window.location.pathname : ""}`}
              {error.stack ? `\n${error.stack.split("\n").slice(0, 4).join("\n")}` : ""}
            </code>
          </details>
        </div>
      </main>
    </>
  );
}
