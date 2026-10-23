"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { browser } from "@/lib/studio/browser";
import { baselineRules } from "@/lib/studio/guard-policy";
import "../studio.css";
type Activity = {
  id: string;
  role: string;
  content: string;
  decision: string;
  categories: string[];
  created_at: string;
};
type ParentData = {
  parentUnlockExpiresAt: string;
  email: string;
  deletionRequestedAt?: string | null;
  localContentErasedAt?: string | null;
  profile: {
    username: string;
    supervised_until: string | null;
    family_rules: string[];
  };
  history: Activity[];
  alerts: { id: string; sent_at: string | null; delivery_status: string; activity_id: string }[];
  inventory?: {
    app_requests?: number;
    projects: number; published_projects: number; activity: number; records: number;
    usage_records: number; unsettled_usage: number; notification_jobs: number;
    active_mail_leases: number; rooms: number;
  };
};
class ParentRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function parentCall(data?: unknown) {
  const s = await browser()?.auth.getSession();
  const r = await fetch("/api/parents", {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s?.data.session?.access_token || ""}`,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const v = await r.json();
  if (!r.ok) throw new ParentRequestError(v.error, r.status);
  return v;
}
export default function Parents() {
  const [data, setData] = useState<ParentData | null>(null),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [rules, setRules] = useState(""),
    [present, setPresent] = useState(false);
  const epoch = useRef(0), sequence = useRef(0);
  const clearPrivate = useCallback(() => {
    epoch.current++; sequence.current++;
    setData(null); setRules(""); setCode(""); setPresent(false); setBusy(false); setMessage("");
  }, []);
  useEffect(() => {
    const epochRef = epoch, sequenceRef = sequence;
    const subscription = browser()?.auth.onAuthStateChange(() => {
      clearPrivate();
      setMessage("Account changed. Verify a fresh parent code to view family history.");
    });
    return () => { epochRef.current++; sequenceRef.current++; subscription?.data.subscription.unsubscribe(); };
  }, [clearPrivate]);
  async function request(payload?: unknown) {
    const started = epoch.current;
    const result = await parentCall(payload);
    if (started !== epoch.current) throw new ParentRequestError("Parent session changed.", 403);
    return result;
  }
  const unlockExpiresAt = data?.parentUnlockExpiresAt;
  useEffect(() => {
    if (!unlockExpiresAt) return;
    const deadline = Date.parse(unlockExpiresAt);
    const clearExpired = () => {
      if (Number.isFinite(deadline) && Date.now() < deadline) return;
      clearPrivate();
      setMessage("Parent unlock expired. Verify a fresh email code to view family history again.");
    };
    const timer = window.setTimeout(clearExpired, Math.max(0, deadline - Date.now()) || 0);
    window.addEventListener("focus", clearExpired);
    document.addEventListener("visibilitychange", clearExpired);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", clearExpired);
      document.removeEventListener("visibilitychange", clearExpired);
    };
  }, [unlockExpiresAt, clearPrivate]);
  async function load() {
    const started = epoch.current, latest = ++sequence.current;
    const v = await request();
    if (started !== epoch.current || latest !== sequence.current) return;
    if (!v.parentUnlockExpiresAt || !Number.isFinite(Date.parse(v.parentUnlockExpiresAt)) || Date.parse(v.parentUnlockExpiresAt) <= Date.now())
      throw new ParentRequestError("Parent unlock expired. Verify a fresh email code.", 403);
    setData(v);
    setRules(v.profile.family_rules.join("\n"));
  }
  async function run(fn: () => Promise<void>) {
    const started = epoch.current;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (started !== epoch.current) return;
      if (e instanceof ParentRequestError && (e.status === 401 || e.status === 403)) {
        clearPrivate();
      }
      setMessage((e as Error).message);
    } finally {
      if (started === epoch.current) setBusy(false);
    }
  }
  return (
    <div className="studio">
      <main className="studio-main">
        <Link href="/">← Back to our studio</Link>
        <section className="panel" style={{ marginTop: 28 }}>
          <span className="eyebrow">FOR GROWN-UPS</span>
          <h1 style={{ fontSize: 36, fontWeight: 800 }}>
            Your family’s control room
          </h1>
          <p>
            This is a shared activity. Stay with your child throughout. The
            studio cannot detect whether a parent is physically present.
          </p>
          <p role="status">{message}</p>
          {!data ? (
            <>
              <p>
                Sign in to the guardian account first. A fresh email code
                unlocks these controls for 15 minutes. Keep access to your
                mailbox private.
              </p>
              <div className="button-row">
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request({ operation: "send-code" });
                      setMessage(
                        "A code was sent to the signed-in guardian’s verified email.",
                      );
                    })
                  }
                >
                  Send parent code
                </button>
                <button disabled={busy} onClick={() => run(load)}>
                  Check existing unlock
                </button>
              </div>
              <label>
                Code from your email
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !code}
                onClick={() =>
                  run(async () => {
                    await request({ operation: "unlock", code });
                    setCode("");
                    await load();
                  })
                }
              >
                Unlock parent controls
              </button>
            </>
          ) : (
            <>
              <p>Guardian email: {data.email}</p>
              <p>
                Supervised session:{" "}
                {data.profile.supervised_until
                  ? `ends ${new Date(data.profile.supervised_until).toLocaleTimeString()}`
                  : "paused"}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={present}
                  onChange={(e) => setPresent(e.target.checked)}
                />{" "}
                I will stay with my child and review what we make.
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !present}
                  onClick={() =>
                    run(async () => {
                      await request({ operation: "start", present });
                      await load();
                    })
                  }
                >
                  Start 30 minutes together
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request({ operation: "pause" });
                      await load();
                    })
                  }
                >
                  Pause building now
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await request({ operation: "lock" });
                      setData(null);
                    })
                  }
                >
                  Lock parent controls
                </button>
              </div>
              <p className="fine">
                Lock these controls before returning to the child-facing studio.
                A safety flag pauses building and queues a parent alert. Ending
                or pausing a session cannot cancel provider work already in
                progress.
              </p>
            </>
          )}
        </section>
        <section className="panel" aria-labelledby="guardloop-story">
          <span className="eyebrow">THE STORY BEHIND OUR GUARDRAILS</span>
          <h2 id="guardloop-story">Built in San Francisco, brought home for Ash</h2>
          <p>
            I participated in a hackathon in San Francisco, where I built
            GuardLoop to explore guardrails for AI agents. That work helped
            inspire the safeguards in this studio for Ash and the families
            building alongside us.
          </p>
          <p>
            As an AI builder and Ash’s dad, I take AI safety very seriously.
            I built safeguards into this product because I’m making it for my
            own son. Those safeguards support parents, and building together
            with an adult remains essential.
          </p>
          <p>
            Explore GuardLoop and share the link with other parents who want to
            learn about the project behind these ideas.
          </p>
          <a
            href="https://guardloop.aemalsayer.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore GuardLoop (opens in a new tab) ↗
          </a>
        </section>
        <section className="panel">
          <h2>Always-on family safeguards</h2>
          <p>
            These baseline rules cannot be switched off by a child or overridden
            by custom rules.
          </p>
          <ul>
            {baselineRules.map((r) => (
              <li key={r} style={{ margin: "12px 0" }}>
                {r}
              </li>
            ))}
          </ul>
        </section>
        {data && (
          <>
            <section className="panel">
              <h2>Stop access and public sharing</h2>
              <p>
                You can withdraw consent at any time. This stops building sessions,
                locks parent controls and removes your projects from public sharing.
                Returning requires a new consent review and administrator approval.
                Your projects, history and unused credits are kept. This does not
                delete your account or recall content already viewed or sent.
              </p>
              <button disabled={busy} onClick={() => {
                if (!window.confirm("Withdraw consent and stop all building and public sharing for this family? Projects and credits will be kept.")) return;
                void run(async () => {
                  await request({ operation: "withdraw-consent", confirmed: true });
                  setData(null);
                  setRules("");
                  setCode("");
                  setPresent(false);
                  setMessage("Consent withdrawn. Access and public sharing are stopped. A new review is needed before building again.");
                });
              }}>
                Withdraw consent
              </button>
            </section>
            <section className="panel">
              <h2>Your additional family rules</h2>
              <p>
                One rule per line, up to ten. For example: “Only science and
                drawing projects today” or “No scary characters.” These add
                restrictions; they cannot remove the baseline rules.
              </p>
              <label>
                Family rules
                <textarea
                  value={rules}
                  maxLength={4000}
                  onChange={(e) => setRules(e.target.value)}
                />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await request({
                      operation: "rules",
                      rules: rules
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    });
                    await load();
                    setMessage(
                      "Rules saved. Start a new supervised session when ready.",
                    );
                  })
                }
              >
                Save rules and pause session
              </button>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Project conversation & safety history</h2>
                <button disabled={busy} onClick={() => run(load)}>
                  Refresh
                </button>
              </div>
              <p>
                Includes typed building requests and generated results, with
                safety decisions. Voice remains disabled. Children should know
                this history is visible to their guardian. No full transcript is
                emailed.
              </p>
              {!data.history.length && <p>No recorded activity yet.</p>}
              {data.history.map((h) => (
                <article className="admin-row" key={h.id}>
                  <strong>
                    {h.role === "user" ? "Builder’s request" : "AI result"} ·{" "}
                    {h.decision}
                  </strong>
                  <small>
                    {new Date(h.created_at).toLocaleString()} ·{" "}
                    {h.categories.join(", ")}
                  </small>
                  <details>
                    <summary>Review what was discussed</summary>
                    <pre>{h.content}</pre>
                  </details>
                </article>
              ))}
              <button
                disabled={busy || !data.history.length}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this family’s saved activity and related alerts? This cannot be undone.",
                    )
                  )
                    void run(async () => {
                      await request({ operation: "clear-history" });
                      await load();
                    });
                }}
              >
                Delete family activity history
              </button>
              <p className="fine">
                The latest 100 entries are displayed. You can delete your
                family history here; provider data retention is separate. This does not
                delete projects or provider records.
              </p>
            </section>
            <section className="panel">
              <h2>Parent email alerts</h2>
              <p>
                Alerts go to your verified account email. Provider acceptance does
                not confirm inbox delivery. Pending alerts may need setup or admin review.
              </p>
              {data.alerts.map((a) => (
                <div className="admin-row" key={a.id}>
                  {a.delivery_status !== "unknown" ? `Delivery: ${a.delivery_status.replaceAll("_", " ")}` : a.sent_at ? "Accepted by email provider" : "Pending or needs review"}{" "}
                  {!a.sent_at && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const r = await request({
                            operation: "retry-alert",
                            id: a.id,
                          });
                          await load();
                          setMessage(
                            r.sent
                              ? "Accepted by email provider."
                              : "Not sent yet. A retry window or admin review may be required.",
                          );
                        })
                      }
                    >
                      Retry alert
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Your family’s data and deletion</h2>
              <p>You can clear conversation history above or withdraw consent to stop access and public sharing. Full account deletion needs a separate review.</p>
              {data.inventory && <>
                <ul>
                  <li>{data.inventory.projects} projects ({data.inventory.published_projects} published)</li>
                  <li>{data.inventory.activity} conversation entries and {data.inventory.records} saved app records ({data.inventory.app_requests ?? 0} storage request identifiers)</li>
                  <li>{data.inventory.rooms} multiplayer rooms and {data.inventory.notification_jobs} notification records</li>
                  <li>{data.inventory.usage_records} billing records, including {data.inventory.unsettled_usage} awaiting reconciliation</li>
                </ul>
                {data.inventory.unsettled_usage > 0 && <p>Some provider charges are unresolved. They need review before billing records can be removed.</p>}
                {data.inventory.active_mail_leases > 0 && <p>An email worker may be sending a notification. Deleting local data cannot recall an email already in flight.</p>}
              </>}
              <p>This is a current database snapshot. Provider records, delivered emails, backups and logs are separate. We do not claim those are erased when local history is cleared.</p>
              {data.localContentErasedAt && <p>Local projects, conversations and app data were erased on {new Date(data.localContentErasedAt).toLocaleDateString()}. Identity, billing and external records require separate review. This is not confirmation of full account deletion.</p>}
              {data.deletionRequestedAt ? <p role="status">Deletion review requested on {new Date(data.deletionRequestedAt).toLocaleDateString()}. Access remains stopped. Your account has not yet been erased.</p> : <button disabled={busy} onClick={() => {
                if (!window.confirm("Request account deletion review? Building and public sharing will stop immediately. Actual deletion requires a separate review of billing and provider records.")) return;
                void run(async () => {
                  await request({ operation: "request-deletion", confirmed: true });
                  setData(null); setRules(""); setCode(""); setPresent(false);
                  setMessage("Deletion review requested. Building and public sharing are stopped. Your account has not yet been erased. The administrator can see your request.");
                });
              }}>Request deletion review and stop access</button>}
              <a href="mailto:a@aemalsayer.com?subject=VibeKidding%20account%20deletion%20review&body=Please%20help%20me%20review%20deletion%20of%20my%20VibeKidding%20family%20account.%20Please%20tell%20me%20how%20to%20verify%20my%20identity%20and%20which%20records%20must%20be%20retained.">Contact Aemal about deletion</a>
              <small>Opens an email draft for you to review and send. No conversation content is included. This does not delete your account automatically.</small>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
