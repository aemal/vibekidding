"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { GeneratedPreview } from "@/components/GeneratedPreview";
import { decodeShareFragment, DemoShareError, type SharedBuild } from "@/lib/demo-share";

type Incoming = { status: "loading" } | { status: "cancelled" } | { status: "error"; message: string } | { status: "ready"; build: SharedBuild; fragment: string };

export function SharedProjectPlayer() {
  const [incoming, setIncoming] = useState<Incoming>({ status: "loading" });
  const [playing, setPlaying] = useState(false);
  const [restart, setRestart] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const decodeEpoch = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;
    const decode = async () => {
      const epoch = ++decodeEpoch.current;
      const fragment = window.location.hash;
      setPlaying(false);
      setIncoming({ status: "loading" });
      try {
        if (!fragment) {
          if (live) setIncoming({ status: "error", message: "This link doesn’t contain a project. Ask the maker to copy the complete playable link." });
          return;
        }
        const build = await decodeShareFragment(fragment);
        if (!live || epoch !== decodeEpoch.current || window.location.hash !== fragment) return;
        setIncoming({ status: "ready", build, fragment });
      } catch (error) {
        if (!live || epoch !== decodeEpoch.current || window.location.hash !== fragment) return;
        setIncoming({ status: "error", message: error instanceof DemoShareError ? error.message : "We couldn’t open this project link. Ask for the complete link or an HTML export instead." });
      }
    };
    const onHashChange = () => { void decode(); };
    queueMicrotask(() => { if (live) void decode(); });
    window.addEventListener("hashchange", onHashChange);
    return () => { live = false; window.removeEventListener("hashchange", onHashChange); };
  }, [reviewAttempt]);

  useEffect(() => { if (playing) heading.current?.focus(); }, [playing]);
  function cancel() {
    decodeEpoch.current++;
    // Playback-only cancellation is local state. Leave browser/router history alone.
    setPlaying(false);
    setIncoming({ status: "cancelled" });
  }
  function play() {
    if (incoming.status !== "ready" || window.location.hash !== incoming.fragment) return;
    setPlaying(true);
  }

  return <div className="demo-studio demo-shared-page">
    <header className="demo-header"><Link prefetch={false} href="/demo" className="demo-brand"><span className="demo-mark">v<span>✦</span></span>VibeKidding</Link><span className="demo-tag">SHARED CREATION</span></header>
    <main className={`demo-shared-main${playing ? " is-playing" : ""}`}>
      <Link prefetch={false} href="/demo" className="demo-shared-back"><ArrowLeft size={16} /> Back to workshop</Link>
      {incoming.status === "loading" && <section className="demo-panel demo-shared-confirm" aria-live="polite"><span className="demo-shared-spark" aria-hidden="true">✦</span><h1>Opening a little possibility…</h1><p>Reading the project link. Nothing is playing yet.</p></section>}
      {incoming.status === "cancelled" && <section className="demo-panel demo-shared-confirm"><span className="demo-shared-spark" aria-hidden="true">✧</span><h1>Project not opened</h1><p role="status">The shared link was set aside. Nothing played or changed on your shelf.</p><div className="demo-shared-confirm-actions"><button type="button" className="demo-primary" onClick={() => setReviewAttempt(value => value + 1)}>Review link again</button><Link prefetch={false} href="/demo" className="demo-secondary">Back to workshop</Link></div></section>}
      {incoming.status === "error" && <section className="demo-panel demo-shared-confirm"><span className="demo-shared-spark" aria-hidden="true">✧</span><h1>This link needs another try</h1><p role="alert">{incoming.message}</p><p>Ask the maker for a new playable link, or an exported HTML file if the project is too large.</p><Link prefetch={false} href="/demo" className="demo-secondary">Open the workshop</Link></section>}
      {incoming.status === "ready" && !playing && <section className="demo-panel demo-shared-confirm" aria-labelledby="shared-project-title"><p className="demo-eyebrow">SOMEBODY MADE SOMETHING FOR YOU</p><span className="demo-shared-spark" aria-hidden="true">✦</span><h1 id="shared-project-title">{incoming.build.title}</h1><p>This is a playable copy of someone’s project. Check with your grown-up before playing a link someone shared.</p><p className="demo-fine">Nothing runs until you choose Play. This opens an isolated preview; it doesn’t add the project to your shelf. No account or AI call is needed.</p><div className="demo-shared-confirm-actions"><button type="button" className="demo-primary" onClick={play}><Play size={17} /> Play shared project</button><button type="button" className="demo-secondary" onClick={cancel}>Cancel</button></div></section>}
      {incoming.status === "ready" && playing && <section className="demo-panel demo-shared-player" aria-labelledby="playing-project-title"><div className="demo-preview-toolbar"><div><span className="demo-step">A SHARED SNAPSHOT · READY TO PLAY</span><h1 ref={heading} tabIndex={-1} id="playing-project-title">{incoming.build.title}</h1></div><button type="button" className="demo-secondary" onClick={() => setRestart(value => value + 1)}><RotateCcw size={15} /> Restart play</button></div><GeneratedPreview key={`${incoming.fragment}:${restart}`} html={incoming.build.html} title={`${incoming.build.title} shared play preview`} className="demo-shared-frame" /><div className="demo-preview-bottom">Play progress stays in this visit. Restarting or leaving starts the project over.</div></section>}
    </main>
    <footer className="demo-shared-footer">✦ A little idea, passed along. This link shares a snapshot, not a live project.</footer>
  </div>;
}
