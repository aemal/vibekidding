import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import "../studio.css";

export const metadata: Metadata = {
  title: "V1 presentation archive | VibeKidding",
  robots: { index: false, follow: false },
};

const slides = [
  "Selected games",
  "All games",
  "Game leaderboard",
  "Apple Horse Jump in German",
  "Dot Connect Rectangle Game",
  "A look inside the game code",
  "Creating with voice",
  "Creating with text",
  "Language selection",
];

export default function V1Archive() {
  return (
    <div className="studio">
      <main className="studio-main" style={{ maxWidth: 1400 }}>
        <Link href="/">← Back to the studio</Link>
        <header style={{ margin: "32px 0" }}>
          <span className="eyebrow">PRESENTATION ARCHIVE</span>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800 }}>Where it all started</h1>
          <p>Nine snapshots of VibeKidding V1. Select any image to open it at full size.</p>
          <p className="fine">Historical screenshots, captured October 19, 2026. The controls shown are part of the images.</p>
        </header>
        <nav aria-label="Archive screenshots" style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          {slides.map((title, i) => <a key={title} href={`#slide-${i + 1}`}>{i + 1}. {title}</a>)}
        </nav>
        {slides.map((title, i) => {
          const src = `/archive/v1/${String(i + 1).padStart(2, "0")}.png`;
          return (
            <figure key={title} id={`slide-${i + 1}`} style={{ margin: "0 0 40px", scrollMarginTop: 24 }}>
              <figcaption style={{ marginBottom: 12, fontWeight: 700 }}>{i + 1} / 9 · {title}</figcaption>
              <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title} at full size in a new tab`}>
                <Image src={src} alt={`VibeKidding V1: ${title}`} width={2848} height={1868} sizes="(max-width: 1400px) 100vw, 1400px" style={{ width: "100%", height: "auto", borderRadius: 20 }} />
              </a>
            </figure>
          );
        })}
        <footer>
          <Link href="/">Back to today’s studio</Link>
          <Link href="/v1/original">Original V1 interface</Link>
        </footer>
      </main>
    </div>
  );
}
