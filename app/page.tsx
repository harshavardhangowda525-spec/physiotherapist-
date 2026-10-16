import Script from "next/script";
import { BUSINESS } from "@/lib/business";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <h1>{BUSINESS.name}</h1>
          <p>Home physiotherapy appointment requests, 24/7. Requests are reviewed and confirmed by the clinic team.</p>
          <p>
            <a className="btn" href="/chat">Open the appointment assistant</a>{" "}
            <a className="btn secondary" href={`tel:${BUSINESS.phoneTel}`}>Call {BUSINESS.phoneDisplay}</a>
          </p>
        </div>
      </section>
      <section className="container">
        <div className="card">
          <h2>Add the assistant to the clinic website</h2>
          <p>Paste this line before <code>&lt;/body&gt;</code> on {BUSINESS.website}. A &ldquo;Book a home visit&rdquo; button appears in the corner of every page.</p>
          <pre className="code">{`<script src="https://YOUR-APP-DOMAIN/widget.js" defer></script>`}</pre>
          <p className="muted">Also add the website&apos;s origin to <code>CHAT_EMBED_ALLOWED_ORIGINS</code> so the chat may be shown inside it. The widget on this page is a live preview.</p>
          <p className="muted">Clinic staff: <a href="/staff">sign in to the dashboard</a>.</p>
        </div>
      </section>
      <Script src="/widget.js" strategy="afterInteractive" />
    </main>
  );
}
