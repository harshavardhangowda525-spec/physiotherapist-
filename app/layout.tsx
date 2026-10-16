import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Physiotherapy Treatment at Home — Appointment Assistant",
  description: "Submit a home physiotherapy appointment request or ask a question.",
  robots: { index: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b6e99" };

// Browser translation (e.g. Chrome's Google Translate) and some extensions move or wrap
// text nodes that React owns; React then crashes with removeChild/insertBefore errors.
// This widely used guard makes those operations no-ops instead of crashing the page.
const DOM_GUARD = `(function(){if(typeof Node!=="function"||!Node.prototype)return;var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this){if(window.console)console.warn("[dom-guard] removeChild skipped");return c;}return r.apply(this,arguments);};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){if(window.console)console.warn("[dom-guard] insertBefore skipped");return n;}return i.apply(this,arguments);};})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DOM_GUARD }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
