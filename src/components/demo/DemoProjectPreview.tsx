"use client";

import { useEffect, useRef } from "react";
import { DemoAppAISession, askDemoAppAI, demoAppAISdk, type AppAIState } from "@/lib/demo-app-ai-bridge";
import { sandboxDocument } from "@/lib/studio/sandbox";
import { DemoPreviewDiagnostics, demoPreviewDiagnosticsSdk, type PreviewProblem } from "@/lib/demo-preview-diagnostics";
import { createDemoProjectStore, DemoStorageSession, demoStorageSdk } from "@/lib/demo-project-storage";

/** Only the local workshop grants storage, bound by the parent to one project. */
export function DemoProjectPreview({ projectId, html, title, className, onProblem, aiEnabled = false, onAIState }: {
  projectId: string;
  html: string;
  title: string;
  className?: string;
  onProblem?: (problem: PreviewProblem) => void;
  aiEnabled?: boolean;
  onAIState?: (state: AppAIState) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onProblemRef = useRef(onProblem);
  const onAIStateRef = useRef(onAIState);
  const aiSessionRef = useRef<DemoAppAISession | null>(null);
  useEffect(() => { onAIStateRef.current = onAIState; }, [onAIState]);
  // Callback changes must not restart a running project or discard in-frame state.
  useEffect(() => { onProblemRef.current = onProblem; }, [onProblem]);
  useEffect(() => {
    const frame = frameRef.current;
    const source = frame?.contentWindow;
    if (!frame || !source) return;
    const session = crypto.randomUUID();
    const bridge = new DemoStorageSession({ source, session, store: createDemoProjectStore({
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    }, projectId) });
    const diagnostics = new DemoPreviewDiagnostics({ source, session });
    let active = true;
    const ai = new DemoAppAISession({ source, session, ask: askDemoAppAI,
      reply: message => { if (active && frame.contentWindow === source) source.postMessage(message, "*"); },
      onState: state => { if (active) onAIStateRef.current?.(state); },
    });
    aiSessionRef.current = ai;
    const receive = (event: MessageEvent) => {
      if (!active || frame.contentWindow !== source) return;
      ai.handle(event);
      const problem = diagnostics.handle(event);
      if (problem && active) onProblemRef.current?.(problem);
      const reply = bridge.handle(event);
      if (reply !== undefined && active) source.postMessage(reply, "*");
    };
    // Install the listener before starting the opaque document's SDK.
    window.addEventListener("message", receive);
    frame.srcdoc = sandboxDocument(demoPreviewDiagnosticsSdk(session, window.location.origin) + demoStorageSdk(session, window.location.origin) + demoAppAISdk(session, window.location.origin) + html);
    return () => {
      active = false;
      ai.close();
      if (aiSessionRef.current === ai) aiSessionRef.current = null;
      bridge.close();
      diagnostics.close();
      window.removeEventListener("message", receive);
    };
  }, [projectId, html]);
  useEffect(() => { aiSessionRef.current?.setEnabled(aiEnabled); }, [aiEnabled, projectId, html]);
  return <iframe ref={frameRef} title={title} className={className}
    sandbox="allow-scripts" referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'; fullscreen 'none'"
  />;
}
