"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { browser, call } from "@/lib/studio/browser";
import { GeneratedPreview } from "@/components/GeneratedPreview";
import "../studio.css";
type Profile = {
  id: string;
  username: string;
  email: string;
  status: string;
  credits: number;
  email_verified_at: string | null;
  safety_revision: number;
};
type Project = {
  id: string;
  title: string;
  html: string;
  review_requested: boolean;
  published: boolean;
};
type Model = { id: string; input_rate: number; output_rate: number };
type AdminData = {
  storagePermissions?: { project_id: string; reviewed_html: string }[];
  deletionRequests: { user_id: string; requested_at: string; content_erased_at: string | null }[];
  setup: { id: string; label: string; status: string; detail: string }[];
  profiles: Profile[];
  models: Model[];
  projects: Project[];
  mailJobs: { id: string; kind: string; status: string; delivery_status: string; attempts: number; last_error: string | null }[];
  outbox: { id: string; kind: string; sent_at: string | null }[];
  usage: {
    id: string;
    provider: string;
    state: string;
    reserved: number;
    charged: number | null;
    provider_request_id: string | null;
  }[];
  grants: { user_id: string; model_id: string }[];
};
export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [catalog, setCatalog] = useState<string[]>([]),
    [model, setModel] = useState(""),
    [input, setInput] = useState(""),
    [output, setOutput] = useState("");
  const epoch = useRef(0), sequence = useRef(0);
  const clearPrivate = useCallback(() => {
    epoch.current++; sequence.current++;
    setData(null); setCatalog([]); setModel(""); setInput(""); setOutput(""); setMessage(""); setBusy(false);
  }, []);
  const load = useCallback(async () => {
    const started = epoch.current, request = ++sequence.current;
    const current = () => started === epoch.current && request === sequence.current;
    try {
      const result = await call("admin");
      if (current()) setData(result);
    } catch (e) {
      if (current()) { clearPrivate(); setMessage((e as Error).message); }
    }
  }, [clearPrivate]);
  useEffect(() => {
    let disposed = false;
    const epochRef = epoch, sequenceRef = sequence;
    void Promise.resolve().then(() => { if (!disposed) return load(); });
    const subscription = browser()?.auth.onAuthStateChange(() => {
      clearPrivate();
      setTimeout(() => { if (!disposed) void load(); }, 0);
    });
    return () => { disposed = true; epochRef.current++; sequenceRef.current++; subscription?.data.subscription.unsubscribe(); };
  }, [load, clearPrivate]);
  async function run(fn: (current: () => boolean) => Promise<void>) {
    const started = epoch.current;
    const current = () => started === epoch.current;
    setBusy(true); setMessage("");
    try {
      await fn(current);
      if (current()) await load();
    } catch (e) {
      if (current()) { clearPrivate(); setMessage((e as Error).message); }
    } finally { if (current()) setBusy(false); }
  }
  return (
    <div className="studio">
      <main className="studio-main">
        <Link href="/">← Project studio</Link>
        <h1 style={{ fontSize: 36, fontWeight: 700, margin: "25px 0" }}>
          Guardian & admin desk
        </h1>
        <p role="status">{message}</p>
        {data && (
          <>
            <section className="panel">
              <h2>Setup and launch checks</h2>
              <p>Configuration is only the first step. Live verification and consent review are still required.</p>
              {data.setup.map(check => (
                <div className="admin-row" key={check.id}>
                  <strong>{check.label} · {check.status}</strong>
                  <p className="fine">{check.detail}</p>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Model catalog & reviewed pricing</h2>
              <p>
                Discover models using the actual API key. Listing does not
                guarantee Responses API compatibility. Review the provider’s
                prices before enabling a model; prices expire after 30 days.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async (current) => { const result = await call("catalog"); if (current()) setCatalog(result.models); })
                }
              >
                Refresh available API models
              </button>
              <label>
                Available model
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">Select model</option>
                  {catalog.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <label>
                  Input micro-USD / million tokens
                  <input
                    type="number"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </label>
                <label>
                  Output micro-USD / million tokens
                  <input
                    type="number"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !model}
                  onClick={() =>
                    run(async () => {
                      await call("admin", {
                        operation: "model",
                        model,
                        inputRate: Number(input),
                        outputRate: Number(output),
                      });
                    })
                  }
                >
                  Save reviewed rates
                </button>
              </div>
            </section>
            <div className="admin-grid">
              {data.profiles.map((p) => (
                <Account
                  key={p.id}
                  p={p}
                  models={data.models}
                  grants={data.grants
                    .filter((g) => g.user_id === p.id)
                    .map((g) => g.model_id)}
                  busy={busy}
                  run={run}
                />
              ))}
            </div>
            <section className="panel" style={{ marginTop: 25 }}>
              <h2>Publishing review</h2>
              <p>
                Inspect the preview and source for personal details, unsafe
                links, and unsuitable content. Public projects can be viewed
                without sign-in. Generated code runs in a restricted preview and receives no platform
                credentials.
              </p>
              {data.projects
                .filter((p) => p.review_requested || p.published)
                .map((p) => (
                  <article className="admin-row" key={p.id}>
                    <strong>{p.title}</strong>
                    <GeneratedPreview
                      className="admin-preview"
                      title={p.title}
                      
                      html={p.html}
                    />
                    <details>
                      <summary>Review source</summary>
                      <pre>{p.html}</pre>
                    </details>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await call("admin", {
                            operation: "publish",
                            projectId: p.id,
                            reviewedHtml: p.html,
                            published: !p.published,
                          });
                        })
                      }
                    >
                      {p.published ? "Unpublish" : "Approve public sharing"}
                    </button>
                    {p.published && <div>
                      <p>Viewer storage: {(data.storagePermissions || []).some(permission => permission.project_id === p.id && permission.reviewed_html === p.html) ? "approved for this code" : "not approved for this code"}. Each supervised viewer has separate data. The app bridge is still awaiting launch review.</p>
                      <button disabled={busy} onClick={() => run(async () => {
                        await call("admin", { operation: "app-storage", projectId: p.id, reviewedHtml: p.html, allow: true });
                      })}>Approve storage for reviewed code</button>
                      <button disabled={busy} onClick={() => run(async () => {
                        await call("admin", { operation: "app-storage", projectId: p.id, allow: false });
                      })}>Revoke storage access</button>
                    </div>}
                  </article>
                ))}
            </section>
            <section className="panel">
              <h2>Notification delivery</h2>
              <p>
                Recipient: a@aemalsayer.com. Messages remain pending until accepted by the email provider.
                Inbox delivery is not yet confirmed.
              </p>
              <h3>Notification worker</h3>
              <p className="fine">Jobs marked “review” will not be resent automatically. Check provider records before resolving an uncertain delivery.</p>
              {data.mailJobs.map((job) => (
                <div className="admin-row" key={job.id}>
                  <span>{job.kind === "parent" ? "Parent safety alert" : "Admin notification"}: {job.status} · delivery: {job.delivery_status} · {job.attempts} attempts{job.last_error ? ` · ${job.last_error}` : ""}</span>
                  <small>{job.id}</small>
                </div>
              ))}
              {data.outbox.map((o) => (
                <div className="admin-row" key={o.id}>
                  {o.kind}: {o.sent_at ? "Accepted by email provider" : "Pending or needs review"}{" "}
                  {!o.sent_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async (current) => {
                          const r = await call("admin", {
                            operation: "mail",
                            id: o.id,
                          });
                          if (!current()) return;
                          setMessage(
                            r.sent
                              ? "Accepted by email provider"
                              : "Not sent: awaiting setup, retry window, or manual review.",
                          );
                        })
                      }
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Usage ledger</h2>
              <p>
                Unsettled reservations stay charged until provider billing is
                reconciled. Never refund a timed-out request without checking
                the provider.
              </p>
              {data.usage.map((u) => (
                <UsageReview key={u.id} usage={u} busy={busy} run={run} />
              ))}
            </section>
          </>
        )}
        {data && <section className="panel">
          <h2>Account deletion review requests</h2>
          <p>Access and public sharing are stopped for these families. Review unresolved charges, provider retention, backups and identity before erasure. A request is not confirmation that data has been deleted.</p>
          {(data.deletionRequests || []).length === 0 && <p>No deletion requests recorded.</p>}
          {(data.deletionRequests || []).map(request => <div className="panel" key={request.user_id}>
            <strong>{data.profiles.find(profile => profile.id === request.user_id)?.email || request.user_id}</strong>
            <p>Requested {new Date(request.requested_at).toLocaleString()}</p>
            {request.content_erased_at ? <p>Local content erased {new Date(request.content_erased_at).toLocaleString()}. Identity, billing and provider records remain for separate review.</p> : <>
              <p>Review this request before erasing projects, conversations, saved app data and shared game rooms. This cannot be undone here. Identity, billing and external records remain.</p>
              <button disabled={busy} onClick={() => {
                if (!window.confirm("Permanently erase this family's local projects, conversations, app records and shared game rooms? Verify the guardian request first. Identity, billing and external records will remain.")) return;
                void run(async () => {
                  await call("admin", { operation: "erase-local-content", userId: request.user_id, requestedAt: request.requested_at, confirmed: true });
                });
              }}>Erase reviewed local content</button>
            </>}
          </div>)}
        </section>}
      </main>
    </div>
  );
}
function Account({
  p,
  models,
  grants,
  busy,
  run,
}: {
  p: Profile;
  models: Model[];
  grants: string[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [reference, setReference] = useState(""),
    [amount, setAmount] = useState(""),
    [model, setModel] = useState("");
  return (
    <section className="panel">
      <h2>{p.username}</h2>
      <p>{p.email}</p>
      <p>
        {p.status} · Email {p.email_verified_at ? "verified" : "not verified"} ·{" "}
        {p.credits.toLocaleString()} credits
      </p>
      <label>
        Guardian consent review reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Reference to consent record, not child details"
        />
      </label>
      <div className="button-row">
        <button
          disabled={busy || !p.email_verified_at || !reference}
          onClick={() =>
            run(async () => {
              await call("admin", {
                operation: "approve",
                userId: p.id,
                consentReference: reference,
                revision: p.safety_revision,
              });
            })
          }
        >
          Approve reviewed account
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await call("admin", { operation: "suspend", userId: p.id });
            })
          }
        >
          Suspend
        </button>
      </div>
      <label>
        Credit adjustment (negative to debit)
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !amount}
        onClick={() =>
          run(async () => {
            await call("admin", {
              operation: "credits",
              userId: p.id,
              amount: Number(amount),
              requestId: crypto.randomUUID(),
            });
            setAmount("");
          })
        }
      >
        Apply adjustment
      </button>
      <label>
        Model access
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">Choose reviewed model</option>
          {models.map((m) => (
            <option key={m.id}>{m.id}</option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !model}
        onClick={() =>
          run(async () => {
            await call("admin", {
              operation: "grant-model",
              userId: p.id,
              model,
            });
          })
        }
      >
        Grant model
      </button>
      {grants.map((m) => (
        <p key={m}>
          {m}{" "}
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await call("admin", {
                  operation: "revoke-model",
                  userId: p.id,
                  model: m,
                });
              })
            }
          >
            Revoke
          </button>
        </p>
      ))}
    </section>
  );
}

function UsageReview({ usage, busy, run }: {
  usage: AdminData["usage"][number]; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [charge, setCharge] = useState("");
  const [evidence, setEvidence] = useState("");
  const [record, setRecord] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <div className="admin-row">
    <p>{usage.provider} · {usage.state} · {usage.charged ?? usage.reserved} credits · {usage.id}</p>
    {usage.provider_request_id && <p className="fine">Provider request: {usage.provider_request_id}</p>}
    {usage.state === "reserved" && <details>
      <summary>Reconcile using provider evidence</summary>
      <p className="fine">Only reservations older than one hour can be reconciled. Verify the actual provider charge first. A timeout is not evidence of a zero charge. Keep private invoices outside this form.</p>
      <label>Verified charge in micro-USD<input type="number" min="0" max={usage.reserved} step="1" value={charge} onChange={e => setCharge(e.target.value)} /></label>
      <label>Reference to reviewed billing evidence<input value={evidence} maxLength={500} onChange={e => setEvidence(e.target.value)} /></label>
      <label>Provider billing or request record<input value={record} maxLength={200} onChange={e => setRecord(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed provider evidence and confirmed this charge.</label>
      <button disabled={busy || charge === "" || !confirmed || evidence.trim().length < 8 || record.trim().length < 3} onClick={() => run(async () => {
        await call("admin", { operation: "reconcile", usageId: usage.id, charge: Number(charge), evidence, providerRecord: record, confirmed });
      })}>Settle reviewed charge</button>
    </details>}
  </div>;
}
