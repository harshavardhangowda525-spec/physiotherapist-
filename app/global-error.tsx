"use client";

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#13293d" }}>
        <h1 style={{ fontSize: "1.2rem" }}>Sorry, something went wrong</h1>
        <p>
          Please reload the page, or call the clinic on <a href="tel:+917715877047">077158 77047</a>.
        </p>
        <button onClick={reset}>Try again</button>
        <details open>
          <summary>Technical details</summary>
          <code style={{ whiteSpace: "pre-wrap" }}>
            {error.name}: {error.message}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
          </code>
        </details>
      </body>
    </html>
  );
}
