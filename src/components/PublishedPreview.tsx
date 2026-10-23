"use client";
import { useEffect, useState } from "react";
import { GeneratedPreview } from "./GeneratedPreview";
export function PublishedPreview({ username, slug, digest, html, title }: {
  username: string; slug: string; digest: string; html: string; title: string;
}) {
  const [state, setState] = useState<"checking" | "visible" | "unavailable">("checking");
  useEffect(() => {
    let ended = false, disposed = false, generation = 0;
    let pending: AbortController | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { generation++; clearTimeout(deadline); pending?.abort(); pending = undefined; };
    const stop = () => { if (disposed) return; ended = true; cancel(); setState("unavailable"); };
    const check = async () => {
      if (ended || disposed || pending || document.hidden) return;
      const current = ++generation;
      const controller = pending = new AbortController();
      deadline = setTimeout(stop, 12000);
      try {
        const response = await fetch(`/api/published/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`, {
          cache: "no-store", credentials: "omit", signal: controller.signal,
        });
        const result = response.ok ? await response.json() : null;
        if (ended || disposed || current !== generation) return;
        if (!result || result.digest !== digest) { stop(); return; }
        setState("visible");
      } catch {
        if (!ended && !disposed && current === generation) stop();
      } finally {
        if (current === generation) { clearTimeout(deadline); pending = undefined; }
      }
    };
    const visibility = () => {
      if (ended || disposed) return;
      cancel();
      setState("checking");
      if (!document.hidden) void check();
    };
    // Remove the iframe on backgrounding, then recheck before mounting it again.
    document.addEventListener("visibilitychange", visibility);
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => { disposed = true; cancel(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [username, slug, digest]);
  if (state !== "visible") return <p role="status">{state === "checking"
    ? "Checking that this project is still available…"
    : "This project is unavailable or has changed. Reload to check again."}</p>;
  return <GeneratedPreview title={title} html={html} style={{ width: "100%", height: "85vh", border: "1px solid #ddd", borderRadius: 16, background: "white" }} />;
}
