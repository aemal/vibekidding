"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Copy, Download, History, LoaderCircle, Maximize2, Pencil, Plus, RotateCcw, Share2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { GeneratedPreview } from "@/components/GeneratedPreview";
import { sandboxDocument } from "@/lib/studio/sandbox";
import { starters } from "./starters";
import { templateProject } from "@/lib/demo-server/template";
import { BrowserDictation } from "./BrowserDictation";
import { createShareUrl, DemoShareError, type SharedBuild } from "@/lib/demo-share";
import { createSharedCopy, parseCopyFragment } from "@/lib/demo-shared-copy";
import { ShareQRCode } from "./ShareQRCode";
import { DemoSamanthaVoice } from "./DemoSamanthaVoice";

import { copyProject, MAX_BACKUP_BYTES, MAX_HTML, MAX_PROJECTS, MAX_VERSIONS, parseBackup, persistProjects, ProjectStorageConflictError, serializeBackup, validProjects, type Project, type Version } from "./project-backup";

const workshopStarters = [
  ...starters,
  { title: "Music garden", emoji: "🎵", color: "honey", description: "Tap piano notes to make a melody. Sound starts only when you play.", html: templateProject("Make a musical garden piano").html },
  { title: "Little checklist", emoji: "🌱", color: "sage", description: "Make a little plan. Checkmarks last only for this preview visit.", html: templateProject("Make a garden daily checklist").html },
];

type CopyRequest = { status: "loading"; fragment: string } | { status: "ready"; fragment: string; build: SharedBuild } | { status: "error"; fragment: string; message: string } | { status: "dismissed" | "done"; fragment: string };
const versionLabel = (mode: Version["mode"] | undefined) => mode === "shared" ? "Shared copy" : mode === "ai" ? "AI build" : "Template build";

type Readiness = { enabled: boolean; mode: "ai" | "template"; publicTemplateOnly?: boolean; message?: string; limits?: { promptCharacters?: number } };
const promptSuggestions = [
  { label: "Memory match", prompt: "Make an easy ocean memory matching game" },
  { label: "Drawing pad", prompt: "Make a pink garden drawing pad" },
  { label: "Addition quiz", prompt: "Make an easy space addition quiz" },
  { label: "Branching story", prompt: "Make a garden choose-your-own story" },
  { label: "Collector game", prompt: "Make a blue ocean collector game" },
  { label: "Tic-tac-toe · 2 players", prompt: "Make a garden tic-tac-toe game for two players on the same device" },
  { label: "Music garden", prompt: "Make a musical garden piano" },
  { label: "Checklist", prompt: "Make a garden daily checklist" },
];
const speechLanguages = [
  { value: "en-US", label: "English (US)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
  { value: "ar-SA", label: "العربية" },
  { value: "fr-FR", label: "Français" },
  { value: "hi-IN", label: "हिन्दी" },
];
// This bridge only requests closing large play; the parent checks the iframe identity.
const playEscapeBridge = `<script>document.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();window.parent.postMessage({type:'vibekidding-demo-exit-play'},'*')}});</script>`;
const STORAGE_KEY = "vibekidding-demo-projects-v1";
// Called only by user actions and completed generation requests, never during render.
const eventTimestamp = () => Date.now();
const date = (time: number) => new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function DemoWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessError, setReadinessError] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [voiceInputMode, setVoiceInputMode] = useState<"dictation" | "samantha">("dictation");
  const [speechLanguage, setSpeechLanguage] = useState("en-US");
  const [dictationContext, setDictationContext] = useState(0);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const locked = busy || importing;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [storageConflict, setStorageConflict] = useState(false);
  const storageBaseline = useRef<string | null>(null);
  const storageBlocked = useRef(false);
  const [history, setHistory] = useState(false);
  const [expandedPlay, setExpandedPlay] = useState(false);
  const [replay, setReplay] = useState(0);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [copyRequest, setCopyRequest] = useState<CopyRequest | null>(null);
  const [copyReview, setCopyReview] = useState(0);
  const [copyError, setCopyError] = useState("");
  const copyDialogRef = useRef<HTMLDialogElement>(null);
  const copyEpoch = useRef(0);
  const copyLastFragment = useRef<string | null>(null);
  const copyDialogOpen = copyRequest?.status === "loading" || copyRequest?.status === "ready" || copyRequest?.status === "error";
  const [shareSnapshot, setShareSnapshot] = useState<SharedBuild | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [localShare, setLocalShare] = useState(false);
  const [shareOrigin, setShareOrigin] = useState("");
  const [currentShareOrigin, setCurrentShareOrigin] = useState("");
  const [hostedShareOrigin, setHostedShareOrigin] = useState("");
  const shareDialogRef = useRef<HTMLDialogElement>(null);
  const shareLinkRef = useRef<HTMLTextAreaElement>(null);
  const shareEpoch = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const playDialogRef = useRef<HTMLDialogElement>(null);
  const playToggleRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const selected = projects.find(p => p.id === selectedId);
  const current = selected?.versions.at(-1);
  const promptLimit = Math.min(2000, Math.max(1, readiness?.limits?.promptCharacters || 2000));

  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (!validProjects(saved)) throw new Error("unrecognized data");
          setProjects(saved);
        }
        storageBaseline.current = raw;
      } catch {
        storageBlocked.current = true;
        setStorageError("We couldn’t read your saved projects. New work will stay in this tab until you can save it. Export anything you want to keep.");
      }
      setLoaded(true);
    });
    return () => { live = false; requestRef.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setReadinessError(true);
      controller.abort();
    }, 10_000);
    fetch("/api/demo/generate", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Readiness unavailable");
        const data = await response.json();
        if (typeof data.enabled !== "boolean" || !["ai", "template"].includes(data.mode)) throw new Error("Invalid readiness");
        if (active && !controller.signal.aborted) {
          setReadiness(data);
          setReadinessError(false);
        }
      })
      .catch(() => { if (active && !controller.signal.aborted) setReadinessError(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  useEffect(() => {
    if (dialog) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [dialog]);

  useEffect(() => {
    if (!expandedPlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    playToggleRef.current?.focus();
    const escapePreview = (event: MessageEvent) => {
      const preview = playDialogRef.current;
      const frame = preview?.querySelector("iframe");
      if (event.source !== frame?.contentWindow || event.data?.type !== "vibekidding-demo-exit-play" || !preview) return;
      preview.close(); preview.show();
      setExpandedPlay(false);
      playToggleRef.current?.focus();
    };
    window.addEventListener("message", escapePreview);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("message", escapePreview); };
  }, [expandedPlay]);

  function closeLargePlay() {
    const preview = playDialogRef.current;
    if (!preview || !expandedPlay) return;
    // Keep the same iframe node and browsing context when returning to inline play.
    preview.close(); preview.show();
    setExpandedPlay(false);
    playToggleRef.current?.focus();
  }
  function openLargePlay() {
    const preview = playDialogRef.current;
    if (!preview || !current || locked) return;
    preview.close(); preview.showModal();
    setExpandedPlay(true);
  }

  useEffect(() => {
    if (shareOpen) shareDialogRef.current?.showModal();
    else shareDialogRef.current?.close();
  }, [shareOpen]);
  function openShare() {
    if (!selected || !current || locked) return;
    shareEpoch.current++;
    setShareSnapshot({ title: selected.title, html: current.html });
    setShareUrl(""); setShareError(""); setShareNotice(""); setShareBusy(false);
    setCurrentShareOrigin(window.location.origin);
    setShareOrigin(window.location.origin);
    setHostedShareOrigin("");
    const configuredOrigin = process.env.NEXT_PUBLIC_DEMO_SHARE_ORIGIN?.trim();
    if (configuredOrigin) {
      try {
        const hosted = new URL(configuredOrigin);
        if (hosted.protocol !== "https:" || hosted.username || hosted.password || hosted.pathname !== "/" || hosted.search || hosted.hash) throw new Error("Invalid hosted origin");
        if (hosted.origin !== window.location.origin) setHostedShareOrigin(hosted.origin);
      } catch { setShareNotice("The configured hosted address is invalid. You can still create a link for the current site."); }
    }
    setLocalShare(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
    setShareOpen(true);
  }
  function closeShare() { shareEpoch.current++; setShareOpen(false); setShareBusy(false); }
  function selectShareOrigin(origin: string) {
    if (origin !== currentShareOrigin && origin !== hostedShareOrigin) return;
    shareEpoch.current++;
    setShareOrigin(origin); setShareUrl(""); setShareError(""); setShareNotice(""); setShareBusy(false);
    setLocalShare(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname));
  }
  async function prepareShare() {
    if (!shareSnapshot || shareBusy) return;
    const epoch = ++shareEpoch.current;
    setShareBusy(true); setShareError(""); setShareNotice("");
    try {
      const url = await createShareUrl(shareOrigin, shareSnapshot);
      if (epoch === shareEpoch.current) { setShareUrl(url); setShareNotice("Your playable link is ready. Copy it to share this version."); }
    } catch (error) {
      if (epoch === shareEpoch.current) setShareError(error instanceof DemoShareError ? error.message : "We couldn’t create a link. Export HTML or a backup below instead.");
    } finally { if (epoch === shareEpoch.current) setShareBusy(false); }
  }
  async function copyShare() {
    if (!shareUrl) return;
    const epoch = shareEpoch.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      if (epoch === shareEpoch.current) setShareNotice("Playable link copied. Anyone with this link can play this snapshot.");
    } catch {
      if (epoch !== shareEpoch.current) return;
      shareLinkRef.current?.focus(); shareLinkRef.current?.select();
      setShareNotice("Automatic copy is unavailable. The link is selected below; copy it using your device’s copy command.");
    }
  }

  useEffect(() => {
    let live = true;
    const readCopy = async () => {
      const fragment = window.location.hash;
      if (copyLastFragment.current === fragment) return;
      copyLastFragment.current = fragment;
      const epoch = ++copyEpoch.current;
      setCopyError("");
      if (!fragment.startsWith("#copy=")) { setCopyRequest(null); return; }
      setCopyRequest({ status: "loading", fragment });
      try {
        const build = await parseCopyFragment(fragment);
        if (!live || epoch !== copyEpoch.current || window.location.hash !== fragment) return;
        setCopyRequest({ status: "ready", fragment, build });
      } catch (error) {
        if (!live || epoch !== copyEpoch.current || window.location.hash !== fragment) return;
        setCopyRequest({ status: "error", fragment, message: error instanceof Error ? error.message : "This copy link could not be read. Ask for a new playable link." });
      }
    };
    const change = () => { void readCopy(); };
    queueMicrotask(() => { if (live) void readCopy(); });
    window.addEventListener("hashchange", change);
    return () => { live = false; window.removeEventListener("hashchange", change); };
  }, [copyReview]);
  useEffect(() => {
    if (copyDialogOpen) copyDialogRef.current?.showModal();
    else copyDialogRef.current?.close();
  }, [copyDialogOpen]);
  function dismissCopy() {
    copyEpoch.current++;
    if (copyRequest) setCopyRequest({ status: "dismissed", fragment: copyRequest.fragment });
    setCopyError("");
  }
  function reviewCopy() { copyLastFragment.current = null; setCopyReview(value => value + 1); }
  function confirmSharedCopy() {
    if (!loaded || locked || copyRequest?.status !== "ready") return;
    if (window.location.hash !== copyRequest.fragment) { setCopyError("The copy link changed. Review the new link before saving."); return; }
    if (projects.length >= MAX_PROJECTS) { setCopyError("Your shelf is full. Cancel, export and delete a project, then choose Review copy link to try again."); return; }
    try {
      const project = createSharedCopy(copyRequest.build, { projectId: crypto.randomUUID(), versionId: crypto.randomUUID(), createdAt: eventTimestamp() });
      const saved = save([project, ...projects]);
      open(project);
      copyEpoch.current++;
      setCopyRequest({ status: "done", fragment: copyRequest.fragment });
      setMessage(saved ? "Independent copy saved in this browser. Your changes belong to this copy and do not change the sender’s project." : "Independent copy opened in this tab, but it could not be saved. Export a backup before closing this tab.");
    } catch (error) { setCopyError(error instanceof Error ? error.message : "The copy could not be created. Your shelf is unchanged."); }
  }

  // Persist before claiming success. Never silently overwrite unreadable saved data.
  function save(next: Project[]) {
    setProjects(next);
    if (storageBlocked.current) return false;
    try {
      storageBaseline.current = persistProjects(localStorage, STORAGE_KEY, storageBaseline.current, next);
      return true;
    } catch (e) {
      storageBlocked.current = true;
      if (e instanceof ProjectStorageConflictError) {
        setStorageConflict(true);
        setStorageError("Another tab changed your saved shelf. This tab’s changes are kept here but are not saved. Select each changed project and Export backup, then reload to see the newer saved shelf. Import your backups afterward to keep both.");
        return false;
      }
      setStorageError("Browser storage is unavailable or full. Your work is still here in this tab. Export a backup or HTML to keep a copy before closing it.");
      return false;
    }
  }

  function open(project: Project) {
    setDictationContext(value => value + 1);
    setSelectedId(project.id); setPrompt(""); setHistory(false); setError(""); setMessage(""); setReplay(v => v + 1);
  }
  function newProject() {
    setDictationContext(value => value + 1);
    setSelectedId(null); setPrompt(""); setHistory(false); setError(""); setMessage(""); promptRef.current?.focus();
  }
  function addVersion(html: string, title: string, mode: Version["mode"], idea: string, emoji = "✦") {
    const version: Version = { id: crypto.randomUUID(), html, prompt: idea, createdAt: eventTimestamp(), mode };
    const project: Project = selected
      ? { ...selected, updatedAt: eventTimestamp(), versions: [...selected.versions, version].slice(-MAX_VERSIONS) }
      : { id: crypto.randomUUID(), title: title.trim().slice(0, 70) || "My little creation", emoji, updatedAt: eventTimestamp(), versions: [version] };
    const saved = save([project, ...projects.filter(p => p.id !== project.id)]);
    setSelectedId(project.id); setPrompt(""); setReplay(v => v + 1);
    return saved;
  }
  function createFromStarter(index: number) {
    if (busyRef.current) return;
    if (projects.length >= MAX_PROJECTS) { setError("Your shelf is full! Export and delete a project to make room for a new one."); return; }
    const starter = workshopStarters[index];
    const generated = templateProject("", starter.html);
    const version: Version = { id: crypto.randomUUID(), html: starter.html, prompt: "Started with " + starter.title, createdAt: eventTimestamp(), mode: "template" };
    const project: Project = { id: crypto.randomUUID(), title: generated.title, emoji: starter.emoji, updatedAt: eventTimestamp(), versions: [version] };
    const saved = save([project, ...projects]);
    open(project);
    setMessage(saved ? "Your starter is saved in this browser. Give it a try!" : "Your starter is ready in this tab.");
  }
  async function generate() {
    if (!prompt.trim() || busyRef.current || readiness?.enabled === false) return;
    if (!selected && projects.length >= MAX_PROJECTS) { setError("Your shelf is full! Export and delete a project to make room."); return; }
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch("/api/demo/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim().slice(0, promptLimit), ...(current ? { html: current.html } : {}) }), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The workshop couldn’t build that just yet. Please try again.");
      if (typeof data?.html !== "string" || !data.html.trim() || data.html.length > MAX_HTML || typeof data?.title !== "string" || !["ai", "template"].includes(data.mode)) throw new Error("That build didn’t arrive correctly. Your previous work is safe. Please try again.");
      if (current && data.html === current.html) {
        setMessage(`No changes were made. Your current version and history are unchanged.${typeof data.message === "string" ? " " + data.message : ""}`);
        return;
      }
      const saved = addVersion(data.html, data.title, data.mode, prompt.trim());
      setMessage(`${data.mode === "ai" ? "Your AI build is ready." : "Your template build is ready. This was made from a starter, not by AI."} ${saved ? "Saved in this browser." : "Kept in this tab."}${typeof data.message === "string" ? " " + data.message : ""}`);
    } catch (e) {
      setError(controller.signal.aborted ? "The build was stopped or took too long. Your previous work is safe. Try again when you’re ready." : e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      clearTimeout(timeout); requestRef.current = null; busyRef.current = false; setBusy(false);
    }
  }
  function restore(version: Version) {
    if (!selected) return;
    const restored = { ...version, id: crypto.randomUUID(), prompt: `Restored: ${version.prompt}`.slice(0, 4000), createdAt: eventTimestamp() };
    const next = { ...selected, updatedAt: eventTimestamp(), versions: [...selected.versions, restored].slice(-MAX_VERSIONS) };
    const saved = save([next, ...projects.filter(p => p.id !== next.id)]);
    setReplay(v => v + 1); setMessage(saved ? "Earlier version restored and saved. You can keep exploring!" : "Earlier version restored in this tab.");
  }
  function exportHtml() {
    if (!selected || !current) return;
    const url = URL.createObjectURL(new Blob([sandboxDocument(current.html)], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `${selected.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "my-creation"}.html`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("HTML download requested. Ask your grown-up before opening or sharing the file.");
  }
  function exportBackup() {
    if (!selected) return;
    setError("");
    try {
      const json = serializeBackup(selected);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url;
      link.download = `${selected.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "my-creation"}.vibekidding.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Project backup download requested. It includes your title, ideas, and version history. Import it here to keep creating.");
    } catch (e) { setMessage(""); setError(e instanceof Error ? e.message : "The backup could not be created."); }
  }
  function duplicateProject() {
    if (!selected || busyRef.current) return;
    if (projects.length >= MAX_PROJECTS) { setError("Your shelf is full! Export and delete a project before making a copy."); return; }
    const duplicate = copyProject(selected, `${selected.title.slice(0, 63)} (copy)`);
    duplicate.updatedAt = eventTimestamp();
    const saved = save([duplicate, ...projects]); open(duplicate);
    setMessage(saved ? "Project copied with its version history and saved in this browser." : "Project copied with its version history in this tab.");
  }
  async function importBackup(file: File) {
    if (busyRef.current) return;
    setError(""); setMessage("");
    if (projects.length >= MAX_PROJECTS) { setError("Your shelf is full! Export and delete a project before importing another."); return; }
    if (file.size > MAX_BACKUP_BYTES) { setError("That backup is too large. Choose a JSON backup smaller than 8 MB."); return; }
    busyRef.current = true; setImporting(true);
    try {
      const project = copyProject(parseBackup(await file.text()));
      const saved = save([project, ...projects]); open(project);
      setMessage(saved ? "Backup imported as a new project and saved in this browser. Your existing projects are unchanged." : "Backup imported as a new project in this tab. Export it before closing the tab.");
    } catch (e) { setError(e instanceof Error ? e.message : "The file could not be read. No projects were changed."); }
    finally { busyRef.current = false; setImporting(false); }
  }
  function confirmDialog() {
    if (!selected) return;
    if (dialog === "delete") {
      const saved = save(projects.filter(p => p.id !== selected.id)); newProject();
      setMessage(saved ? "Project deleted from this browser." : "Project removed from this tab. The browser’s saved copy could not be updated.");
    } else if (name.trim()) {
      const saved = save(projects.map(p => p.id === selected.id ? { ...p, title: name.trim(), updatedAt: eventTimestamp() } : p));
      setMessage(saved ? "New name saved." : "New name applied in this tab.");
    }
    setDialog(null);
  }

  return <div className="demo-studio">
    <header className="demo-header">
      <Link href="/" className="demo-brand"><span className="demo-mark">v<span>✦</span></span>VibeKidding</Link>
      <div className="demo-header-right"><span className="demo-tag">{readiness?.publicTemplateOnly ? "TEMPLATE DEMO" : "LOCAL DEMO"}</span><Link href="/">Back to home <ArrowUpRight size={15} /></Link></div>
    </header>
    <main className="demo-main">
      <div className="demo-intro"><div><p className="demo-eyebrow"><span /> A LITTLE IDEA CAN GO A LONG WAY</p><h1>Your idea <em>workshop.</em></h1><p>Dream it. Make it. Give it a little more you.</p></div><div className="demo-mascot" aria-hidden="true"><span>✦</span><div>◕ ‿ ◕</div><small>let’s make something!</small></div></div>
      <div className="demo-note"><span aria-hidden="true">🌱</span><p><strong>Better together.</strong> Keep a grown-up nearby. Projects stay in this browser. {readiness?.publicTemplateOnly ? "Prompts go to the template service; project builds make no AI provider calls." : "Prompts go to the demo service and may use AI."} Leave out names, school, and other personal details.</p></div>
      {copyRequest?.status === "dismissed" && <div className="demo-copy-notice"><span>Shared copy not saved. Your shelf is unchanged.</span><button type="button" className="demo-text-button" disabled={locked} onClick={reviewCopy}>Review copy link</button></div>}
      {storageError && <div className="demo-alert" role="alert"><p>{storageError}</p>{storageConflict && <button type="button" className="demo-secondary" disabled={locked} onClick={() => { if (window.confirm("Reload the saved shelf? Unsaved changes in this tab will be lost. Export a backup of each changed project first.")) window.location.reload(); }}>Reload saved shelf</button>}</div>}
      <div className="demo-feedback" aria-live="polite" role="status">{message && <p><Check size={17} />{message}</p>}</div>
      {error && <p className="demo-alert" role="alert">{error}</p>}
      <div className="demo-workspace">
        <section className="demo-panel demo-composer" aria-labelledby="idea-heading">
          <div className="demo-section-heading"><span className="demo-step">01 / IMAGINE</span>{selected && <button className="demo-text-button" onClick={newProject} disabled={locked}><Plus size={15} /> New idea</button>}</div>
          <h2 id="idea-heading">{selected ? "What shall we change?" : "What’s your big little idea?"}</h2>
          <p>{selected ? (readiness?.mode === "template" ? "Try a named color or a space, ocean or garden theme. Memory, addition and collector games also support easier or harder challenges." : "Try a new color, add a character, or dream up a new twist.") : "A game, an adventure, a tiny tool. Start with whatever makes you curious."}</p>
          <div className="demo-readiness" role="status"><strong>{readiness ? !readiness.enabled ? "Prompt builds are unavailable" : readiness.mode === "template" ? (readiness.publicTemplateOnly ? "Templates ready · no AI calls" : "Offline templates ready") : "AI mode configured" : readinessError ? "Build service status unavailable" : "Checking the workshop…"}</strong><span>{readiness?.message || (readinessError ? "You can still use the ready-to-play starters below." : readiness ? "Ready-to-play starters also work without AI." : "Ready-to-play starters are available below.")}</span></div>
          <form onSubmit={e => { e.preventDefault(); void generate(); }}>
            <label htmlFor="demo-idea">{selected ? "My next change" : "My idea"}</label>
            <textarea ref={promptRef} id="demo-idea" placeholder={selected ? "Make it feel like a magical forest…" : "A game where a panda collects stars…"} value={prompt} maxLength={promptLimit} onChange={e => setPrompt(e.target.value)} disabled={locked || !loaded} />
            {!selected && <div className="demo-prompt-suggestions" role="group" aria-label="Idea suggestions">{promptSuggestions.map(idea => <button key={idea.label} type="button" disabled={locked || !loaded} onClick={() => { setPrompt(idea.prompt); promptRef.current?.focus(); }}>{idea.label}</button>)}</div>}
            <div className="demo-voice-mode" role="group" aria-label="Optional voice mode"><button type="button" aria-pressed={voiceInputMode === "dictation"} onClick={() => setVoiceInputMode("dictation")}>Dictate text</button><button type="button" aria-pressed={voiceInputMode === "samantha"} onClick={() => setVoiceInputMode("samantha")}>Talk with Samantha</button></div>
            <div className="demo-dictation-area" hidden={voiceInputMode !== "dictation"}>
              <label htmlFor="demo-speech-language">Dictation language<select id="demo-speech-language" value={speechLanguage} disabled={locked || !loaded} onChange={e => setSpeechLanguage(e.target.value)}>{speechLanguages.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label>
              <BrowserDictation disabled={locked || !loaded || !!dialog || shareOpen || copyDialogOpen || expandedPlay || voiceInputMode !== "dictation"} language={speechLanguage} contextKey={`${selectedId ?? "new"}:${current?.id ?? ""}:${dictationContext}`} maxLength={Math.max(0, promptLimit - prompt.length - (prompt.length ? 1 : 0))} onTranscript={text => { setPrompt(previous => `${previous}${previous ? " " : ""}${text}`.slice(0, promptLimit)); promptRef.current?.focus(); }} />
              <p className="demo-fine">Review and edit the words above, then use the build button. Dictation never starts a build. Language availability depends on your browser and speech service.{readiness?.mode === "template" ? " Template instructions currently work best in English; dictation does not translate them." : ""}</p>
            </div>
            <div hidden={voiceInputMode !== "samantha"}><DemoSamanthaVoice disabled={locked || !loaded || !!dialog || shareOpen || copyDialogOpen || expandedPlay || voiceInputMode !== "samantha"} contextKey={`${selectedId ?? "new"}:${current?.id ?? ""}:${dictationContext}`} maxIdeaLength={promptLimit} onIdea={text => { setPrompt(text.slice(0, promptLimit)); promptRef.current?.focus(); }} /></div>
            <div className="demo-input-foot"><span>No personal details, just imagination.</span><span>{prompt.length}/{promptLimit}</span></div>
            <button className="demo-primary" type="submit" disabled={locked || !loaded || !prompt.trim() || readiness?.enabled === false}>{busy ? <LoaderCircle className="demo-spin" size={18} /> : <Sparkles size={18} />}{busy ? "Making a little magic…" : selected ? "Make this change" : "Bring my idea to life"}<ArrowUpRight size={18} /></button>
            {busy && <button type="button" className="demo-text-button demo-cancel" onClick={() => requestRef.current?.abort()}>Cancel build</button>}
          </form>
          <p className="demo-fine">{readiness?.mode === "template" ? "Templates support memory match, drawing, addition quizzes, preset branching stories, collector games, two-player tic-tac-toe on the same device, a music garden with no autoplay, and checklists whose checkmarks last only for the preview visit. Changes use supported themes and colors; custom code changes need AI. " : "Builds are labeled AI or template when ready. "}Nothing is published from this demo.</p>
          <div className="demo-small-spark"><span>✧</span><p>{readiness?.mode === "template" ? "Try “blue ocean” or “easy memory game.”" : "Try “make it blue” or “add a score.”"}<br />Small changes can make a big difference.</p></div>
        </section>
        <dialog ref={playDialogRef} open className={`demo-panel demo-preview-panel demo-play-dialog${expandedPlay ? " is-expanded" : ""}`} aria-labelledby="preview-heading" aria-modal={expandedPlay ? true : undefined} aria-busy={busy} onCancel={e => { e.preventDefault(); closeLargePlay(); }}>
          <div className="demo-preview-toolbar"><div><span className="demo-step">02 / PLAY & EXPLORE</span><h2 id="preview-heading">{selected?.title || "A little space for big possibilities"}</h2></div>{current && <div className="demo-play-toolbar-actions"><span className={`demo-mode ${current.mode}`}>{versionLabel(current.mode)}</span><button ref={playToggleRef} type="button" className="demo-secondary" disabled={locked} onClick={expandedPlay ? closeLargePlay : openLargePlay}>{expandedPlay ? <ArrowLeft size={15} /> : <Maximize2 size={15} />}{expandedPlay ? "Back to workshop" : "Play large"}</button></div>}</div>
          {current ? <div className="demo-frame-wrap"><GeneratedPreview key={`${current.id}-${replay}`} html={current.html + playEscapeBridge} title={`${selected?.title} play preview`} className="demo-frame" />{busy && <div className="demo-building"><LoaderCircle className="demo-spin" size={24} /><strong>Building your next version…</strong><span>Your current creation is safe.</span></div>}</div> : <div className="demo-empty"><div className="demo-empty-art" aria-hidden="true"><span>✦</span><span>◒</span><span>✧</span></div><h3>It all starts with “what if?”</h3><p>Pick a starter below or tell us your idea.<br />Your creation will come to life right here.</p><span className="demo-empty-caption">A PLACE TO TINKER, TRY, AND TRY AGAIN</span></div>}
          <div className="demo-preview-bottom"><span>{current ? (expandedPlay ? "Large play · press Escape to return" : "Play preview · starts fresh when reopened") : "Your imagination is welcome here."}</span>{current && <button className="demo-text-button" disabled={locked} onClick={() => setReplay(v => v + 1)}><RotateCcw size={14} /> Restart play</button>}</div>
          {selected && <div className="demo-project-actions"><button disabled={locked} onClick={() => { setName(selected.title); setDialog("rename"); }}><Pencil size={15} /> Rename</button><button disabled={locked} aria-expanded={history} onClick={() => setHistory(!history)}><History size={15} /> History ({selected.versions.length})</button><button disabled={locked} onClick={duplicateProject}><Copy size={15} /> Duplicate</button><button disabled={locked} onClick={openShare}><Share2 size={15} /> Share playable link</button><button disabled={locked} onClick={exportBackup}><Download size={15} /> Export backup</button><button disabled={locked} onClick={exportHtml}><Download size={15} /> Export HTML</button><button disabled={locked} onClick={() => setDialog("delete")} aria-label={`Delete ${selected.title}`}><Trash2 size={15} /></button></div>}
        </dialog>
      </div>
      {history && selected && <section className="demo-panel demo-history" aria-label="Version history"><div className="demo-section-heading"><div><h2>A trail of little discoveries</h2><p>Restore a previous build. We keep the latest {MAX_VERSIONS} versions.</p></div><button className="demo-icon-button" aria-label="Close history" onClick={() => setHistory(false)}><X size={18} /></button></div><ol>{[...selected.versions].reverse().map((v, i) => <li key={v.id}><div><strong>{v.prompt}</strong><span>{date(v.createdAt)} · {versionLabel(v.mode)}</span></div>{i === 0 ? <span className="demo-tag">CURRENT</span> : <button disabled={locked} onClick={() => restore(v)}><RotateCcw size={14} /> Restore</button>}</li>)}</ol></section>}
      <section className="demo-starters" aria-labelledby="starters-heading"><div className="demo-section-heading"><div><p className="demo-eyebrow">A SPARK TO GET YOU STARTED</p><h2 id="starters-heading">Start small. Make it yours.</h2></div><span className="demo-muted">Ready-to-play templates. No AI needed.</span></div><div className="demo-starter-grid">{workshopStarters.map((s, i) => <button className={`demo-starter ${s.color}`} key={s.title} onClick={() => createFromStarter(i)} disabled={!loaded || locked}><span className="demo-starter-icon" aria-hidden="true">{s.emoji}</span><h3>{s.title}</h3><p>{s.description}</p><span className="demo-starter-link">Make this mine <ArrowUpRight size={17} /></span></button>)}</div></section>
      <section className="demo-gallery" aria-labelledby="gallery-heading"><div className="demo-section-heading"><div><p className="demo-eyebrow">MADE BY YOU</p><h2 id="gallery-heading">Your shelf of wonders <span>({projects.length})</span></h2></div><div className="demo-shelf-actions"><input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Import project backup" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importBackup(file); }} /><button disabled={locked || !loaded} className="demo-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> {importing ? "Importing…" : "Import backup"}</button><button disabled={locked || !loaded} className="demo-secondary" onClick={newProject}><Plus size={16} /> New project</button></div></div>{!loaded ? <p className="demo-gallery-empty">Opening your project shelf…</p> : projects.length === 0 ? <div className="demo-gallery-empty"><span aria-hidden="true">✦</span><p>Your first creation belongs here.<br /><small>Start with a spark above. We’ll keep your projects in this browser.</small></p></div> : <div className="demo-gallery-grid">{projects.map(p => <button key={p.id} disabled={locked} className={`demo-project-card ${p.id === selectedId ? "selected" : ""}`} onClick={() => open(p)} aria-pressed={p.id === selectedId}><span className="demo-project-art" aria-hidden="true">{p.emoji}</span><div><h3>{p.title}</h3><p>{p.versions.length} {p.versions.length === 1 ? "version" : "versions"} · {versionLabel(p.versions.at(-1)?.mode)}</p><small>{date(p.updatedAt)}</small></div><ArrowUpRight size={18} /></button>)}</div>}<p className="demo-fine">{readiness?.publicTemplateOnly ? "Template demo" : "Local demo"} · No account needed · Clearing browser data removes saved projects. JSON backups keep your title and versions (up to 8 MB). Imports add a new project, and files stay in your browser. HTML exports keep only the current build. Play progress inside a project is not saved.</p></section>
      <footer className="demo-footer"><span>✦ Made for curious minds.</span><Link href="/"><ArrowLeft size={14} /> About VibeKidding</Link><span>Imagine freely. Build together.</span></footer>
    </main>
    <dialog ref={copyDialogRef} className="demo-dialog demo-copy-dialog" aria-labelledby="demo-copy-title" onCancel={event => { event.preventDefault(); dismissCopy(); }}><div className="demo-section-heading"><h2 id="demo-copy-title">Make an independent copy</h2><button type="button" className="demo-icon-button" aria-label="Close copy confirmation" onClick={dismissCopy}><X size={18} /></button></div>{copyRequest?.status === "loading" && <p role="status">Reading the shared snapshot. Nothing has been saved or played.</p>}{copyRequest?.status === "error" && <p role="alert">{copyRequest.message}</p>}{copyRequest?.status === "ready" && <><p className="demo-copy-project-title">{copyRequest.build.title}</p><p>This adds a new project to your browser’s shelf. You can change your copy without changing the sender’s project. It includes the shared build, not the sender’s history or play progress.</p><p className="demo-fine">Check with your grown-up before opening shared code. Nothing saves or plays until you confirm. Saving opens your copy in the sandboxed preview; it does not request AI generation.</p></>}{copyError && <p role="alert">{copyError}</p>}<div className="demo-dialog-actions"><button type="button" onClick={dismissCopy}>Cancel</button>{copyRequest?.status === "ready" && <button type="button" className="demo-primary" disabled={!loaded || locked} onClick={confirmSharedCopy}>Save independent copy</button>}</div></dialog>
    <dialog ref={shareDialogRef} className="demo-dialog demo-share-dialog" aria-labelledby="demo-share-title" onCancel={e => { e.preventDefault(); closeShare(); }}><div className="demo-section-heading"><h2 id="demo-share-title">Share a playable snapshot</h2><button type="button" className="demo-icon-button" aria-label="Close sharing" onClick={closeShare}><X size={18} /></button></div><p><strong>{shareSnapshot?.title}</strong></p><p>The link recreates this version’s title and code. It leaves out your prompt history, other versions, and conversation notes. Anyone with the link can play and copy what’s in this version, including any personal text inside it.</p><p className="demo-fine">Template links carry compact project settings; other links carry compressed HTML. Both are created in this browser without uploading the project to a server. This is a snapshot, not a live update or a published listing. Links have an 8,000-character size limit. Larger projects can use HTML or backup exports.</p>{hostedShareOrigin && <fieldset className="demo-share-origin"><legend>Where should the link open?</legend><label><input type="radio" name="demo-share-origin" checked={shareOrigin === currentShareOrigin} disabled={shareBusy} onChange={() => selectShareOrigin(currentShareOrigin)} /> Current site</label><label><input type="radio" name="demo-share-origin" checked={shareOrigin === hostedShareOrigin} disabled={shareBusy} onChange={() => selectShareOrigin(hostedShareOrigin)} /> Hosted play page</label></fieldset>}<p className="demo-share-destination">Link opens at <strong>{shareOrigin}</strong></p>{localShare && <p className="demo-alert">This link points to this device’s local demo. {hostedShareOrigin ? "Choose Hosted play page to make a link for family on other devices." : "To share with friends on other devices, open the hosted demo and create the link there."}</p>}{shareError && <p className="demo-alert" role="alert">{shareError}</p>}{shareUrl && <label>Playable link<textarea ref={shareLinkRef} readOnly rows={3} value={shareUrl} onFocus={e => e.target.select()} /></label>}<p role="status" aria-live="polite">{shareNotice}</p>{shareOpen && shareUrl && <ShareQRCode key={shareUrl} url={shareUrl} onExportHtml={() => { closeShare(); exportHtml(); }} />}<div className="demo-dialog-actions"><button type="button" onClick={closeShare}>Close</button>{shareUrl ? <button type="button" className="demo-primary" onClick={() => void copyShare()}><Copy size={15} /> Copy link</button> : <button type="button" className="demo-primary" disabled={shareBusy || !shareSnapshot} onClick={() => void prepareShare()}>{shareBusy ? "Preparing link…" : "Create playable link"}</button>}</div>{shareError && <div className="demo-share-fallback"><button type="button" className="demo-secondary" onClick={() => { closeShare(); exportHtml(); }}>Export HTML instead</button><button type="button" className="demo-secondary" onClick={() => { closeShare(); exportBackup(); }}>Export backup instead</button></div>}</dialog>
    <dialog ref={modalRef} className="demo-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)} aria-labelledby="demo-dialog-title"><form onSubmit={e => { e.preventDefault(); confirmDialog(); }}><div className="demo-section-heading"><h2 id="demo-dialog-title">{dialog === "delete" ? "Say goodbye to this project?" : "Give it a new name"}</h2><button type="button" className="demo-icon-button" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={18} /></button></div>{dialog === "delete" ? <p>“{selected?.title}” and its version history will be removed from this browser. Export it first if you want to keep a copy.</p> : <label>Project name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={70} required /></label>}<div className="demo-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Keep exploring</button><button className={dialog === "delete" ? "demo-danger" : "demo-primary"} disabled={dialog === "rename" && !name.trim()} type="submit">{dialog === "delete" ? "Delete project" : "Save name"}</button></div></form></dialog>
  </div>;
}
