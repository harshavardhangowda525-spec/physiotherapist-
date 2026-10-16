"use client";
import { useEffect } from "react";

// Shown instead of Next's blank "Application error" screen when a page crashes in the browser.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);
  return (
    <main className="container" style={{ maxWidth: 520, paddingTop: 48 }}>
      <div className="card" role="alert">
        <h1 style={{ fontSize: "1.2rem", marginTop: 0 }}>Sorry, something went wrong on this page</h1>
        <p>
          Please try again. If you were submitting an appointment request, it may not have been sent — you can call the clinic on{" "}
          <a href="tel:+917715877047">077158 77047</a>.
        </p>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={reset}>Try again</button>
          <button className="btn secondary" onClick={() => window.location.reload()}>Reload page</button>
        </p>
        <details className="muted" open>
          <summary>Technical details (for the clinic&apos;s web team)</summary>
          <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {error.name}: {error.message}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
            {`\nPage: ${typeof window !== "undefined" ? window.location.pathname : ""}`}
            {error.stack ? `\n${error.stack.split("\n").slice(0, 4).join("\n")}` : ""}
          </code>
        </details>
      </div>
    </main>
  );
}
