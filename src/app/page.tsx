"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Plus,
  LogOut,
  Palette,
  FlaskConical,
  BookOpen,
  Gamepad2,
} from "lucide-react";
import Link from "next/link";
import { browser, call } from "@/lib/studio/browser";
import { GeneratedPreview } from "@/components/GeneratedPreview";
import "./studio.css";
import { SamanthaHero } from "@/components/SamanthaShowcase";
import { ParentLanding } from "@/components/ParentLanding";
import { StudioVoice } from "@/components/StudioVoice";
type Project = {
  id: string;
  title: string;
  slug: string;
  html: string;
  published: boolean;
  review_requested: boolean;
};
type Profile = {
  id: string;
  username: string;
  credits: number;
  status: string;
  email_verified_at: string | null;
};
export default function Studio() {
  const [account, setAccount] = useState<{
    profile: Profile | null;
    admin: boolean;
    email: string;
    ready: boolean;
  } | null>(null);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [guardian, setGuardian] = useState(false),
    [username, setUsername] = useState("");
  const [projects, setProjects] = useState<Project[]>([]),
    [selected, setSelected] = useState<Project | null>(null),
    [models, setModels] = useState<{ id: string }[]>([]),
    [model, setModel] = useState("");
  const [prompt, setPrompt] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const authEpoch = useRef(0), reloadSequence = useRef(0);
  const clearPrivateState = useCallback(() => {
    authEpoch.current++;
    reloadSequence.current++;
    setAccount(null); setProjects([]); setSelected(null); setModels([]); setModel("");
    setPrompt(""); setEmail(""); setCode(""); setSent(false); setGuardian(false); setUsername("");
    setMessage(""); setBusy(false);
  }, []);
  const reload = useCallback(async () => {
    const epoch = authEpoch.current, sequence = ++reloadSequence.current;
    const current = () => epoch === authEpoch.current && sequence === reloadSequence.current;
    try {
      const s = await browser()?.auth.getSession();
      if (!current()) return;
      if (!s?.data.session) { clearPrivateState(); setLoading(false); return; }
      const a = await call("me");
      if (!current()) return;
      setAccount(a); setEmail(a.email); setLoading(false);
      if (a.profile?.status === "approved" && a.profile.email_verified_at && a.ready) {
        const p = await call("projects");
        if (!current()) return;
        setProjects(p.projects);
        try {
          const m = await call("models");
          if (!current()) return;
          setModels(m.models);
          setModel(old => m.models.some((v: { id: string }) => v.id === old) ? old : m.models[0]?.id || "");
        } catch (e) { if (current()) { setModels([]); setModel(""); setMessage((e as Error).message); } }
      } else { setProjects([]); setSelected(null); setModels([]); setModel(""); setPrompt(""); }
    } catch (e) {
      if (current()) { clearPrivateState(); setLoading(false); setMessage((e as Error).message); }
    }
  }, [clearPrivateState]);
  useEffect(() => {
    let disposed = false;
    const epochRef = authEpoch, sequenceRef = reloadSequence;
    void Promise.resolve().then(() => { if (!disposed) return reload(); });
    const sub = browser()?.auth.onAuthStateChange(() => {
      clearPrivateState();
      setTimeout(() => { if (!disposed) void reload(); }, 0);
    });
    return () => { disposed = true; epochRef.current++; sequenceRef.current++; sub?.data.subscription.unsubscribe(); };
  }, [reload, clearPrivateState]);
  async function run(fn: (current: () => boolean) => Promise<void>) {
    const epoch = authEpoch.current;
    const current = () => epoch === authEpoch.current;
    setBusy(true);
    setMessage("");
    try {
      await fn(current);
    } catch (e) {
      if (current()) setMessage((e as Error).message);
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function sendCode() {
    const epoch = authEpoch.current;
    const auth = browser();
    if (!auth) throw new Error("Supabase setup is required before signing in.");
    const result = await auth.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: !account },
    });
    if (epoch !== authEpoch.current) return;
    if (result.error) throw result.error;
    setSent(true);
    setMessage("Check your inbox for a code.");
  }
  async function verify() {
    const epoch = authEpoch.current;
    const result = await call("verify", { email, token: code });
    if (epoch !== authEpoch.current) return;
    const r = await browser()!.auth.setSession(result.session);
    if (r.error) throw r.error;
    setCode("");
    setSent(false);
    await reload();
  }
  async function generate() {
    const epoch = authEpoch.current;
    let p = selected;
    if (!p) {
      p = (
        await call("projects", { title: prompt.slice(0, 65) || "My new idea" })
      ).project;
      if (epoch !== authEpoch.current) return;
      setSelected(p);
    }
    const result = await call("generate", {
      projectId: p!.id,
      prompt,
      model,
      requestId: crypto.randomUUID(),
    });
    if (epoch !== authEpoch.current) return;
    setSelected(result.project);
    setMessage(
      `Saved! This build used ${result.charged.toLocaleString()} generation credits. Safety checks may reserve additional credits.`,
    );
    await reload();
  }
  const ready =
    account?.profile?.status === "approved" &&
    !!account.profile.email_verified_at &&
    account.ready;
  const starters = [
    {
      icon: Palette,
      title: "Make something beautiful",
      text: "A drawing pad with rainbow brushes",
      color: "peach",
    },
    {
      icon: FlaskConical,
      title: "Explore a big question",
      text: "An interactive guide to the solar system",
      color: "mint",
    },
    {
      icon: BookOpen,
      title: "Tell your own story",
      text: "A choose-your-own-adventure in a magical forest",
      color: "lilac",
    },
    {
      icon: Gamepad2,
      title: "Invent a little game",
      text: "A friendly memory game about animals",
      color: "yellow",
    },
  ];
  return (
    <div className="studio">
      <header className="studio-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            v<span>✦</span>
          </span>
          VibeKidding
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/parents">Parent controls</Link>
          {!account && <a href="#ai-safety">AI Safety</a>}
          {!account && <a href="#privacy">Privacy</a>}
          {!account && (
            <>
              <a className="parent-nav-link" href="#how-it-works">
                How it works
              </a>
              <a className="parent-nav-link" href="#languages">
                Languages
              </a>
              <a className="parent-nav-link" href="#for-parents">
                For parents
              </a>
              <a className="parent-nav-link" href="#privacy">
                Privacy & supervision
              </a>
              <a className="parent-nav-link" href="#questions">
                Questions
              </a>
              <a href="#get-started">Get started ↗</a>
            </>
          )}
          {account?.admin && <Link href="/admin">Admin</Link>}
          {account && (
            <button
              className="quiet"
              onClick={() =>
                run(async () => {
                  clearPrivateState();
                  await browser()?.auth.signOut();
                })
              }
            >
              <LogOut size={16} /> Sign out
            </button>
          )}
        </nav>
      </header>
      <main className="studio-main">
        <div className="eyebrow">
          <span /> MADE FOR ASH. SHARED WITH A FEW FRIENDS.
        </div>
        <section className="hero">
          <div>
            <h1>
              {account ? (
                <>
                  What will you
                  <br />
                  <em>dream up</em> today?
                </>
              ) : (
                <>
                  Little makers.
                  <br />
                  <em>Big adventures.</em>
                  <br />
                  Together with you.
                </>
              )}
            </h1>
            <p>
              {account ? (
                <>
                  A story, a science experiment, a helpful little app.
                  <br />
                  Your ideas belong here. Let’s make them real.
                </>
              ) : (
                <>
                  Help your child turn curiosity into stories, games and useful
                  little apps. Start in the language that feels like home. Build
                  something together.
                </>
              )}
            </p>
            {!account && (
              <div className="hero-parent-actions">
                <a className="parent-cta" href="#get-started">
                  Start creating together <ArrowUpRight size={18} />
                </a>
                <a href="#languages">Explore an idea in your language ↓</a>
                <small>
                  Made for supervised exploration · Guardian approval required
                </small>
              </div>
            )}
          </div>
          {!account && <SamanthaHero />}
        </section>
        {!account && <ParentLanding onIdea={setPrompt} />}
        <div id="get-started" className="signup-anchor" />
        <div role="status" aria-live="polite">
          {message && <p className="studio-notice">{message}</p>}
        </div>
        {loading ? (
          <section className="panel">Opening your studio…</section>
        ) : !account ? (
          <section className="panel access">
            <div>
              <ShieldCheck size={30} />
              <h2>A little help from a grown-up.</h2>
              <p>
                A parent or guardian creates the account, verifies their email,
                and requests approval. Kids use the studio with their grown-up.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={guardian}
                  onChange={(e) => setGuardian(e.target.checked)}
                />{" "}
                I’m the parent or guardian setting up this account.
              </label>
              <p className="fine">
                Use a grown-up’s email. Please don’t enter a child’s name,
                birthday, school, or address. Email verification is not proof of
                guardian consent.
              </p>
            </div>
            <div className="auth-form">
              <button
                disabled={!guardian || busy || !browser()}
                onClick={() =>
                  run(async () => {
                    const r = await browser()!.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: window.location.origin },
                    });
                    if (r.error) throw r.error;
                  })
                }
              >
                Continue with Google <ArrowUpRight size={16} />
              </button>
              <span className="fine">or use an email code</span>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {sent && (
                <label>
                  Email code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              )}
              <button
                className="primary"
                disabled={!guardian || busy || !email || !browser()}
                onClick={() => run(sent ? verify : sendCode)}
              >
                {sent ? "Verify code" : "Send a code"}
              </button>
              {!browser() && (
                <p className="fine">
                  Preview mode: sign-in needs Supabase configuration.
                </p>
              )}
            </div>
          </section>
        ) : !account.profile ? (
          <section className="panel access">
            <div>
              <h2>Choose your builder nickname</h2>
              <p>
                This appears in shared links. Use a nickname, not a child’s real
                name.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={guardian}
                  onChange={(e) => setGuardian(e.target.checked)}
                />{" "}
                I’m the parent or guardian requesting supervised access.
              </label>
            </div>
            <div className="auth-form">
              <label>
                Nickname
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  placeholder="cosmic-panda"
                />
              </label>
              <button
                disabled={busy || !guardian}
                className="primary"
                onClick={() =>
                  run(async (current) => {
                    await call("enroll", { username, guardian });
                    if (!current()) return;
                    await reload();
                    if (!current()) return;
                    setMessage(
                      "Request saved. Please verify your email code, then wait for admin approval.",
                    );
                  })
                }
              >
                Request access
              </button>
            </div>
          </section>
        ) : !ready ? (
          <section className="panel access">
            <div>
              <h2>
                {!account.profile.email_verified_at
                  ? "One more step: verify your email"
                  : account.profile.status === "suspended"
                    ? "Account paused"
                    : "Your studio is getting ready"}
              </h2>
              <p>
                {!account.profile.email_verified_at
                  ? "A code is required after registration, including Google sign-in."
                  : "Your admin needs to review guardian consent, approve access, and assign credits and models."}
              </p>
              <p className="fine">
                Status: {account.profile.status} · Email{" "}
                {account.profile.email_verified_at
                  ? "verified"
                  : "code required"}
                {!account.ready ? " · Child privacy setup pending" : ""}
              </p>
            </div>
            <div className="auth-form">
              {!account.profile.email_verified_at && (
                <>
                  <button disabled={busy} onClick={() => run(sendCode)}>
                    Send verification code
                  </button>
                  <label>
                    Email code
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <button
                    disabled={busy || !code}
                    className="primary"
                    onClick={() => run(verify)}
                  >
                    Verify email
                  </button>
                </>
              )}
              <button disabled={busy} onClick={() => run(reload)}>
                Check approval status
              </button>
            </div>
          </section>
        ) : (
          <section className="workspace">
            <div className="panel composer">
              <div className="section-heading">
                <h2>Your idea workshop</h2>
                <span className="credit-badge">
                  {account.profile.credits.toLocaleString()} credits
                </span>
              </div>
              <p>
                Tell us what you want to make. Keep names and personal details
                private.
              </p>
              <label htmlFor="idea">My idea</label>
              <textarea
                id="idea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={3000}
                placeholder="I want to build a…"
              />
              <label>
                Building model
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">Choose an approved model</option>
                  {models.map((m) => (
                    <option key={m.id}>{m.id}</option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !prompt.trim() || !model}
                  onClick={() => run(generate)}
                >
                  <Sparkles size={18} />
                  {busy
                    ? "Working…"
                    : selected
                      ? "Improve my project"
                      : "Build my idea"}
                </button>
                <StudioVoice onIdea={setPrompt} onError={setMessage} />
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run(async (current) => {
                    const r = await call("credits", {});
                    if (!current()) return;
                    setMessage(r.message);
                  })
                }
              >
                Ask for more credits
              </button>
              <p className="fine">
                AI can make mistakes. A grown-up reviews projects before public
                sharing. 1,000,000 credits = $1 of metered AI usage.
              </p>
            </div>
            <div className="panel preview">
              <div className="section-heading">
                <h2>{selected?.title || "Your creation goes here"}</h2>
                {selected && (
                  <button className="quiet" onClick={() => setSelected(null)}>
                    <Plus size={16} /> New
                  </button>
                )}
              </div>
              {selected?.html ? (
                <GeneratedPreview
                  title="Your project preview"
                  
                  
                  html={selected.html}
                />
              ) : (
                <div className="preview-empty">
                  <span>✦</span>
                  <p>
                    One small idea.
                    <br />A whole world of possibilities.
                  </p>
                </div>
              )}
              {selected?.html && (
                <div className="button-row">
                  <button
                    disabled={busy || selected.review_requested}
                    onClick={() =>
                      run(async (current) => {
                        await call("review", { projectId: selected.id });
                        if (!current()) return;
                        setSelected({ ...selected, review_requested: true });
                        setMessage(
                          "Sent for adult review before public sharing.",
                        );
                      })
                    }
                  >
                    {selected.review_requested
                      ? "Review requested"
                      : "Ask to share"}
                  </button>
                  {selected.published && (
                    <Link
                      href={`/${account.profile.username}/${selected.slug}`}
                      target="_blank"
                    >
                      Open shared project ↗
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        <section className="inspiration">
          <div className="section-heading">
            <h2>A spark to get you started</h2>
            <span>No idea is too small.</span>
          </div>
          <div className="starter-grid">
            {starters.map((s) => (
              <button
                className={`starter ${s.color}`}
                key={s.title}
                onClick={() => {
                  setPrompt(s.text);
                  setSelected(null);
                  setMessage(
                    ready
                      ? "Idea added to your workshop."
                      : "Sign in with a grown-up to build this idea.",
                  );
                  document.getElementById("idea")?.focus();
                }}
              >
                <s.icon size={28} />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <ArrowUpRight size={20} />
              </button>
            ))}
          </div>
        </section>
        {ready && (
          <section className="panel">
            <div className="section-heading">
              <h2>My projects</h2>
              <Link href="/play">Play realtime tic-tac-toe ↗</Link>
            </div>
            {projects.length === 0 ? (
              <p>Your first creation starts with an idea above.</p>
            ) : (
              <div className="project-list">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p)}>
                    <span>✦ {p.title}</span>
                    <small>
                      {p.published
                        ? "Shared"
                        : p.review_requested
                          ? "In review"
                          : "Private draft"}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        <footer>
          <span>✦ Made for curious minds.</span>
          <span>Imagine freely. Build together. Share thoughtfully.</span>
          <Link href="/v1" style={{ fontSize: 12 }}>V1 archive</Link>
        </footer>
      </main>
    </div>
  );
}
