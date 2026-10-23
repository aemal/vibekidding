"use client";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  ArrowUpRight,
  LoaderCircle,
  Pause,
  Play,
  Search,
} from "lucide-react";
import { examples } from "@/lib/studio/project-examples";
import { samanthaLanguages } from "@/lib/studio/samantha-languages";
export function SamanthaCharacter({
  speaking = false,
}: {
  speaking?: boolean;
}) {
  return (
    <div
      className={`samantha-character ${speaking ? "is-speaking" : ""}`}
      aria-hidden="true"
    >
      <div className="samantha-voice-badge">
        <span className="samantha-voice-spark sparkle-one">✦</span>
        <span className="samantha-voice-spark sparkle-two">✧</span>
        <Mic size={56} strokeWidth={2} />
      </div>
      <div className="samantha-voice-meter">
        {[8, 15, 23, 15, 8].map((height, i) => (
          <i key={i} style={{ height, animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    </div>
  );
}
export function SamanthaHero() {
  return (
    <div className="samantha-hero-card">
      <span className="mini-label">MEET SAMANTHA</span>
      <SamanthaCharacter />
      <h2>
        A familiar hello.
        <br />A world of possibilities.
      </h2>
      <p>
        Your future AI project helper.
        <br />
        Get to know her voice today.
      </p>
      <a href="#meet-samantha">
        Hear her say hello <Play size={14} />
      </a>
      <small>Prerecorded samples · Live voice coming later</small>
    </div>
  );
}
export function SamanthaShowcase({ onIdea }: { onIdea: (idea: string) => void }) {
  const [selected, setSelected] = useState("en");
  const [copied, setCopied] = useState(false);
  const example = examples.find((item) => item.code === selected);
  const [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState(false),
    [active, setActive] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null),
    attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current++;
      audio.current?.pause();
      if (audio.current) {
        audio.current.removeAttribute("src");
        audio.current.load();
      }
    },
    [],
  );
  async function play(code: string) {
    setSelected(code);
    setCopied(false);
    const version = ++attempt.current;
    audio.current?.pause();
    setError("");
    if (active === code) {
      setActive("");
      setLoading(false);
      return;
    }
    const next = new Audio(`/samantha/greetings/${code}.mp3`);
    audio.current = next;
    setActive(code);
    setLoading(true);
    next.onended = () => {
      if (version === attempt.current) {
        setActive("");
        setLoading(false);
      }
    };
    next.onerror = () => {
      if (version === attempt.current) {
        setActive("");
        setLoading(false);
        setError("This greeting could not play. Please try another language.");
      }
    };
    try {
      await next.play();
      if (version === attempt.current) setLoading(false);
    } catch {
      if (version === attempt.current) {
        setActive("");
        setLoading(false);
        setError("Playback could not start. Please try again.");
      }
    }
  }
  const current = samanthaLanguages.find((l) => l.code === active);
  const matches = samanthaLanguages.filter((l) =>
    `${l.name} ${l.native}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const visible = query || expanded ? matches : matches.slice(0, 12);
  return (
    <section
      className="samantha-showcase"
      id="meet-samantha"
      aria-labelledby="samantha-title"
    >
      <div className="samantha-introduction">
        <div>
          <span className="eyebrow">A HELLO THAT FEELS LIKE HOME</span>
          <h2 id="samantha-title">
            Meet Samantha.
            <br />
            <em>Many languages. One warm welcome.</em>
          </h2>
          <p>
            A friendly voice can make a new experience feel more familiar. Hear
            Samantha introduce herself in {samanthaLanguages.length} languages,
            then try a project idea in familiar words. Choose a greeting below
            to explore that language’s example, where available.
          </p>
          <p className="sample-disclosure">
            These are prerecorded “Hi, I am Samantha” greetings. No microphone,
            sign-in or AI credits needed. Live project conversations are still
            awaiting setup.
          </p>
        </div>
        <div className="samantha-listening-card">
          <SamanthaCharacter speaking={!!active && !loading} />
          <span className="samantha-status" role="status">
            {current
              ? `${loading ? "Loading" : "Playing"} ${current.name} greeting`
              : "Pick a language. Hear a little hello."}
          </span>
          {active && (
            <button className="quiet" onClick={() => void play(active)}>
              <Pause size={15} /> Stop greeting
            </button>
          )}
        </div>
      </div>
      <div className="section-heading samantha-toolbar">
        <div>
          <h3>Find your family’s familiar hello.</h3>
          <p>Search by language or its native name.</p>
        </div>
        <label className="language-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search Samantha languages"
            placeholder="English, العربية, हिन्दी…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="samantha-language-grid">
        {visible.map((l) => (
          <article
            className={`samantha-language-tile ${active === l.code ? "is-playing" : ""}`}
            key={l.code}
          >
            <span className="samantha-flag" aria-hidden="true">
              {l.flag}
            </span>
            <div>
              <strong>{l.name}</strong>
              <span lang={l.code} dir="auto">
                {l.native}
              </span>
              <small>
                {active === l.code
                  ? loading
                    ? "Loading…"
                    : "Playing greeting"
                  : "Hear Samantha say hello"}
              </small>
            </div>
            <button
              aria-label={`${active === l.code ? "Stop" : "Play"} ${l.name} greeting`}
              aria-pressed={active === l.code}
              onClick={() => void play(l.code)}
            >
              {active === l.code ? (
                loading ? (
                  <LoaderCircle size={18} />
                ) : (
                  <Pause size={18} />
                )
              ) : (
                <Play size={18} />
              )}
            </button>
          </article>
        ))}
      </div>
      {!matches.length && (
        <p role="status">No matching language. Try another spelling or name.</p>
      )}
      {!query && (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <span>
            {expanded
              ? "Show fewer languages"
              : `Explore all ${samanthaLanguages.length} voice samples`}
          </span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      )}
      {error && (
        <p role="alert" className="studio-notice">
          {error}
        </p>
      )}
      <div className="language-prompt" aria-live="polite" style={{ marginTop: 24 }}>
        <span className="mini-label">ONE LITTLE IDEA TO TRY TOGETHER</span>
        {example ? (
          <>
            <h3>A musical garden · {example.name}</h3>
            <blockquote lang={example.code} dir={["ar", "fa", "ur"].includes(example.code) ? "rtl" : "ltr"}>
              {example.prompt}
            </blockquote>
            {example.code !== "en" && <p>{example.translation}</p>}
            <button className="primary" onClick={() => { onIdea(example.prompt); setCopied(true); }}>
              Use this idea <ArrowUpRight size={16} />
            </button>
            <small>{copied ? "Idea selected. Set up your family account below to build." : "Illustrative prompt · no AI call or credits used"}</small>
          </>
        ) : (
          <p>We have a greeting for this language, but no translated example yet. You can still describe your own project idea in the words your family uses.</p>
        )}
      </div>
      <div className="samantha-footnote">
        <p>
          Flags represent example regions; languages cross borders. Voice
          samples do not guarantee live agent or project-generation support in
          every language.
        </p>
        <a href="#get-started">
          Create together <ArrowUpRight size={14} />
        </a>
      </div>
    </section>
  );
}
