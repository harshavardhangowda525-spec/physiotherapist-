"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { from: "bot" | "user"; text: string; tone?: string };
type QR = { label: string; value: string };
type Resp = { conversationId: string; messages: { text: string; tone?: string }[]; quickReplies: QR[]; progress?: { current: number; total: number }; error?: string };

const PHONE = "077158 77047";
const TEL = "+917715877047";
const KEY = "physio-chat-id";

export default function ChatWindow() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [qr, setQr] = useState<QR[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Resp["progress"]>();
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  async function send(message: string, display?: string) {
    if (busy) return;
    if (display) setMsgs((m) => [...m, { from: "user", text: display }]);
    setBusy(true);
    setQr([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId ?? undefined, message }),
      });
      const data = (await res.json()) as Resp;
      if (!res.ok) {
        setMsgs((m) => [...m, { from: "bot", tone: "error", text: data.error ?? `Sorry, something went wrong. Please call the clinic on ${PHONE}.` }]);
        setQr([{ label: "Try again", value: message }]);
        return;
      }
      if (data.conversationId && data.conversationId !== convId) {
        setConvId(data.conversationId);
        try { sessionStorage.setItem(KEY, data.conversationId); } catch {}
      }
      setMsgs((m) => [...m, ...data.messages.map((x) => ({ from: "bot" as const, text: x.text, tone: x.tone }))]);
      setQr(data.quickReplies ?? []);
      setProgress(data.progress);
    } catch {
      setMsgs((m) => [...m, { from: "bot", tone: "error", text: `I couldn't connect. Please check your internet connection, or call the clinic on ${PHONE}.` }]);
      setQr([{ label: "Try again", value: message }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try { sessionStorage.removeItem(KEY); } catch {}
    void send("start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect
    // must never return anything except a cleanup function.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  function onQuick(q: QR) {
    if (q.value === "call") {
      window.open(`tel:${TEL}`, "_top");
    }
    void send(q.value, q.label);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    setInput("");
    void send(t, t);
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="avatar" aria-hidden>PT</div>
        <div>
          <h1>Physiotherapy Treatment at Home</h1>
          <p>Virtual appointment assistant · requests are confirmed by the clinic</p>
        </div>
        <a className="call" href={`tel:${TEL}`} target="_top">Call {PHONE}</a>
      </header>
      {progress && (
        <>
          <div className="progress-label" aria-live="polite">Appointment request: step {progress.current} of {progress.total}</div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.current}>
            <div style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </>
      )}
      <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.from} ${m.tone ?? ""}`} role={m.tone === "error" ? "alert" : undefined}>
            <span className="sr-only">{m.from === "bot" ? "Assistant: " : "You: "}</span>
            {m.text}
          </div>
        ))}
        {busy && <div className="typing">Assistant is typing…</div>}
        <div ref={endRef} />
      </div>
      {qr.length > 0 && (
        <div className="quick" aria-label="Suggested replies">
          {qr.map((q) => (
            <button key={q.value + q.label} onClick={() => onQuick(q)} disabled={busy}>{q.label}</button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={onSubmit}>
        <label htmlFor="chat-input" className="sr-only">Type your message</label>
        <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Type your message…" autoComplete="off" />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
      <p className="privacy">
        This assistant handles appointment requests only and does not give medical advice. In an emergency call 112.
        Details you submit are shared only with the clinic team to follow up your request.
      </p>
    </div>
  );
}
