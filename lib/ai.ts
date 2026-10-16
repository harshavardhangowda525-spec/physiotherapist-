import { aiConfig } from "./config";
import type { FaqKey } from "./faq";

export type Intent =
  | { kind: "request" } | { kind: "status" } | { kind: "human" } | { kind: "faq"; key: FaqKey }
  | { kind: "diagnosis" } | { kind: "urgent" } | { kind: "unknown" };

const FAQ_KEYS: FaqKey[] = ["home_visits", "how_to_request", "contact", "location", "hours", "areas", "services", "prices", "female_therapist", "change_cancel", "website", "reviews"];

/**
 * Optional AI intent classifier (OpenAI-compatible API, e.g. Groq).
 * The model only picks a label from a closed list; it never writes text that is
 * shown to patients, so it cannot invent prices, availability or medical advice.
 * Returns null when AI is not configured or the call fails.
 */
export async function classifyIntent(text: string): Promise<Intent | null> {
  const cfg = aiConfig();
  if (!cfg.configured) return null;
  const labels = ["request", "status", "human", "diagnosis", "urgent", "unknown", ...FAQ_KEYS.map((k) => `faq:${k}`)];
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(cfg.timeoutMs),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 10,
        messages: [
          {
            role: "system",
            content:
              "Classify the user's message to a home-physiotherapy clinic's appointment assistant. Reply with exactly one label and nothing else. " +
              "request=wants to book/request a visit; status=check/cancel/reschedule an existing request; human=wants to talk to staff; " +
              "diagnosis=asks for diagnosis, exercises, medicine or recovery prediction; urgent=describes an emergency or severe symptoms; " +
              "faq:* = general question about the clinic. Labels: " + labels.join(", "),
          },
          { role: "user", content: text.slice(0, 500) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const label = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (!labels.includes(label)) return null;
    if (label.startsWith("faq:")) return { kind: "faq", key: label.slice(4) as FaqKey };
    return { kind: label as Exclude<Intent["kind"], "faq"> } as Intent;
  } catch {
    return null;
  }
}
