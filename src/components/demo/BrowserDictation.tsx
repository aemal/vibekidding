"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type DictationView = {
  status: "idle" | "requesting" | "listening" | "processing" | "error";
  message: string;
  interim: string;
};
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechResultEvent = { results: { length: number; [index: number]: SpeechResult } };

// Small browser interface keeps experimental/prefixed API typing out of global types.
export interface DictationRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => DictationRecognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
type Timers = { set(callback: () => void, delay: number): unknown; clear(handle: unknown): void };
const timers: Timers = { set: (fn, delay) => setTimeout(fn, delay), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
const initialView: DictationView = { status: "idle", message: "Dictate an idea, then review the text before building.", interim: "" };

function errorMessage(code: string) {
  switch (code) {
    case "not-allowed": case "service-not-allowed": return "Microphone or speech-service access was denied. You can keep typing.";
    case "audio-capture": return "No microphone is available. Check your microphone or keep typing.";
    case "no-speech": return "No speech was detected. Try again or keep typing.";
    case "network": return "The browser speech service could not connect. You can keep typing.";
    case "language-not-supported": return "This speech language is not supported by your browser. You can keep typing.";
    default: return "Dictation stopped. Your typed idea is safe; you can keep typing.";
  }
}

/** Testable lifecycle adapter. It never uploads audio, submits a project, or restarts itself. */
export function createDictationSession(options: {
  recognition: DictationRecognition;
  language: string;
  maxLength: number;
  onView(view: DictationView): void;
  onTranscript(text: string): void;
  timers?: Timers;
}) {
  const recognition = options.recognition;
  const clock = options.timers ?? timers;
  const limit = Math.max(0, Math.min(2000, Math.floor(options.maxLength) || 0));
  let active = false, stopping = false, finalText = "", truncated = false;
  let deadline: unknown, settling: unknown;
  const view = (status: DictationView["status"], message: string, interim = "") => options.onView({ status, message, interim });
  function cleanup() {
    clock.clear(deadline); clock.clear(settling);
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
  }
  function abort() { try { recognition.abort(); } catch { /* Already ended. */ } }
  function finish() {
    if (!active) return;
    active = false; cleanup();
    if (finalText) {
      view("idle", truncated ? "Dictation shortened to fit the idea limit. Review the text before building." : "Dictation added. Review the text before building.");
      options.onTranscript(finalText);
    } else view("idle", "No final speech was captured. Try again or keep typing.");
  }
  function fail(code: string) {
    if (!active) return;
    active = false; cleanup(); abort();
    view("error", errorMessage(code));
  }
  function stop() {
    if (!active || stopping) return;
    stopping = true; clock.clear(deadline);
    view("processing", "Finishing dictation…");
    // Some engines omit onend after stop: bound the final-result wait too.
    settling = clock.set(() => { finish(); abort(); }, 3000);
    try { recognition.stop(); } catch { fail("aborted"); }
  }
  return {
    get active() { return active; },
    start() {
      if (active || limit === 0) return;
      active = true; stopping = false; finalText = ""; truncated = false;
      recognition.lang = options.language;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { if (active && !stopping) view("listening", "Listening… Speak a short idea. Stops after 30 seconds."); };
      recognition.onresult = event => {
        if (!active) return;
        const finals: string[] = [], partials: string[] = [];
        // Results are cumulative. Rebuild rather than appending duplicate events.
        for (let i = 0; i < Math.min(event.results.length, 64); i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript;
          if (typeof text === "string") (result.isFinal ? finals : partials).push(text.slice(0, 4000));
        }
        const text = finals.join(" ").replace(/\s+/g, " ").trim();
        truncated = text.length > limit;
        finalText = text.slice(0, limit).trim();
        view(stopping ? "processing" : "listening", stopping ? "Finishing dictation…" : "Listening… Review the final text before building.", partials.join(" ").slice(0, limit));
      };
      recognition.onerror = event => fail(event.error);
      recognition.onend = finish;
      view("requesting", "Waiting for microphone permission and the browser speech service…");
      deadline = clock.set(stop, 30000);
      try { recognition.start(); } catch { fail("start-failed"); }
    },
    stop,
    cancel() {
      if (!active) return;
      active = false; finalText = ""; cleanup(); abort();
    },
  };
}

function constructorForBrowser() {
  if (typeof window === "undefined") return;
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
const subscribe = () => () => {};
const supportSnapshot = () => !window.isSecureContext ? "insecure" : constructorForBrowser() ? "supported" : "unsupported";
const serverSnapshot = () => "checking";

export type BrowserDictationProps = {
  disabled?: boolean;
  /** Remaining space in the parent's idea input, including any separator it adds. */
  maxLength?: number;
  language?: string;
  /** Change when switching projects or versions to discard a stale recording. */
  contextKey?: string | number | null;
  onTranscript(text: string): void;
};

export function BrowserDictation({ disabled = false, maxLength = 2000, language = "en-US", contextKey, onTranscript }: BrowserDictationProps) {
  const support = useSyncExternalStore(subscribe, supportSnapshot, serverSnapshot);
  const [state, setState] = useState<DictationView>(initialView);
  const session = useRef<ReturnType<typeof createDictationSession> | null>(null);
  const transcriptCallback = useRef(onTranscript);
  useEffect(() => { transcriptCallback.current = onTranscript; }, [onTranscript]);
  useEffect(() => {
    let live = true;
    session.current?.cancel(); session.current = null;
    queueMicrotask(() => { if (live) setState(initialView); });
    return () => { live = false; session.current?.cancel(); session.current = null; };
  }, [disabled, contextKey, language, maxLength]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && session.current?.active) {
        session.current.cancel(); session.current = null;
        setState({ status: "idle", message: "Dictation cancelled when this page was hidden. You can keep typing.", interim: "" });
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  function start() {
    const Recognition = constructorForBrowser();
    if (disabled || maxLength <= 0 || support !== "supported" || !Recognition || session.current?.active) return;
    try {
      session.current = createDictationSession({ recognition: new Recognition(), language, maxLength, onView: setState, onTranscript: text => transcriptCallback.current(text) });
      session.current.start();
    } catch { setState({ status: "error", message: "This browser could not start dictation. You can keep typing.", interim: "" }); }
  }
  function cancel() {
    session.current?.cancel(); session.current = null;
    setState({ status: "idle", message: "Dictation cancelled. Your typed idea is unchanged.", interim: "" });
  }
  const active = ["requesting", "listening", "processing"].includes(state.status);
  const supported = support === "supported";
  return <section className="demo-dictation" aria-label="Optional voice dictation">
    <p className="demo-dictation-disclosure">Optional browser dictation. Your browser may send speech to its speech service. We do not upload or store the audio. Review the text before building.</p>
    {supported ? <div className="demo-dictation-controls">
      {active ? <><button type="button" className="demo-text-button" disabled={state.status === "processing"} onClick={() => session.current?.stop()}>Stop dictation</button><button type="button" className="demo-text-button" onClick={cancel}>Cancel dictation</button></> :
        <button type="button" className="demo-text-button" disabled={disabled || maxLength <= 0} onClick={start}>Dictate an idea</button>}
    </div> : null}
    <p role="status" aria-live="polite">{support === "checking" ? "Checking browser dictation support…" : support === "insecure" ? "Dictation needs HTTPS or localhost. You can type your idea instead." : !supported ? "Browser dictation is not supported here. Type your idea or use your keyboard’s dictation feature." : maxLength <= 0 ? "Your idea is full. Shorten it before dictating more." : state.message}</p>
    {state.interim && <p className="demo-dictation-interim">Hearing: {state.interim}</p>}
  </section>;
}
