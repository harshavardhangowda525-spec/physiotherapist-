"use client";
import { useCallback, useEffect, useState } from "react";
import { STATUSES, STATUS_LABELS, THERAPIST_PREF_LABELS, type EnquiryStatus, type TherapistPreference } from "@/lib/status";
import { Atmosphere } from "./Atmosphere";
import { BrandMark, IconAlert, IconDownload, IconPhone } from "./Icons";

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
  const pill = (s: string) => `pill pill--${s.toUpperCase()}`;
  const needsAction = m ? (m.byStatus.new ?? 0) + (m.byStatus.awaiting_clinic_review ?? 0) + (m.byStatus.reschedule_requested ?? 0) : 0;
  const failedCount = metrics?.notificationIssues.filter((n) => n.status === "failed").length ?? 0;
  const unconfiguredCount = metrics?.notificationIssues.filter((n) => n.status === "not_configured").length ?? 0;

  return (
    <>
      <Atmosphere />
      <div className="dash-main">
        <header className="dash-top glass glass--soft">
          <span className="brand">
            <span className="brand-mark">
              <BrandMark size={22} />
            </span>
            <span>
              Physiotherapy Treatment at Home
              <small>Staff dashboard</small>
            </span>
          </span>
          <div className="actions">
            <span className="muted">
              {user.name} · {user.role}
            </span>
            {user.role === "admin" && (
              <a className="btn btn--sm" href="/api/staff/export">
                <IconDownload size={15} /> Export CSV
              </a>
            )}
            <button className="btn btn--sm btn--ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>

        <div className="page-head">
          <div>
            <h1>Appointment requests</h1>
            <p>Requests are not appointments until you confirm them with the patient.</p>
          </div>
        </div>

        {msg && (
          <div className={`banner ${msg.kind === "error" ? "banner--error" : "banner--ok"}`} role={msg.kind === "error" ? "alert" : "status"}>
            {msg.text}{" "}
            <button className="btn btn--sm btn--ghost" style={{ marginLeft: 8 }} onClick={() => setMsg(null)}>
              Dismiss
            </button>
          </div>
        )}

        {(failedCount > 0 || unconfiguredCount > 0) && (
          <div className="banner banner--warn" role="status">
            {failedCount} failed and {unconfiguredCount} unconfigured staff notification{failedCount + unconfiguredCount === 1 ? "" : "s"} in the last 30 days.
            Enquiries are saved regardless — check the list for anything you haven&apos;t seen.{" "}
            <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => retry()}>
              Retry all
            </button>
          </div>
        )}

        {m && (
          <section className="metrics" aria-label="Enquiry metrics">
            <div className="metric glass glass--soft"><b>{needsAction}</b><span>Need clinic action</span></div>
            <div className="metric glass glass--soft"><b>{m.byStatus.new ?? 0}</b><span>New enquiries</span></div>
            <div className="metric glass glass--soft"><b>{m.byStatus.confirmed ?? 0}</b><span>Confirmed</span></div>
            <div className="metric glass glass--soft"><b>{m.today}</b><span>Received today</span></div>
            <div className="metric glass glass--soft"><b>{m.last7Days}</b><span>Last 7 days</span></div>
          </section>
        )}

        <section className="panel glass glass--soft">
          <div className="filters" role="search">
            <label className="field" style={{ flex: "1 1 240px" }} htmlFor="q">
              Search name, phone or reference
              <input id="q" className="input" type="search" placeholder="e.g. Priya or 98765" value={q} onChange={(ev) => { setPage(1); setQ(ev.target.value); }} />
            </label>
            <label className="field" htmlFor="status">
              Status
              <select id="status" className="select" value={status} onChange={(ev) => { setPage(1); setStatus(ev.target.value); }}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="date">
              Preferred date
              <input id="date" className="input" type="date" value={date} onChange={(ev) => { setPage(1); setDate(ev.target.value); }} />
            </label>
            {(q || status || date) && (
              <button className="btn btn--ghost" onClick={() => { setQ(""); setStatus(""); setDate(""); setPage(1); }}>
                Clear
              </button>
            )}
          </div>
        </section>

        <div className="dash-grid">
          <section className="panel glass glass--soft">
            <h2>{total} request{total === 1 ? "" : "s"}</h2>
            {rows.length === 0 ? (
              <p className="muted">No requests match these filters yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Preferred</th>
                      <th>Locality</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className={`clickable row-item ${e?.id === r.id ? "is-active" : ""}`}
                        onClick={() => open(r.id)}
                        tabIndex={0}
                        onKeyDown={(ev) => ev.key === "Enter" && open(r.id)}
                      >
                        <td>
                          <span className="rowlink" style={{ fontWeight: 700 }}>{r.patient_name}</span>
                          <div className="muted mono">{r.reference}</div>
                          <div className="muted">{r.contact_number}</div>
                        </td>
                        <td>
                          {r.preferred_date}
                          <div className="muted">{r.preferred_time}</div>
                        </td>
                        <td>{r.locality}</td>
                        <td>
                          <span className={pill(r.status)}>{STATUS_LABELS[r.status]}</span>
                          {r.urgent_flag && (
                            <div style={{ marginTop: 6 }}>
                              <span className="urgent-flag"><IconAlert size={12} /> Urgent flag</span>
                            </div>
                          )}
                          <div className="muted" style={{ marginTop: 4 }}>{fmt(r.created_at)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {total > 25 && (
              <nav className="filters" style={{ marginTop: 14 }} aria-label="Pagination">
                <button className="btn btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="muted">Page {page} of {Math.ceil(total / 25)}</span>
                <button className="btn btn--sm" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</button>
              </nav>
            )}
          </section>

          <aside className="panel glass glass--soft dash-detail" aria-live="polite">
            {!e && <p className="muted">Select a request to see its details.</p>}
            {e && selected && (
              <>
                <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 15 }}>{e.reference}</span>
                  <span className={pill(e.status)}>{STATUS_LABELS[e.status]}</span>
                </h2>
                {e.urgent_flag && (
                  <div className="banner banner--error" style={{ marginBottom: 12 }}>
                    The patient mentioned possibly urgent symptoms and was advised to seek urgent care. Please call promptly.
                  </div>
                )}
                <dl className="kv">
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
                <div className="detail-actions">
                  <a className="btn btn--primary" href={`tel:${e.contact_number}`}>
                    <IconPhone size={15} /> Call patient
                  </a>
                  <a className="btn" href={waLink(e.contact_number)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
                <div className="stack">
                  <label className="field" htmlFor="newstatus">
                    Update status
                    <select id="newstatus" className="select" value={e.status} onChange={(ev) => changeStatus(ev.target.value as EnquiryStatus)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={notifyPatient} onChange={(ev) => setNotifyPatient(ev.target.checked)} />
                    Also send the patient a WhatsApp status message (approved template; skipped if not configured or opted out)
                  </label>
                </div>

                <h3>Internal notes</h3>
                <div className="stack">
                  {selected.notes.map((n) => (
                    <div key={n.id} className="note">
                      <small>{n.author_name} · {fmt(n.created_at)}</small>
                      {n.body}
                    </div>
                  ))}
                  <form onSubmit={addNote} className="stack">
                    <label className="sr-only" htmlFor="note">Add note</label>
                    <textarea id="note" className="textarea" rows={2} maxLength={2000} placeholder="Add an internal note (not visible to the patient)" value={note} onChange={(ev) => setNote(ev.target.value)} />
                    <button className="btn btn--sm" type="submit" disabled={!note.trim()}>Add note</button>
                  </form>
                </div>

                <h3>Notifications</h3>
                <ul className="list-plain">
                  {selected.notifications.map((n) => (
                    <li key={n.id}>
                      {n.channel} → {n.recipient} <span className={pill(n.status)}>{n.status.replace(/_/g, " ")}</span>
                      {n.last_error && <div className="muted">{n.last_error}</div>}
                      {(n.status === "failed" || n.status === "not_configured") && (
                        <button className="btn btn--sm" style={{ marginTop: 6 }} onClick={() => retry([n.id])}>Retry</button>
                      )}
                    </li>
                  ))}
                </ul>

                <h3>History</h3>
                <ul className="list-plain">
                  {selected.history.map((h, i) => (
                    <li key={i} className="muted">
                      {fmt(h.created_at)} — {h.from_status ? `${STATUS_LABELS[h.from_status as EnquiryStatus]} → ` : ""}
                      {STATUS_LABELS[h.to_status]} by {h.changed_by}
                    </li>
                  ))}
                </ul>

                {user.role === "admin" && (
                  <div style={{ marginTop: 18 }}>
                    <button className="btn btn--danger btn--sm" onClick={remove}>Delete request (data removal)</button>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>

        {metrics && (
          <section className="panel glass glass--soft">
            <h2>Integration status</h2>
            <ul className="list-plain">
              {Object.entries(metrics.integrations).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}</strong>: <span className="muted">{v}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
