"use client";
import { useCallback, useEffect, useState } from "react";
import { STATUSES, STATUS_LABELS, THERAPIST_PREF_LABELS, type EnquiryStatus, type TherapistPreference } from "@/lib/status";

type User = { id: number; name: string; email: string; role: "admin" | "staff" };
type Enquiry = {
  id: number; reference: string; patient_name: string; contact_number: string; preferred_date: string; preferred_time: string;
  locality: string; service_requirement: string; therapist_preference: TherapistPreference; consent_at: string; source: string;
  status: EnquiryStatus; urgent_flag: boolean; created_at: string;
};
type Detail = {
  enquiry: Enquiry;
  notes: { id: number; author_name: string; body: string; created_at: string }[];
  history: { from_status: string | null; to_status: EnquiryStatus; changed_by: string; created_at: string }[];
  notifications: { id: number; kind: string; channel: string; recipient: string; status: string; attempts: number; last_error: string | null }[];
};
type Metrics = {
  metrics: { byStatus: Record<string, number>; last7Days: number; today: number; failedNotifications: number };
  integrations: Record<string, string>;
  notificationIssues: { id: number; channel: string; recipient: string; status: string; last_error: string | null; reference: string | null }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 401) { window.location.href = "/staff/login"; throw new Error("Signed out"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function Dashboard({ user }: { user: User }) {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<Detail | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [notifyPatient, setNotifyPatient] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (date) params.set("date", date);
      const [list, m] = await Promise.all([
        api<{ rows: Enquiry[]; total: number }>(`/api/staff/enquiries?${params}`),
        api<Metrics>("/api/staff/metrics"),
      ]);
      setRows(list.rows);
      setTotal(list.total);
      setMetrics(m);
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }, [page, q, status, date]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  async function open(id: number) {
    try { setSelected(await api<Detail>(`/api/staff/enquiries/${id}`)); setNote(""); } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  }

  async function changeStatus(to: EnquiryStatus) {
    if (!selected) return;
    if (to === "confirmed" && !confirm("Mark as CONFIRMED? Only do this after you have agreed the visit with the patient.")) return;
    try {
      await api(`/api/staff/enquiries/${selected.enquiry.id}`, { method: "PATCH", body: JSON.stringify({ status: to, notifyPatient }) });
      setMsg({ kind: "ok", text: `Status updated to ${STATUS_LABELS[to]}.` });
      await Promise.all([open(selected.enquiry.id), load()]);
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !note.trim()) return;
    try {
      await api(`/api/staff/enquiries/${selected.enquiry.id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) });
      await open(selected.enquiry.id);
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  }

  async function retry(ids?: number[]) {
    try {
      const r = await api<{ sent: number; failed: number; notConfigured: number }>("/api/staff/notifications/retry", { method: "POST", body: JSON.stringify({ ids }) });
      setMsg({ kind: r.failed ? "error" : "ok", text: `Retry finished: ${r.sent} sent, ${r.failed} failed, ${r.notConfigured} channel(s) not configured.` });
      await load();
      if (selected) await open(selected.enquiry.id);
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  }

  async function remove() {
    if (!selected || !confirm(`Permanently delete ${selected.enquiry.reference} and all its notes? This cannot be undone.`)) return;
    try {
      await api(`/api/staff/enquiries/${selected.enquiry.id}`, { method: "DELETE" });
      setSelected(null);
      setMsg({ kind: "ok", text: "Enquiry deleted." });
      await load();
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  }

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" });
    window.location.href = "/staff/login";
  }

  const m = metrics?.metrics;
  const e = selected?.enquiry;
  const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

  return (
    <div>
      <header className="dash-header">
        <h1>Physiotherapy Treatment at Home · Enquiries</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted">{user.name} ({user.role})</span>
          {user.role === "admin" && <a className="btn secondary" href="/api/staff/export">Export CSV</a>}
          <button className="btn secondary" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="container">
        {msg && <div className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text} <button className="btn secondary" style={{ padding: "2px 8px", marginLeft: 8 }} onClick={() => setMsg(null)}>Dismiss</button></div>}

        {m && (
          <div className="metrics">
            <div className="metric"><div className="v">{m.byStatus.new ?? 0}</div><div className="l">New enquiries</div></div>
            <div className="metric"><div className="v">{m.byStatus.awaiting_clinic_review ?? 0}</div><div className="l">Awaiting clinic review</div></div>
            <div className="metric"><div className="v">{m.byStatus.reschedule_requested ?? 0}</div><div className="l">Reschedule requested</div></div>
            <div className="metric"><div className="v">{m.byStatus.confirmed ?? 0}</div><div className="l">Confirmed</div></div>
            <div className="metric"><div className="v">{m.today}</div><div className="l">Received today</div></div>
            <div className="metric"><div className="v">{m.last7Days}</div><div className="l">Last 7 days</div></div>
          </div>
        )}

        {metrics && metrics.notificationIssues.length > 0 && (
          <div className="alert warn" role="status">
            <strong>{metrics.notificationIssues.filter((n) => n.status === "failed").length} failed and {metrics.notificationIssues.filter((n) => n.status === "not_configured").length} unconfigured staff notifications</strong> in the last 30 days.
            Enquiries are saved regardless — check this list for anything you haven&apos;t seen.{" "}
            <button className="btn secondary" style={{ padding: "2px 10px" }} onClick={() => retry()}>Retry all</button>
          </div>
        )}

        <div className="toolbar" role="search">
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" type="search" placeholder="Search name, phone or reference" value={q} onChange={(ev) => { setPage(1); setQ(ev.target.value); }} />
          <label className="sr-only" htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(ev) => { setPage(1); setStatus(ev.target.value); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <label className="sr-only" htmlFor="date">Preferred date</label>
          <input id="date" type="date" value={date} onChange={(ev) => { setPage(1); setDate(ev.target.value); }} />
        </div>

        <div className="layout">
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Patient</th><th>Preferred</th><th>Locality</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`row ${e?.id === r.id ? "active" : ""}`} onClick={() => open(r.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && open(r.id)}>
                      <td>{r.reference}<div className="muted">{fmt(r.created_at)}</div></td>
                      <td>{r.patient_name}<div className="muted">{r.contact_number}</div></td>
                      <td>{r.preferred_date}<div className="muted">{r.preferred_time}</div></td>
                      <td>{r.locality}</td>
                      <td><span className={`badge ${r.status}`}>{STATUS_LABELS[r.status]}</span>{r.urgent_flag && <> <span className="badge urgent">Urgent flag</span></>}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 24 }}>No enquiries match.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: 12 }} className="muted">
              <span>{total} enquiries</span>
              <span>
                <button className="btn secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
                <button className="btn secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</button>
              </span>
            </div>
          </div>

          <aside className="card detail" aria-live="polite">
            {!e && <p className="muted">Select an enquiry to see details.</p>}
            {e && selected && (
              <>
                <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{e.reference} <span className={`badge ${e.status}`}>{STATUS_LABELS[e.status]}</span></h2>
                {e.urgent_flag && <div className="alert error">The patient mentioned possibly urgent symptoms and was advised to seek urgent care. Please call promptly.</div>}
                <dl>
                  <dt>Patient</dt><dd>{e.patient_name}</dd>
                  <dt>Phone</dt><dd>{e.contact_number}</dd>
                  <dt>Preferred date</dt><dd>{e.preferred_date}</dd>
                  <dt>Preferred time</dt><dd>{e.preferred_time}</dd>
                  <dt>Locality</dt><dd>{e.locality}</dd>
                  <dt>Requirement</dt><dd>{e.service_requirement}</dd>
                  <dt>Therapist</dt><dd>{THERAPIST_PREF_LABELS[e.therapist_preference]}</dd>
                  <dt>Source</dt><dd>{e.source}</dd>
                  <dt>Consent</dt><dd>{fmt(e.consent_at)}</dd>
                  <dt>Received</dt><dd>{fmt(e.created_at)}</dd>
                </dl>
                <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a className="btn" href={`tel:${e.contact_number}`}>Call patient</a>
                  <a className="btn secondary" href={waLink(e.contact_number)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </p>
                <div className="field">
                  <label htmlFor="newstatus">Update status</label>
                  <select id="newstatus" value={e.status} onChange={(ev) => changeStatus(ev.target.value as EnquiryStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <label style={{ fontWeight: 400, fontSize: ".85rem" }}>
                    <input type="checkbox" checked={notifyPatient} onChange={(ev) => setNotifyPatient(ev.target.checked)} /> Also send the patient a WhatsApp status message (approved template; skipped if not configured or opted out)
                  </label>
                </div>
                <h3 style={{ fontSize: ".95rem" }}>Internal notes</h3>
                {selected.notes.map((n) => <div key={n.id} className="note">{n.body}<small>{n.author_name} · {fmt(n.created_at)}</small></div>)}
                <form onSubmit={addNote} className="field">
                  <label htmlFor="note" className="sr-only">Add note</label>
                  <textarea id="note" rows={2} maxLength={2000} placeholder="Add an internal note (not visible to the patient)" value={note} onChange={(ev) => setNote(ev.target.value)} />
                  <button className="btn secondary" type="submit" disabled={!note.trim()}>Add note</button>
                </form>
                <h3 style={{ fontSize: ".95rem" }}>Notifications</h3>
                <ul className="integrations">
                  {selected.notifications.map((n) => (
                    <li key={n.id}>{n.channel} → {n.recipient}: <strong>{n.status}</strong>{n.last_error ? ` (${n.last_error})` : ""}{" "}
                      {(n.status === "failed" || n.status === "not_configured") && <button className="btn secondary" style={{ padding: "0 8px" }} onClick={() => retry([n.id])}>Retry</button>}
                    </li>
                  ))}
                </ul>
                <h3 style={{ fontSize: ".95rem" }}>History</h3>
                <ul className="integrations">
                  {selected.history.map((h, i) => <li key={i}>{fmt(h.created_at)} — {h.from_status ? `${STATUS_LABELS[h.from_status as EnquiryStatus]} → ` : ""}{STATUS_LABELS[h.to_status]} by {h.changed_by}</li>)}
                </ul>
                {user.role === "admin" && <button className="btn danger" onClick={remove}>Delete enquiry (data removal request)</button>}
              </>
            )}
          </aside>
        </div>

        {metrics && (
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: "1rem", marginTop: 0 }}>Integration status</h2>
            <ul className="integrations">
              {Object.entries(metrics.integrations).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v}</li>)}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
