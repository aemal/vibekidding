"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button, Link, Modal } from "@heroui/react";
import { ArrowLeft, ArrowRight, Expand, Images, X } from "lucide-react";

const screenshots = Array.from({ length: 9 }, (_, index) => ({
  src: `/archive/v1/${String(index + 1).padStart(2, "0")}.png`,
  alt: `Original VibeKidding first-version screenshot ${index + 1}`,
}));

export function FirstVersionGallery() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  function show(next: number) {
    setIndex((next + screenshots.length) % screenshots.length);
    setZoom(false);
  }
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      setIndex(current => (current + (event.key === "ArrowRight" ? 1 : -1) + screenshots.length) % screenshots.length);
      setZoom(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);
  return <div className="vl-v1-gallery" id="first-version">
    <Button className="vl-v1-open" variant="secondary" onPress={() => { show(0); setOpen(true); }}>
      <Images size={19} /> Explore the first version <span>9 screenshots</span>
    </Button>
    <p className="vl-v1-hint">A look back at where this started. Open any screenshot to present it large.</p>
    <div className="vl-v1-thumbnails" aria-label="First-version screenshots">
      {screenshots.map((shot, position) => <Button key={shot.src} aria-label={`Open first-version screenshot ${position + 1}`} onPress={() => { show(position); setOpen(true); }}>
        <Image src={shot.src} alt="" width={190} height={125} sizes="100px" />
        <span>{position + 1}</span>
      </Button>)}
    </div>
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen} className="vl-v1-backdrop">
      <Modal.Container className="vl-v1-container" placement="center">
        <Modal.Dialog className="vl-v1-dialog">
          <Modal.Header className="vl-v1-header">
            <div><Modal.Heading>The first VibeKidding</Modal.Heading><p>Original screenshots from the first version</p></div>
            <Button isIconOnly variant="ghost" aria-label="Close screenshot gallery" onPress={() => setOpen(false)}><X size={22} /></Button>
          </Modal.Header>
          <div key={`${index}-${zoom}`} className={`vl-v1-stage ${zoom ? "is-zoomed" : ""}`} tabIndex={0} aria-label="Screenshot viewing area. Use arrow keys for previous and next.">
            {/* Original images are deliberately retained at their full resolution for presenting. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screenshots[index].src} alt={screenshots[index].alt} />
          </div>
          <Modal.Footer className="vl-v1-controls">
            <Button onPress={() => show(index - 1)} aria-label="Previous screenshot"><ArrowLeft size={19} /><span>Previous</span></Button>
            <span className="vl-v1-count" role="status" aria-live="polite">{index + 1} / {screenshots.length}</span>
            <Button onPress={() => show(index + 1)} aria-label="Next screenshot"><span>Next</span><ArrowRight size={19} /></Button>
            <Button variant="secondary" onPress={() => setZoom(!zoom)} aria-pressed={zoom}><Expand size={17} />{zoom ? "Fit to window" : "Zoom in"}</Button>
            <Link href={screenshots[index].src} target="_blank" rel="noopener noreferrer">Open original</Link>
          </Modal.Footer>
          <p className="vl-v1-keyboard">Use ← and → to browse. Escape closes. Zoom in to scroll through details.</p>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </div>;
}
