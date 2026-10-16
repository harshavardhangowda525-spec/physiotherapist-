import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Physiotherapy Treatment at Home — Appointment Assistant",
  description: "Submit a home physiotherapy appointment request or ask a question.",
  robots: { index: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b6e99" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
