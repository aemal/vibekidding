"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_DATA_BACKUP_BYTES, snapshotProjectData, encodeDataBackup, parseDataBackup, restoreProjectData } from "@/lib/demo-data-backup";

type Review = { backup: ReturnType<typeof parseDataBackup>; baseline: string | null };
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

export function DemoDataBackup({ projectId, title, onClose, onRestored }: {
  projectId: string;
  title: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const lifetime = epoch;
    dialog.current?.showModal();
    return () => { lifetime.current++; };
  }, [projectId]);
  function close() { epoch.current++; onClose(); }
  function exportData() {
    setError(""); setNotice("");
    try {
      const { records } = snapshotProjectData(storage, projectId);
      const blob = new Blob([encodeDataBackup(records)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "project"}-app-data.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("App data download requested. Keep this file private; it contains your saved text.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "App data could not be exported."); }
  }
  async function readFile(file: File) {
    const request = ++epoch.current;
    setReading(true); setReview(null); setError(""); setNotice("");
    try {
      if (file.size > MAX_DATA_BACKUP_BYTES) throw new Error("This app data backup is too large. Choose a smaller app data JSON file.");
      // Bind to the current project's exact data before the asynchronous file read.
      const { baseline } = snapshotProjectData(storage, projectId);
      const source = await file.text();
      if (request !== epoch.current) return;
      const backup = parseDataBackup(source);
      setReview({ backup, baseline });
    } catch (cause) {
      if (request === epoch.current) setError(cause instanceof Error ? cause.message : "This app data backup could not be read.");
    } finally { if (request === epoch.current) setReading(false); }
  }
  function restore() {
    if (!review || reading) return;
    try {
      restoreProjectData(storage, projectId, review.backup, review.baseline);
      epoch.current++;
      onRestored();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore could not be confirmed. Your preview has not been restarted."); }
  }
  return <dialog ref={dialog} className="demo-dialog demo-data-dialog" aria-labelledby="demo-data-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="demo-section-heading"><h2 id="demo-data-title">Saved app data</h2><button type="button" className="demo-icon-button" aria-label="Close saved app data" onClick={close}>×</button></div>
    <p><strong>{title}</strong></p>
    <p>This separate backup contains saved app data, such as notes, for this project in this browser. Project code, version history, and shared links do not include it.</p>
    <p className="demo-fine">App data files can contain personal text. Keep them private. Restoring replaces this project’s saved app data; it does not change its code or history.</p>
    <input ref={fileInput} type="file" hidden accept=".json,application/json" aria-label="Import app data backup" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readFile(file); }} />
    <div className="demo-data-tools"><button type="button" disabled={reading} onClick={exportData}>Export app data JSON</button><button type="button" disabled={reading} onClick={() => fileInput.current?.click()}>Import app data JSON</button></div>
    {reading && <p role="status">Reading app data backup…</p>}
    {review && <section className="demo-data-review" aria-label="App data import review"><h3>Review replacement</h3><p>{review.backup.keyCount} saved {review.backup.keyCount === 1 ? "key" : "keys"} · {review.backup.byteSize.toLocaleString()} bytes</p>{review.backup.keyCount ? <ul aria-label="Imported app data keys">{Object.keys(review.backup.records).map(key => <li key={key}>{key}</li>)}</ul> : <p>This empty backup will clear this project’s saved app data.</p>}<p>Replace all saved app data for <strong>{title}</strong>? Export its current app data first if you want to keep it. Unsaved text in the preview is not backed up and will be lost when the preview restarts.</p></section>}
    {error && <p className="demo-alert" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="demo-dialog-actions"><button type="button" onClick={close}>Cancel</button>{review && <button type="button" className="demo-primary" disabled={reading} onClick={restore}>Replace saved app data</button>}</div>
  </dialog>;
}
