// Inert server foundation. The transport adapter must prove that the complete
// transcript describes exactly this turn's audio before calling finish().
// This does not authorize playback, settle charges, or stop provider sockets.
export class VoiceOutputGate {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private state: "collecting" | "reviewing" | "closed" = "collecting";
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(private readonly turnId: string, timeoutMs = 15000) {
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(turnId) ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000)
      throw new Error("Invalid voice output gate configuration");
    // Includes collection and moderation, even when the reviewer ignores abort.
    this.timer = setTimeout(() => this.close(), timeoutMs);
  }

  close() {
    this.state = "closed";
    clearTimeout(this.timer);
    for (const chunk of this.chunks) chunk.fill(0);
    this.chunks = [];
    this.bytes = 0;
    this.controller.abort();
  }

  append(turnId: string, pcm16: Uint8Array): boolean {
    if (this.state !== "collecting" || turnId !== this.turnId ||
        !(pcm16 instanceof Uint8Array) || !pcm16.byteLength ||
        pcm16.byteLength % 2 !== 0 || pcm16.byteLength > 32768 ||
        this.bytes + pcm16.byteLength > 256000 || this.chunks.length >= 256) {
      this.close();
      return false;
    }
    this.chunks.push(Buffer.from(pcm16)); // Copy: callers cannot change reviewed audio.
    this.bytes += pcm16.byteLength;
    return true;
  }

  async finish(turnId: string, completeTranscript: string,
    review: (transcript: string, signal: AbortSignal) => Promise<boolean>): Promise<Buffer | null> {
    if (this.state !== "collecting" || turnId !== this.turnId || !this.bytes ||
        typeof completeTranscript !== "string" || !completeTranscript.trim() ||
        Buffer.byteLength(completeTranscript) > 16000) {
      this.close();
      return null;
    }
    this.state = "reviewing";
    const signal = this.controller.signal;
    let onAbort: () => void = () => {};
    const cancelled = new Promise<false>(resolve => {
      onAbort = () => resolve(false);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const verdict = await Promise.race([
        Promise.resolve().then(() => signal.aborted ? false : review(completeTranscript, signal)),
        cancelled,
      ]);
      if (verdict !== true || signal.aborted) return null;
      return Buffer.concat(this.chunks, this.bytes);
    } catch {
      return null;
    } finally {
      signal.removeEventListener("abort", onAbort);
      this.close();
    }
  }
}
