"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { Check, Copy, QrCode, Share2, X } from "lucide-react";

export function ProjectShare({ previewUrl }: { previewUrl: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [local, setLocal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState("");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    try {
      const resolved = new URL(previewUrl, window.location.origin);
      if (!["http:", "https:"].includes(resolved.protocol))
        throw new Error("Invalid URL");
      setUrl(resolved.href);
      setLocal(
        resolved.hostname === "localhost" ||
          resolved.hostname.endsWith(".localhost") ||
          resolved.hostname.startsWith("127.") ||
          resolved.hostname === "[::1]",
      );
      setError("");
      setCopied(false);
      setOpen(true);
    } catch {
      setError("This app does not have a shareable published URL.");
    }
  }

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 256,
        }),
      )
      .then((data) => {
        if (!cancelled) setImage(data);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "The QR code could not be drawn. You can still copy the link.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copy() {
    setCopied(false);
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(
        "Clipboard access is unavailable. Select the link below and copy it manually.",
      );
    }
  }

  return (
    <section className="v2-project-share" aria-label="Share published app">
      <Button variant="ghost" aria-expanded={open} onPress={toggle}>
        <Share2 size={16} /> Share app
      </Button>
      {!open && error && <p role="alert">{error}</p>}
      {open && (
        <div className="v2-share-panel">
          <div className="v2-share-heading">
            <h3>Share the published app</h3>
            <Button
              variant="ghost"
              isIconOnly
              aria-label="Close sharing"
              onPress={() => setOpen(false)}
            >
              <X size={18} />
            </Button>
          </div>
          <p>
            {local
              ? "This localhost link works only on this computer. To open it on a phone or share it with someone else, publish the app on a reachable host first."
              : "Anyone opening this link needs access to the host. Any sign-in required by the app still applies."}
          </p>
          <div className="v2-share-link">
            <Input
              aria-label="Published app URL"
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
            />
            <Button onPress={() => void copy()}>
              <>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy link"}
              </>
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
          {image ? (
            <div className="v2-share-qr">
              {/* Locally generated QR data has no remote image to optimize. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                width={256}
                height={256}
                alt="QR code for the published app URL"
              />
              <small>
                {local
                  ? "This QR code contains the same local-only address."
                  : "Scan to open the published app."}{" "}
                QR codes are generated on this device.
              </small>
            </div>
          ) : !error ? (
            <p>
              <QrCode size={16} /> Preparing QR code…
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
