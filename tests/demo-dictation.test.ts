import { test } from "node:test";
import assert from "node:assert/strict";
import { createDictationSession, type DictationRecognition, type DictationView } from "../src/components/demo/BrowserDictation";

function fixture(maxLength = 2000) {
  const callbacks = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0, starts = 0, stops = 0, aborts = 0;
  const views: DictationView[] = [], transcripts: string[] = [];
  const recognition: DictationRecognition = {
    lang: "", continuous: true, interimResults: false, maxAlternatives: 0,
    onstart: null, onresult: null, onerror: null, onend: null,
    start() { starts++; }, stop() { stops++; }, abort() { aborts++; },
  };
  const session = createDictationSession({
    recognition, language: "en-US", maxLength,
    onView: value => views.push(value), onTranscript: value => transcripts.push(value),
    timers: {
      set(callback, delay) { const id = ++nextTimer; callbacks.set(id, { callback, delay }); return id; },
      clear(id) { callbacks.delete(id as number); },
    },
  });
  const result = (...items: Array<[string, boolean]>) => recognition.onresult?.({ results: items.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) });
  const tick = (delay: number) => {
    for (const [id, timer] of [...callbacks]) if (timer.delay === delay) { callbacks.delete(id); timer.callback(); }
  };
  return { recognition, session, views, transcripts, result, tick, callbacks, counts: () => ({ starts, stops, aborts }) };
}

test("dictation starts only explicitly and waits for a final transcript before callback", () => {
  const f = fixture();
  assert.equal(f.counts().starts, 0);
  f.session.start(); f.session.start();
  assert.equal(f.counts().starts, 1);
  assert.equal(f.recognition.lang, "en-US");
  assert.equal(f.recognition.continuous, false);
  assert.equal(f.recognition.interimResults, true);
  assert.equal(f.views.at(-1)?.status, "requesting");
  f.recognition.onstart?.();
  assert.equal(f.views.at(-1)?.status, "listening");
  f.result(["make a", false]);
  assert.equal(f.views.at(-1)?.interim, "make a");
  assert.deepEqual(f.transcripts, []);
  f.result(["make a memory game", true]);
  assert.deepEqual(f.transcripts, []);
  const end = f.recognition.onend;
  end?.(); end?.();
  assert.deepEqual(f.transcripts, ["make a memory game"]);
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.session.active, false);
});

test("cumulative final results are deduplicated, clipped and reported honestly", () => {
  const f = fixture(12);
  f.session.start();
  f.result(["hello", true], ["ocean", false]);
  f.result(["hello", true], ["ocean world", true]);
  f.result(["hello", true], ["ocean world", true]);
  f.recognition.onend?.();
  assert.deepEqual(f.transcripts, ["hello ocean"]);
  assert.match(f.views.at(-1)!.message, /shortened/);
});

test("cancel discards speech and ignores captured late callbacks", () => {
  const f = fixture();
  f.session.start();
  f.result(["do not insert this", true]);
  const lateResult = f.recognition.onresult, lateEnd = f.recognition.onend, lateError = f.recognition.onerror;
  const count = f.views.length;
  f.session.cancel(); f.session.cancel();
  lateResult?.({ results: [{ isFinal: true, 0: { transcript: "stale project" } }] });
  lateEnd?.(); lateError?.({ error: "network" });
  assert.deepEqual(f.transcripts, []);
  assert.equal(f.views.length, count);
  assert.equal(f.counts().aborts, 1);
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.recognition.onresult, null);
});

test("30 second capture cap stops and the bounded final wait aborts a stuck service", () => {
  const f = fixture();
  f.session.start();
  f.result(["blue stars", true]);
  f.tick(30000);
  assert.equal(f.counts().stops, 1);
  assert.equal(f.views.at(-1)?.status, "processing");
  assert.deepEqual(f.transcripts, []);
  f.tick(3000);
  assert.deepEqual(f.transcripts, ["blue stars"]);
  assert.equal(f.counts().aborts, 1);
  assert.equal(f.session.active, false);
  assert.equal(f.callbacks.size, 0);
});

test("explicit stop flushes final speech once and clears pending deadlines", () => {
  const f = fixture();
  f.session.start();
  f.session.stop(); f.session.stop();
  f.result(["a drawing canvas", true]);
  f.recognition.onend?.();
  assert.equal(f.counts().stops, 1);
  assert.deepEqual(f.transcripts, ["a drawing canvas"]);
  assert.equal(f.callbacks.size, 0);
});

test("denial, unavailable audio, network and no-speech errors preserve typing without callbacks", () => {
  for (const [code, expected] of [["not-allowed", /denied/], ["audio-capture", /No microphone/], ["network", /could not connect/], ["no-speech", /No speech/], ["language-not-supported", /language is not supported/]] as const) {
    const f = fixture(); f.session.start();
    const lateEnd = f.recognition.onend;
    f.result(["discard partial session", true]);
    f.recognition.onerror?.({ error: code }); lateEnd?.();
    assert.equal(f.views.at(-1)?.status, "error");
    assert.match(f.views.at(-1)!.message, expected);
    assert.deepEqual(f.transcripts, []);
    assert.equal(f.callbacks.size, 0);
    assert.equal(f.counts().aborts, 1);
  }
});

test("synchronous start errors clean up and empty final results do not submit interim text", () => {
  const f = fixture();
  f.recognition.start = () => { throw new Error("browser refused"); };
  f.session.start();
  assert.equal(f.views.at(-1)?.status, "error");
  assert.equal(f.callbacks.size, 0);
  const g = fixture(); g.session.start(); g.result(["unfinished", false]); g.recognition.onend?.();
  assert.deepEqual(g.transcripts, []);
  assert.match(g.views.at(-1)!.message, /No final speech/);
});

test("zero remaining prompt space cannot start recognition", () => {
  const f = fixture(0); f.session.start();
  assert.equal(f.counts().starts, 0);
  assert.equal(f.callbacks.size, 0);
});
