"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type VoiceReadiness = { enabled: boolean; localOnly: true; configured: boolean; maxDurationSeconds: number; message: string };
type TranscriptLine = { id: string; role: "user" | "agent"; text: string };
export type DemoSamanthaVoiceProps = {
  disabled?: boolean;
  contextKey: string | number | null;
  maxIdeaLength: number;
  onIdea(text: string): void;
};

export function DemoSamanthaVoice(props: DemoSamanthaVoiceProps) {
  const [readiness, setReadiness] = useState<VoiceReadiness | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const timer = setTimeout(() => { if (live) setUnavailable(true); controller.abort(); }, 10_000);
    fetch("/api/demo/voice", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Voice unavailable");
        const data = await response.json();
        if (typeof data.enabled !== "boolean" || typeof data.configured !== "boolean" || data.localOnly !== true || typeof data.message !== "string") throw new Error("Invalid readiness");
        if (live && !controller.signal.aborted) { setReadiness(data); setUnavailable(false); }
      })
      .catch(() => { if (live && !controller.signal.aborted) setUnavailable(true); })
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, []);
  if (!readiness?.enabled || !readiness.configured) return <section className="demo-samantha-voice" aria-label="Samantha AI conversation"><strong>Talk with Samantha · AI voice</strong><p role="status">{readiness?.message || (unavailable ? "Conversation is unavailable. You can keep typing or use browser dictation." : "Checking optional local voice setup…")}</p><small>Optional local conversation is separate from browser dictation.</small></section>;
  return <ConversationProvider><VoiceControls {...props} readiness={readiness} /></ConversationProvider>;
}

function VoiceControls({ disabled = false, contextKey, maxIdeaLength, onIdea, readiness }: DemoSamanthaVoiceProps & { readiness: VoiceReadiness }) {
  const conversation = useConversation();
  const { startSession, endSession, setMuted } = conversation;
  const [active, setActive] = useState(false);
  const [notice, setNotice] = useState("Ready when you and your grown-up are. Starting connects to ElevenLabs.");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const activeRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connecting = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback((message = "Conversation ended. Review any idea before adding it to the editor.") => {
    epoch.current++;
    request.current?.abort(); request.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    if (connecting.current) clearTimeout(connecting.current);
    deadline.current = connecting.current = null;
    activeRef.current = false;
    endSession();
    if (mounted.current) { setActive(false); setNotice(message); }
  }, [endSession]);

  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) stop("Conversation stopped when the page was hidden. Start again when you’re ready."); };
    document.addEventListener("visibilitychange", hidden);
    return () => { mounted.current = false; document.removeEventListener("visibilitychange", hidden); stop(); };
  }, [stop]);
  useEffect(() => {
    let live = true;
    queueMicrotask(() => { if (live) { setTranscript([]); setConfirmed(false); } });
    return () => { live = false; stop("Conversation stopped because the workshop changed."); };
  }, [contextKey, stop]);
  useEffect(() => {
    if (!disabled || !activeRef.current) return;
    stop("Conversation is paused while you use another workshop control.");
  }, [disabled, stop]);

  async function start() {
    if (disabled || !confirmed || activeRef.current || document.hidden) return;
    activeRef.current = true;
    const sessionEpoch = ++epoch.current;
    const current = () => mounted.current && epoch.current === sessionEpoch && activeRef.current;
    setActive(true); setTranscript([]); setNotice("Checking the dedicated voice session…");
    const controller = new AbortController(); request.current = controller;
    connecting.current = setTimeout(() => stop("Voice took too long to connect. You can keep typing or try again."), 20_000);
    try {
      const response = await fetch("/api/demo/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok) { stop(typeof data?.error === "string" ? data.error.slice(0, 300) : "Voice could not start. You can keep typing."); return; }
      if (typeof data?.signedUrl !== "string" || !Number.isFinite(data.maxDurationSeconds) || data.maxDurationSeconds <= 0 || data.maxDurationSeconds > 60) throw new Error("The voice session response was invalid.");
      const url = new URL(data.signedUrl);
      if (url.protocol !== "wss:" || url.hostname !== "api.elevenlabs.io" || url.port || url.username || url.password || url.hash || url.pathname !== "/v1/convai/conversation" || !url.searchParams.get("conversation_signature") || !url.searchParams.get("conversation_id")) throw new Error("The voice connection address was invalid.");
      request.current = null;
      setNotice("Connecting to Samantha…");
      deadline.current = setTimeout(() => stop("This short conversation has ended. You can review an idea or start again."), data.maxDurationSeconds * 1000);
      // This installed React SDK returns void. Only onConnect confirms connection.
      startSession({
        signedUrl: data.signedUrl, connectionType: "websocket", clientTools: {},
        onConnect: () => {
          if (!current()) return;
          if (connecting.current) clearTimeout(connecting.current);
          connecting.current = null;
          setNotice("Connected. Speak with Samantha, or end the conversation whenever you like.");
        },
        onDisconnect: () => { if (current()) stop(); },
        onError: () => { if (current()) stop("Voice stopped or could not connect. Your project is safe; you can keep typing."); },
        onUnhandledClientToolCall: () => { if (current()) stop("This conversation requested an unavailable action and was stopped."); },
        onMessage: message => {
          if (!current() || !["user", "agent"].includes(message.role) || typeof message.message !== "string") return;
          const line: TranscriptLine = { id: `${message.role}:${message.event_id}:${message.response_id || ""}`, role: message.role, text: message.message.slice(0, 2000) };
          setTranscript(previous => [...previous.filter(item => item.id !== line.id), line].slice(-20));
        },
      });
    } catch {
      if (current()) stop("Voice could not start. Check the local voice setup or keep typing.");
    }
  }
  function chooseIdea(text: string) {
    if (disabled) return;
    stop("Idea selected. Review it in the workshop before building.");
    onIdea(text.slice(0, Math.max(0, Math.min(2000, maxIdeaLength))));
  }
  const sdkEnding = !active && (conversation.status === "connected" || conversation.status === "connecting");
  return <section className="demo-samantha-voice" aria-label="Samantha AI conversation">
    <div className="demo-section-heading"><strong>Talk with Samantha · AI voice</strong><span className="demo-tag">LOCAL ONLY</span></div>
    <p>Samantha is an AI conversation partner. Audio and conversation text go to ElevenLabs; its service settings govern processing and retention. Keep a grown-up nearby and leave out personal details.</p>
    <p className="demo-fine">Local access does not mean offline audio. This page keeps only the latest 20 transcript messages in memory. Nothing from the conversation builds or changes a project automatically.</p>
    {!active && <label className="demo-voice-confirm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e => setConfirmed(e.target.checked)} /> My grown-up and I are ready to use the voice service.</label>}
    <div className="demo-samantha-controls">{active ? <><button type="button" className="demo-secondary" onClick={() => stop()}>End Samantha conversation</button>{conversation.status === "connected" && <button type="button" className="demo-secondary" onClick={() => { try { setMuted(!conversation.isMuted); } catch { stop("Voice stopped. You can start again or keep typing."); } }}>{conversation.isMuted ? "Unmute microphone" : "Mute microphone"}</button>}</> : <button type="button" className="demo-secondary" disabled={disabled || !confirmed || sdkEnding} onClick={() => void start()}>Start Samantha conversation</button>}</div>
    <p role="status" aria-live="polite">{notice}{active && conversation.status === "connected" ? ` ${conversation.isMuted ? "Microphone muted." : conversation.isSpeaking ? "Samantha is speaking." : "Listening."}` : ""}</p>
    <small>Session limit: {Math.min(60, readiness.maxDurationSeconds || 60)} seconds. The service setup is checked when you start.</small>
    {transcript.length > 0 && <div className="demo-voice-transcript"><div className="demo-section-heading"><strong>Conversation notes</strong><button type="button" className="demo-text-button" onClick={() => setTranscript([])}>Clear notes</button></div><ol>{transcript.map(line => <li key={line.id}><span>{line.role === "agent" ? "Samantha · AI" : "You"}</span><p>{line.text}</p>{line.role === "agent" && <button type="button" className="demo-text-button" disabled={disabled || maxIdeaLength <= 0} onClick={() => chooseIdea(line.text)}>Use this idea</button>}</li>)}</ol><small>“Use this idea” asks before replacing any unfinished idea. It never starts a build.</small></div>}
  </section>;
}
