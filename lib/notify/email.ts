import nodemailer from "nodemailer";
import { emailConfig } from "../config";

export type SendResult = { status: "sent"; providerId?: string } | { status: "not_configured" } | { status: "failed"; error: string };

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg.configured) return { status: "not_configured" };
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    const info = await transport.sendMail({ from: cfg.from, to, subject, text });
    return { status: "sent", providerId: info.messageId };
  } catch (err) {
    return { status: "failed", error: (err as Error).message.slice(0, 500) };
  }
}
