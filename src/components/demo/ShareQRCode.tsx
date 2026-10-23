"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";

type QRState = { status: "loading"; url: string } | { status: "ready"; url: string; image: string; pixels: number; version: number } | { status: "error"; url: string; message: string };
function compactLink(url: string) {
  try { const parsed = new URL(url); return ["http:", "https:"].includes(parsed.protocol) && parsed.pathname === "/demo/play" && parsed.hash.startsWith("#t1="); }
  catch { return false; }
}

export function ShareQRCode({ url, onExportHtml }: { url: string; onExportHtml(): void }) {
  const [state, setState] = useState<QRState | null>(null);
  const epoch = useRef(0);
  const isCompact = compactLink(url);
  const current = state?.url === url ? state : null;
  useEffect(() => {
    const request = epoch;
    return () => { request.current++; };
  }, [url]);

  async function show() {
    if (!isCompact || current?.status === "loading") return;
    const request = ++epoch.current;
    setState({ status: "loading", url });
    try {
      // Load and render locally only after the user asks. No QR service is contacted.
      const { default: QRCode } = await import("qrcode");
      if (request !== epoch.current) return;
      const symbol = QRCode.create(url, { errorCorrectionLevel: "Q" });
      if (symbol.version > 8) {
        setState({ status: "error", url, message: "This link is too detailed for a clear mobile QR code. Copy the link above or export HTML instead." });
        return;
      }
      const image = await QRCode.toDataURL(url, { errorCorrectionLevel: "Q", version: symbol.version, margin: 4, scale: 6, color: { dark: "#000000", light: "#ffffff" }, type: "image/png" });
      if (request !== epoch.current) return;
      setState({ status: "ready", url, image, version: symbol.version, pixels: (symbol.modules.size + 8) * 6 });
    } catch {
      if (request === epoch.current) setState({ status: "error", url, message: "This browser couldn’t draw the QR code. Copy the link above or export HTML instead." });
    }
  }

  return <section className="demo-share-qr" aria-label="QR sharing">
    {!isCompact ? <p>QR codes are available for compact template links. Copy this link above or export HTML instead.</p> : current?.status === "ready" ? <><h3>Scan to open your own copy</h3><div className="demo-qr-image">
      {/* A locally generated data URL has no remote image to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.image} width={current.pixels} height={current.pixels} alt="QR code for this playable link" data-qr-version={current.version} />
    </div><p>Use another device’s camera to open the link, then choose Play. Each device plays its own copy.</p></> : <button type="button" className="demo-secondary" onClick={() => void show()} disabled={current?.status === "loading"}><QrCode size={16} />{current?.status === "loading" ? "Drawing QR code…" : "Show QR code"}</button>}
    {current?.status === "error" && <p role="alert">{current.message}</p>}
    {(!isCompact || current?.status === "error") && <button type="button" className="demo-secondary" onClick={onExportHtml}>Export HTML instead</button>}
    <small>QR images are created on this device. The full playable link is also available above.</small>
  </section>;
}
