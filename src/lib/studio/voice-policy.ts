// Inert protocol foundation for a future server-owned relay, not a voice endpoint.
// Only trusted server code supplies the clock and reviewed session duration.
type ClientMessage =
  | { type: "conversation_initiation_client_data" }
  | { user_audio_chunk: string }
  | { type: "pong"; event_id: number };
export class VoicePolicy {
  private readonly started: number;
  private last: number;
  private ended = false;
  private initialized = false;
  private bytes = 0;
  private messages = 0;
  private pings = new Set<number>();
  constructor(private readonly durationMs: number, private readonly clock = () => performance.now()) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 180000)
      throw new Error("Invalid server voice duration");
    this.started = this.last = clock();
    if (!Number.isFinite(this.started)) throw new Error("Invalid server clock");
  }
  close() { this.ended = true; this.pings.clear(); }
  private deny(): never { this.close(); throw new Error("Voice session stopped by relay policy"); }
  checkDeadline() {
    const now = this.clock();
    if (this.ended || !Number.isFinite(now) || now < this.last || now - this.started >= this.durationMs)
      this.deny();
    this.last = now;
  }
  expectPong(eventId: number) {
    this.checkDeadline();
    if (!Number.isSafeInteger(eventId) || eventId < 0 || this.pings.has(eventId) || this.pings.size >= 16)
      this.deny();
    this.pings.add(eventId);
  }
  accept(raw: string): ClientMessage {
    this.checkDeadline();
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 20000 || ++this.messages > 18000)
      this.deny();
    let value;
    try { value = JSON.parse(raw); } catch { return this.deny(); }
    if (!value || typeof value !== "object" || Array.isArray(value)) this.deny();
    const keys = Object.keys(value).sort().join(",");
    if (keys === "type" && value.type === "conversation_initiation_client_data" && !this.initialized) {
      this.initialized = true;
      return { type: "conversation_initiation_client_data" };
    }
    if (!this.initialized) this.deny();
    if (keys === "event_id,type" && value.type === "pong" && this.pings.delete(value.event_id))
      return { type: "pong", event_id: value.event_id };
    if (keys === "user_audio_chunk" && typeof value.user_audio_chunk === "string") {
      const audio = value.user_audio_chunk;
      if (!audio.length || audio.length > 16384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio))
        this.deny();
      const decoded = Buffer.from(audio, "base64");
      // Only canonical base64 of whole PCM16 samples. Format must be enforced upstream too.
      if (decoded.toString("base64") !== audio || decoded.length % 2 !== 0)
        this.deny();
      this.bytes += decoded.length;
      // Proposed 16 kHz, mono, PCM16 ceiling for the server-reviewed duration.
      if (this.bytes > Math.floor(this.durationMs / 1000 * 32000)) this.deny();
      return { user_audio_chunk: audio };
    }
    return this.deny();
  }
}
