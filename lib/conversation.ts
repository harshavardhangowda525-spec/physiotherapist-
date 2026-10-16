import { BUSINESS, CONSENT_TEXT, PRIVACY_NOTICE, REQUEST_NOT_BOOKING, UNKNOWN_FALLBACK } from "./business";
import { FAQ_ANSWERS, FAQ_MENU, matchFaq, type FaqKey } from "./faq";
import { DIAGNOSIS_REPLY, URGENT_REPLY, isDiagnosisRequest, isUrgent } from "./safety";
import { normalizePhone, parsePreferredDate, referenceSchema } from "./validation";
import { PATIENT_STATUS_TEXT, THERAPIST_PREF_LABELS, type TherapistPreference } from "./status";
import type { Intent } from "./ai";
import { DatabaseUnavailableError } from "./db";

export type Step =
  | "menu" | "name" | "phone" | "date" | "time" | "locality" | "reason" | "therapist" | "consent" | "confirm"
  | "status_ref" | "status_phone" | "status_action" | "change_detail" | "done";

export type Draft = {
  patientName?: string; contactNumber?: string; preferredDate?: string; preferredTime?: string;
  locality?: string; serviceRequirement?: string; therapistPreference?: TherapistPreference; consent?: boolean; urgentFlag?: boolean;
};

export type ConvState = {
  step: Step;
  draft: Draft;
  lookup?: { reference?: string; phone?: string; changeKind?: "cancel" | "reschedule" };
  submittedRef?: string;
};

export type QuickReply = { label: string; value: string };
export type BotMessage = { text: string; tone?: "info" | "success" | "warning" | "error" };
export type Turn = { state: ConvState; messages: BotMessage[]; quickReplies: QuickReply[]; progress?: { current: number; total: number } };

/** Side-effecting operations injected by the caller (keeps the engine pure and testable). */
export type Deps = {
  submit: (d: Required<Omit<Draft, "urgentFlag" | "consent">> & { consent: true; urgentFlag: boolean }) => Promise<{ reference: string }>;
  lookup: (reference: string, phone: string) => Promise<{ status: keyof typeof PATIENT_STATUS_TEXT; preferred_date: string; preferred_time: string } | null>;
  requestChange: (reference: string, phone: string, kind: "cancel" | "reschedule", detail?: string) => Promise<{ ok: boolean; reason?: string }>;
  classify?: (text: string) => Promise<Intent | null>;
};

export const MENU: QuickReply[] = [
  { label: "Request a home physiotherapy appointment", value: "menu:request" },
  { label: "Ask about physiotherapy services", value: "menu:faq" },
  { label: "Check appointment-request status", value: "menu:status" },
  { label: "Speak with the clinic team", value: "menu:human" },
];

export const GREETING =
  `Hello! Welcome to ${BUSINESS.name}. I'm the clinic's virtual appointment assistant. I can help you learn about our services and submit a home physiotherapy appointment request. How may I help you today?`;

const FORM_STEPS: Step[] = ["name", "phone", "date", "time", "locality", "reason", "therapist", "consent", "confirm"];
const PROMPTS: Record<string, string> = {
  name: "Great — let's get your request started. What is the patient's name?",
  phone: "Thanks. What mobile number should the clinic call? (10-digit Indian mobile number)",
  date: "Which date would you prefer for the home visit? (e.g. 25/10/2026, or \"tomorrow\")",
  time: "What time or time range suits you? (e.g. \"10am–12pm\" or \"evening\")",
  locality: "Which area or locality in Bengaluru is the home visit for?",
  reason:
    "In your own words, briefly describe why you'd like physiotherapy (for example \"knee pain after surgery\"). Please don't share medical records or ID numbers — a short description is enough.",
  therapist: "Do you have a preference for a female or male physiotherapist? The clinic will confirm whether this can be arranged.",
  consent: `Before I submit, please confirm your consent:\n\n"${CONSENT_TEXT}"\n\n${PRIVACY_NOTICE}`,
};

const STEP_REPLIES: Partial<Record<Step, QuickReply[]>> = {
  date: [{ label: "Today", value: "today" }, { label: "Tomorrow", value: "tomorrow" }],
  time: [{ label: "Morning (8–12)", value: "Morning (8am–12pm)" }, { label: "Afternoon (12–4)", value: "Afternoon (12pm–4pm)" }, { label: "Evening (4–8)", value: "Evening (4pm–8pm)" }],
  therapist: [{ label: "Female therapist", value: "female" }, { label: "Male therapist", value: "male" }, { label: "No preference", value: "no_preference" }],
  consent: [{ label: "I agree", value: "yes" }, { label: "I don't agree", value: "no" }],
  confirm: [{ label: "Submit request", value: "submit" }, { label: "Start over", value: "restart" }, { label: "Cancel", value: "menu" }],
};

export const initialState = (): ConvState => ({ step: "menu", draft: {} });

const turn = (state: ConvState, messages: BotMessage[], quickReplies: QuickReply[] = []): Turn => {
  const idx = FORM_STEPS.indexOf(state.step);
  return { state, messages, quickReplies, progress: idx >= 0 ? { current: idx + 1, total: FORM_STEPS.length } : undefined };
};

const callReplies: QuickReply[] = [{ label: "Back to menu", value: "menu" }];

function ask(state: ConvState, prefix: BotMessage[] = []): Turn {
  const step = state.step;
  if (step === "confirm") return turn(state, [...prefix, { text: summary(state.draft) }], STEP_REPLIES.confirm!);
  return turn(state, [...prefix, { text: PROMPTS[step] }], STEP_REPLIES[step] ?? []);
}

function summary(d: Draft): string {
  return [
    "Please check your details:",
    `• Patient: ${d.patientName}`,
    `• Mobile: ${d.contactNumber}`,
    `• Preferred date: ${formatDate(d.preferredDate!)}`,
    `• Preferred time: ${d.preferredTime}`,
    `• Locality: ${d.locality}`,
    `• Reason: ${d.serviceRequirement}`,
    `• Therapist preference: ${THERAPIST_PREF_LABELS[d.therapistPreference!]}`,
    "",
    "Your preferred date and time are not yet confirmed — the clinic will check availability. Shall I submit this request?",
  ].join("\n");
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const nextStep = (s: Step): Step => FORM_STEPS[FORM_STEPS.indexOf(s) + 1] ?? "menu";

function menu(state: ConvState, text = "How else can I help you?"): Turn {
  return turn({ ...state, step: "menu", lookup: undefined }, [{ text }], MENU);
}

function faqTurn(state: ConvState, key: FaqKey): Turn {
  const replies: QuickReply[] =
    FAQ_ANSWERS[key] === UNKNOWN_FALLBACK || key === "services" || key === "prices" || key === "areas"
      ? [{ label: "Submit an enquiry", value: "menu:request" }, { label: "Share contact number", value: "faq:contact" }, { label: "Back to menu", value: "menu" }]
      : [{ label: "Request an appointment", value: "menu:request" }, { label: "More questions", value: "menu:faq" }, { label: "Back to menu", value: "menu" }];
  return turn({ ...state, step: "menu" }, [{ text: FAQ_ANSWERS[key] }], replies);
}

const humanTurn = (state: ConvState): Turn =>
  turn(
    { ...state, step: "menu" },
    [{ text: `You can speak with the clinic team by calling ${BUSINESS.phoneDisplay}. If you'd prefer them to call you, I can submit an appointment request with your details.` }],
    [{ label: `Call ${BUSINESS.phoneDisplay}`, value: "call" }, { label: "Request a call-back", value: "menu:request" }, { label: "Back to menu", value: "menu" }],
  );

function startRequest(state: ConvState): Turn {
  return ask({ ...state, step: "name", draft: { urgentFlag: state.draft.urgentFlag } });
}

/**
 * The conversation engine. Deterministic: the flow, all wording and all safety
 * behaviour are defined here, not by the AI model.
 */
export async function handleMessage(state: ConvState, rawInput: string, deps: Deps): Promise<Turn> {
  const input = rawInput.trim().slice(0, 1000);
  const lower = input.toLowerCase();

  // --- Global commands --------------------------------------------------
  if (!input || lower === "start" || lower === "hi" || lower === "hello") {
    if (state.step === "menu" || state.step === "done" || !input) return turn({ ...initialState(), draft: {} }, [{ text: GREETING }], MENU);
  }
  if (lower === "menu" || lower === "back to menu" || lower === "cancel request") return menu({ ...state, draft: {} });
  if (lower === "restart") return startRequest({ ...state, draft: {} });
  if (lower === "call") return humanTurn(state);

  // --- Safety checks apply to free text at every step -------------------
  const isFreeText = !input.includes(":") || !/^(menu|faq):/.test(input);
  if (isFreeText && isUrgent(input)) {
    const s = { ...state, draft: { ...state.draft, urgentFlag: true } };
    if (state.step === "reason" && input.length >= 3 && input.length <= 500) {
      // Keep the patient's description, but make sure they see the urgent-care advice first.
      return ask({ ...s, draft: { ...s.draft, serviceRequirement: input }, step: "therapist" }, [
        { text: URGENT_REPLY, tone: "warning" },
        { text: "If this isn't an emergency, you can continue your home-visit request." },
      ]);
    }
    const continuing = FORM_STEPS.includes(state.step) && state.step !== "confirm";
    return turn(
      s,
      [{ text: URGENT_REPLY, tone: "warning" }, ...(continuing ? [{ text: "If it isn't an emergency, you can continue your request below." }, { text: PROMPTS[state.step] }] : [])],
      continuing ? STEP_REPLIES[state.step] ?? [] : [{ label: "Request a non-urgent visit", value: "menu:request" }, { label: "Back to menu", value: "menu" }],
    );
  }
  if (isFreeText && state.step !== "reason" && isDiagnosisRequest(input)) {
    const continuing = FORM_STEPS.includes(state.step);
    return turn(state, [{ text: DIAGNOSIS_REPLY }, ...(continuing ? [{ text: PROMPTS[state.step] ?? summary(state.draft) }] : [])],
      continuing ? STEP_REPLIES[state.step] ?? [] : [{ label: "Request an appointment", value: "menu:request" }, { label: "Back to menu", value: "menu" }]);
  }

  // --- Menu selections ---------------------------------------------------
  if (input === "menu:request") return startRequest(state);
  if (input === "menu:status") return turn({ ...state, step: "status_ref", lookup: {} }, [{ text: "Please enter your enquiry reference number (it looks like PT-261016-ABCDE)." }], callReplies);
  if (input === "menu:human") return humanTurn(state);
  if (input === "menu:faq")
    return turn({ ...state, step: "menu" }, [{ text: "What would you like to know? Choose a topic or type your question." }], [
      ...FAQ_MENU.map((f) => ({ label: f.label, value: `faq:${f.key}` })),
      { label: "Back to menu", value: "menu" },
    ]);
  if (input.startsWith("faq:")) {
    const key = input.slice(4) as FaqKey;
    if (key in FAQ_ANSWERS) return faqTurn(state, key);
  }

  // --- Step handlers -----------------------------------------------------
  const s = state;
  const d = s.draft;
  const err = (text: string) => turn(s, [{ text, tone: "error" }], STEP_REPLIES[s.step] ?? []);
  const advance = (draft: Draft) => ask({ ...s, draft, step: nextStep(s.step) });

  // Questions asked mid-form are answered, then the current question is repeated.
  if (FORM_STEPS.includes(s.step) && s.step !== "reason" && input.endsWith("?")) {
    const key = matchFaq(input);
    if (key) return turn(s, [{ text: FAQ_ANSWERS[key] }, { text: s.step === "confirm" ? summary(d) : PROMPTS[s.step] }], STEP_REPLIES[s.step] ?? []);
  }

  switch (s.step) {
    case "name": {
      if (input.length < 2 || input.length > 80 || !/\p{L}/u.test(input)) return err("Please enter the patient's name (2–80 characters).");
      return advance({ ...d, patientName: input.replace(/\s+/g, " ") });
    }
    case "phone": {
      const phone = normalizePhone(input);
      if (!phone) return err("That doesn't look like a valid 10-digit Indian mobile number. Please try again, e.g. 98765 43210.");
      return advance({ ...d, contactNumber: phone });
    }
    case "date": {
      const r = parsePreferredDate(input);
      if (!r.ok) return err(r.error);
      const next = ask({ ...s, draft: { ...d, preferredDate: r.date }, step: "time" }, [
        { text: `Noted: ${formatDate(r.date)}. This is your preferred date — the clinic will confirm whether a therapist is available.`, tone: "info" },
      ]);
      return next;
    }
    case "time": {
      if (input.length < 2 || input.length > 60) return err("Please describe a preferred time or range (e.g. \"10am–12pm\").");
      return advance({ ...d, preferredTime: input });
    }
    case "locality": {
      if (input.length < 2 || input.length > 100) return err("Please enter your area or locality in Bengaluru (e.g. Jayanagar).");
      return ask({ ...s, draft: { ...d, locality: input }, step: "reason" }, [
        { text: "Thank you. The clinic team will confirm whether home visits are available in your area.", tone: "info" },
      ]);
    }
    case "reason": {
      if (input.length < 3) return err("Please add a few words describing why you'd like physiotherapy.");
      if (input.length > 500) return err("Please keep the description under 500 characters — a short summary is enough.");
      const prefix: BotMessage[] = isDiagnosisRequest(input)
        ? [{ text: "I've noted your description. I can't give a diagnosis or treatment advice, but the physiotherapist can discuss this with you." }]
        : [];
      return ask({ ...s, draft: { ...d, serviceRequirement: input }, step: "therapist" }, prefix);
    }
    case "therapist": {
      const v = /female|lady|woman/.test(lower) ? "female" : /\bmale\b|\bman\b|gents?/.test(lower) ? "male" : /no|any|either|doesn|don/.test(lower) ? "no_preference" : null;
      if (!v) return err("Please choose Female, Male or No preference.");
      return advance({ ...d, therapistPreference: v });
    }
    case "consent": {
      if (/^(yes|y|i agree|agree|ok|okay)$/.test(lower)) return advance({ ...d, consent: true });
      if (/^(no|n|i don'?t agree|disagree)$/.test(lower))
        return turn({ ...s, step: "menu", draft: {} }, [
          { text: `No problem — I haven't submitted or stored your request. You can call the clinic directly on ${BUSINESS.phoneDisplay}.` },
        ], MENU);
      return err("Please choose \"I agree\" or \"I don't agree\".");
    }
    case "confirm": {
      if (!/^(submit|yes|y|confirm|submit request)$/.test(lower)) return err("Please choose \"Submit request\", \"Start over\" or \"Cancel\".");
      const missing = (["patientName", "contactNumber", "preferredDate", "preferredTime", "locality", "serviceRequirement", "therapistPreference"] as const).find((k) => !d[k]);
      if (missing || !d.consent) return startRequest({ ...s, draft: {} });
      try {
        const { reference } = await deps.submit({
          patientName: d.patientName!, contactNumber: d.contactNumber!, preferredDate: d.preferredDate!, preferredTime: d.preferredTime!,
          locality: d.locality!, serviceRequirement: d.serviceRequirement!, therapistPreference: d.therapistPreference!, consent: true, urgentFlag: Boolean(d.urgentFlag),
        });
        return turn({ step: "done", draft: {}, submittedRef: reference }, [
          { text: REQUEST_NOT_BOOKING, tone: "success" },
          { text: `Your enquiry reference number is ${reference}. Please keep it — you'll need it with your mobile number to check, change or cancel this request.` },
        ], [{ label: "Check status", value: "menu:status" }, { label: "Back to menu", value: "menu" }]);
      } catch (e) {
        const dbDown = e instanceof DatabaseUnavailableError;
        console.error("[chat] submit failed", (e as Error).message);
        return turn(s, [{
          text: dbDown
            ? `Sorry — we couldn't save your request right now because of a technical problem, so it has NOT been submitted. Please try again in a few minutes or call the clinic on ${BUSINESS.phoneDisplay}.`
            : `Sorry — something went wrong and your request has NOT been submitted. Please try again or call the clinic on ${BUSINESS.phoneDisplay}.`,
          tone: "error",
        }], [{ label: "Try again", value: "submit" }, { label: `Call ${BUSINESS.phoneDisplay}`, value: "call" }]);
      }
    }
    case "status_ref": {
      const r = referenceSchema.safeParse(input);
      if (!r.success) return err("That reference doesn't look right. It should look like PT-261016-ABCDE.");
      return turn({ ...s, step: "status_phone", lookup: { reference: r.data } }, [{ text: "Thanks. Please enter the mobile number used for the request." }], callReplies);
    }
    case "status_phone": {
      const phone = normalizePhone(input);
      if (!phone) return err("Please enter a valid 10-digit Indian mobile number.");
      const ref = s.lookup?.reference ?? "";
      const found = await deps.lookup(ref, phone);
      if (!found) return turn({ ...s, step: "menu", lookup: undefined }, [{ text: `I couldn't find a request matching that reference and mobile number. Please check the details or call ${BUSINESS.phoneDisplay}.` }], MENU);
      const closed = found.status === "cancelled" || found.status === "completed";
      return turn({ ...s, step: closed ? "menu" : "status_action", lookup: { reference: ref, phone } }, [
        { text: `Request ${ref} (preferred ${formatDate(found.preferred_date)}, ${found.preferred_time}) is ${PATIENT_STATUS_TEXT[found.status]}` },
      ], closed ? MENU : [{ label: "Request reschedule", value: "reschedule" }, { label: "Cancel request", value: "cancel" }, { label: "Back to menu", value: "menu" }]);
    }
    case "status_action": {
      if (lower === "cancel" || lower === "reschedule") {
        const kind = lower as "cancel" | "reschedule";
        return turn({ ...s, step: "change_detail", lookup: { ...s.lookup, changeKind: kind } }, [{
          text: kind === "cancel" ? "Are you sure you want to cancel this request? You can add a short reason, or choose \"Confirm cancellation\"." : "What new date or time would suit you? The clinic will contact you to confirm.",
        }], kind === "cancel" ? [{ label: "Confirm cancellation", value: "confirm cancellation" }, { label: "Keep my request", value: "menu" }] : callReplies);
      }
      return err("Please choose \"Request reschedule\", \"Cancel request\" or \"Back to menu\".");
    }
    case "change_detail": {
      const { reference, phone, changeKind } = s.lookup ?? {};
      if (!reference || !phone || !changeKind) return menu(s);
      const detail = lower === "confirm cancellation" ? undefined : input.slice(0, 300);
      const r = await deps.requestChange(reference, phone, changeKind, detail);
      if (!r.ok) return menu(s, `I couldn't update that request (it may already be closed). Please call ${BUSINESS.phoneDisplay}.`);
      return menu(s, changeKind === "cancel"
        ? `Your request ${reference} has been cancelled and the clinic team has been informed.`
        : `Your reschedule request for ${reference} has been sent to the clinic team. Your new time is not confirmed until the clinic contacts you.`);
    }
    case "menu":
    case "done":
    default: {
      const faq = matchFaq(input);
      if (/\b(book|appointment|request|visit|schedule)\b/.test(lower) && !faq) return startRequest(s);
      if (/\b(status|my request|reference|PT-\d)/i.test(input)) return turn({ ...s, step: "status_ref", lookup: {} }, [{ text: "Please enter your enquiry reference number (it looks like PT-261016-ABCDE)." }], callReplies);
      if (/\b(talk|speak|human|person|staff|someone|agent)\b/.test(lower)) return humanTurn(s);
      if (faq) return faqTurn(s, faq);
      const ai = deps.classify ? await deps.classify(input) : null;
      if (ai) {
        if (ai.kind === "request") return startRequest(s);
        if (ai.kind === "status") return handleMessage(s, "menu:status", deps);
        if (ai.kind === "human") return humanTurn(s);
        if (ai.kind === "faq") return faqTurn(s, ai.key);
        if (ai.kind === "diagnosis") return turn(s, [{ text: DIAGNOSIS_REPLY }], MENU);
        if (ai.kind === "urgent") return turn({ ...s, draft: { ...d, urgentFlag: true } }, [{ text: URGENT_REPLY, tone: "warning" }], MENU);
      }
      return turn({ ...s, step: "menu" }, [{ text: UNKNOWN_FALLBACK }], [
        { label: "Submit an enquiry", value: "menu:request" }, { label: "Share contact number", value: "faq:contact" }, { label: "Back to menu", value: "menu" },
      ]);
    }
  }
}
