// Central, server-only configuration. Each integration reports whether it is
// actually configured so nothing is presented as live when it isn't.

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function emailConfig() {
  const host = process.env.SMTP_HOST;
  const from = process.env.NOTIFY_FROM_EMAIL;
  const recipients = list(process.env.STAFF_NOTIFICATION_EMAILS);
  return {
    configured: Boolean(host && from && recipients.length),
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
    from,
    recipients,
  };
}

export function whatsappConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  return {
    configured: Boolean(token && phoneNumberId && appSecret && verifyToken),
    token,
    phoneNumberId,
    appSecret,
    verifyToken,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
    staffRecipients: list(process.env.STAFF_WHATSAPP_NUMBERS),
    staffAlertTemplate: process.env.WHATSAPP_TEMPLATE_STAFF_ALERT,
    patientStatusTemplate: process.env.WHATSAPP_TEMPLATE_PATIENT_STATUS,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en",
  };
}

export function aiConfig() {
  const apiKey = process.env.AI_API_KEY;
  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl: process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: process.env.AI_MODEL ?? "llama-3.1-8b-instant",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 4000),
  };
}

export function integrationStatus() {
  const e = emailConfig();
  const w = whatsappConfig();
  const a = aiConfig();
  return {
    email: e.configured ? "configured (untested until a message is sent)" : "not configured — test mode",
    whatsapp: w.configured ? "configured (untested until a message is sent)" : "not configured — test mode",
    whatsappStaffAlerts: w.configured && w.staffRecipients.length && w.staffAlertTemplate ? "configured" : "not configured",
    ai: a.configured ? `configured (${a.model})` : "not configured — rule-based assistant only",
  };
}
