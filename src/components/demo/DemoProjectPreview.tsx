"use client";

import { useEffect, useRef } from "react";
import { sandboxDocument } from "@/lib/studio/sandbox";
import { createDemoProjectStore, DemoStorageSession, demoStorageSdk } from "@/lib/demo-project-storage";

/** Only the local workshop grants storage, bound by the parent to one project. */
export function DemoProjectPreview({ projectId, html, title, className }: {
  projectId: string;
  html: string;
  title: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    const source = frame?.contentWindow;
    if (!frame || !source) return;
    const session = crypto.randomUUID();
    const bridge = new DemoStorageSession({ source, session, store: createDemoProjectStore({
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    }, projectId) });
    let active = true;
    const receive = (event: MessageEvent) => {
      if (!active || frame.contentWindow !== source) return;
      const reply = bridge.handle(event);
      if (reply !== undefined && active) source.postMessage(reply, "*");
    };
    // Install the listener before starting the opaque document's SDK.
    window.addEventListener("message", receive);
    frame.srcdoc = sandboxDocument(demoStorageSdk(session, window.location.origin) + html);
    return () => {
      active = false;
      bridge.close();
      window.removeEventListener("message", receive);
    };
  }, [projectId, html]);
  return <iframe ref={frameRef} title={title} className={className}
    sandbox="allow-scripts" referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'; fullscreen 'none'"
  />;
}
