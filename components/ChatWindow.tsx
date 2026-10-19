"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BrandMark, IconAlert, IconCheck, IconCopy, IconInfo, IconPhone, IconRefresh, IconSend, IconShield } from "./Icons";

type Tone = "info" | "success" | "warning" | "error" | undefined;
type BotMsg = { text: string; tone?: Tone };
type QR = { label: string; value: string };
type Entry = { id: number; from: "bot"; msg: BotMsg } | { id: number; from: "user"; text: string };
type Resp = {
  conversationId?: string;
  step?: string;
  messages?: BotMsg[];
  quickReplies?: QR[];
  progress?: { current: number; total: number };
  error?: string;
};

const PHONE = "077158 77047";
const TEL = "+917715877047";
const REF_RE = /PT-\d{6}-[A-Z0-9]{5}/;

const STEP_LABELS: Record<string, string> = {
  name: "Patient name",
  phone: "Mobile number",
  date: "Preferred date",
  time: "Preferred time",
  locality: "Locality",
  reason: "Reason for visit",
  therapist: "Therapist preference",
  consent: "Consent",
  confirm: "Review & submit",
};

const PLACEHOLDERS: Record<string, string> = {
  name: "Patient's name",
  phone: "10-digit mobile number",
  time: "e.g. 10am–12pm or evening",
  locality: "e.g. Jayanagar 4th Block",
  reason: "Briefly, in your own words",
};

const PRIMARY = new Set(["menu:request", "submit", "yes", "call"]);

let nextId = 1;

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function ChatWindow({ variant = "page" }: { variant?: "page" | "embed" }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [replies, setReplies] = useState<QR[]>([]);
  const [step, setStep] = useState("menu");
  const [progress, setProgress] = useState<Resp["progress"]>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const convId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const started = useRef(false);

  function addBot(messages: BotMsg[]) {
    setEntries((e) => [...e, ...messages.map((m) => ({ id: nextId++, from: "bot" as const, msg: m }))]);
  }

  async function send(message: string, echo?: string) {
    if (busy) return;
    if (echo) setEntries((e) => [...e, { id: nextId++, from: "user", text: echo }]);
    setReplies([]);
    setBusy(true);
    const minDelay = new Promise((r) => setTimeout(r, 380));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current ?? undefined, message }),
      });
      const data = (await res.json().catch(() => ({}))) as Resp;
      await minDelay;
      if (!res.ok || !data.messages) {
        addBot([
          {
            tone: "error",
            text:
              res.status === 429
                ? "You're sending messages very quickly. Please wait a moment and try again."
                : data.error ?? `Sorry, something went wrong. Please call the clinic on ${PHONE}.`,
          },
        ]);
        setReplies([{ label: "Try again", value: message }, { label: `Call ${PHONE}`, value: "call" }]);
        return;
      }
      if (data.conversationId) convId.current = data.conversationId;
      addBot(data.messages);
      setReplies(data.quickReplies ?? []);
      setStep(data.step ?? "menu");
      setProgress(data.progress);
    } catch {
      await minDelay;
      addBot([{ tone: "error", text: `I couldn't reach the server. Please check your connection and try again, or call the clinic on ${PHONE}.` }]);
      setReplies([{ label: "Try again", value: message }, { label: `Call ${PHONE}`, value: "call" }]);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    convId.current = null;
    setEntries([]);
    setDraft("");
    setProgress(undefined);
    setStep("menu");
    void send("start");
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send("start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Braces matter: an effect must only ever return a cleanup function.
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [entries, busy, replies]);

  useEffect(() => {
    if (!busy && variant === "embed") fieldRef.current?.focus({ preventScroll: true });
  }, [busy, step, variant]);

  function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text, step === "date" ? formatDateEcho(text) : text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  async function copyRef(ref: string) {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(ref);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard may be blocked inside iframes */
    }
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  const isDate = step === "date";
  const isTel = step === "phone" || step === "status_phone";
  const placeholder = PLACEHOLDERS[step] ?? (step === "status_ref" ? "e.g. PT-261016-ABCDE" : "Type a message");

  return (
    <section className={`chat glass glass-edge ${variant === "embed" ? "chat--embed" : ""}`} aria-label="Appointment assistant chat">
      <header className="chat-header">
        <div className="avatar">
          <BrandMark size={22} />
          <span className="online" aria-hidden="true" />
        </div>
        <div className="chat-title">
          <strong>Physiotherapy Treatment at Home</strong>
          <span>Virtual appointment assistant · available 24/7</span>
        </div>
        <span className="mode-badge" title="Answers come from verified clinic information; requests are confirmed by the clinic team">
          Requests only
        </span>
        <button type="button" className="icon-btn" onClick={restart} aria-label="Start a new conversation" title="Start over">
          <IconRefresh size={17} />
        </button>
        <a className="icon-btn" href={`tel:${TEL}`} target="_top" aria-label={`Call the clinic on ${PHONE}`} title={`Call ${PHONE}`}>
          <IconPhone size={17} />
        </a>
      </header>

      {progress && (
        <div className="progress" role="group" aria-label="Request progress">
          <div className="progress-meta">
            <span>
              Step <b>{progress.current}</b> of {progress.total}
            </span>
            <span>{STEP_LABELS[step] ?? ""}</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.current}
            aria-valuetext={`Step ${progress.current} of ${progress.total}`}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="messages" ref={scroller} role="log" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
        {entries.map((e) =>
          e.from === "user" ? (
            <div key={e.id} className="row row--user">
              <div className="bubble bubble--user">
                <span className="sr-only">You said: </span>
                {e.text}
              </div>
            </div>
          ) : (
            <div key={e.id} className="row">
              <span className="mini-avatar" aria-hidden="true">
                <BrandMark size={15} />
              </span>
              <BotEntry msg={e.msg} onCopy={copyRef} copied={copied} />
            </div>
          ),
        )}
        {busy && (
          <div className="row" aria-label="Assistant is typing">
            <span className="mini-avatar" aria-hidden="true">
              <BrandMark size={15} />
            </span>
            <div className="bubble bubble--bot typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {replies.length > 0 && !busy && (
        <div className="chips" role="group" aria-label="Suggested replies">
          {replies.map((r, i) =>
            r.value === "call" ? (
              <a key={`${r.value}-${i}`} className="btn btn--primary" href={`tel:${TEL}`} target="_top">
                <IconPhone size={15} />
                {r.label}
              </a>
            ) : (
              <button
                key={`${r.value}-${i}`}
                type="button"
                className={`btn ${PRIMARY.has(r.value) ? "btn--primary" : ""}`}
                onClick={() => void send(r.value, r.label)}
              >
                {r.label}
              </button>
            ),
          )}
        </div>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <label className="composer-field">
          <span className="sr-only">{placeholder}</span>
          {step === "reason" ? (
            <textarea
              id="chat-input"
              ref={fieldRef}
              rows={2}
              value={draft}
              maxLength={500}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
          ) : (
            <input
              id="chat-input"
              ref={fieldRef}
              type={isDate ? "date" : isTel ? "tel" : "text"}
              inputMode={isTel ? "tel" : undefined}
              autoComplete={isTel ? "tel" : "off"}
              min={isDate ? todayIso() : undefined}
              value={draft}
              maxLength={1000}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
          )}
        </label>
        <button className="send" type="submit" disabled={busy || !draft.trim()} aria-label="Send message">
          <IconSend size={19} />
        </button>
      </form>

      <footer className="chat-foot">
        <span>
          <IconShield size={13} style={{ verticalAlign: "-2px" }} /> Not medical advice. Emergencies: call 112. Details go only to the clinic team.
        </span>
        <span>
          Prefer to talk?{" "}
          <a href={`tel:${TEL}`} target="_top">
            {PHONE}
          </a>
        </span>
      </footer>
    </section>
  );
}

function formatDateEcho(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

/** Turns the engine's plain messages into the richer cards of the design. */
function BotEntry({ msg, onCopy, copied }: { msg: BotMsg; onCopy: (ref: string) => void; copied: string | null }) {
  const text = msg.text;

  // Summary before submission: "Please check your details:\n• Label: value ..."
  if (text.startsWith("Please check your details:")) {
    const lines = text.split("\n");
    const rows = lines.filter((l) => l.startsWith("• ")).map((l) => {
      const body = l.slice(2);
      const i = body.indexOf(": ");
      return i > 0 ? { label: body.slice(0, i), value: body.slice(i + 2) } : { label: "", value: body };
    });
    const tail = lines.filter((l) => l && !l.startsWith("• ") && !l.startsWith("Please check")).join(" ");
    return (
      <div className="card">
        <h4>Please check your details</h4>
        <dl className="summary">
          {rows.map((r) => (
            <div className="summary-row" key={r.label + r.value}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        <p>{tail}</p>
      </div>
    );
  }

  // Reference number after submission.
  const ref = text.match(REF_RE)?.[0];
  if (ref && /reference number is/i.test(text)) {
    return (
      <div className="card card--info">
        <h4>
          <IconInfo size={17} /> Your reference number
        </h4>
        <div className="ref">
          <code>
            <small>Reference number</small>
            <span className="ref-value">{ref}</span>
          </code>
          <button type="button" className="btn btn--sm" onClick={() => onCopy(ref)}>
            <IconCopy size={14} /> {copied === ref ? "Copied" : "Copy"}
          </button>
        </div>
        <p>{text.replace(`Your enquiry reference number is ${ref}. `, "")}</p>
      </div>
    );
  }

  if (msg.tone === "success") {
    return (
      <div className="card card--success" role="status">
        <h4>
          <span className="success-check">
            <IconCheck size={15} />
          </span>
          Request submitted
        </h4>
        <p>{text}</p>
        <span className="not-confirmed">
          <IconInfo size={13} /> Not yet a confirmed appointment
        </span>
      </div>
    );
  }

  if (msg.tone === "warning") {
    return (
      <div className="card card--urgent" role="alert">
        <h4>
          <IconAlert size={17} /> Please seek urgent care
        </h4>
        <p>{text}</p>
      </div>
    );
  }

  if (msg.tone === "error") {
    return (
      <div className="bubble bubble--error" role="alert">
        {text}
      </div>
    );
  }

  if (msg.tone === "info") {
    return (
      <div className="card card--info">
        <p>{text}</p>
      </div>
    );
  }

  return <div className="bubble bubble--bot">{text}</div>;
}
