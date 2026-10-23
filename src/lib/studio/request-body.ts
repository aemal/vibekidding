export class RequestBodyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Byte and total-time limits apply even without a truthful Content-Length.
export async function readBoundedText(req: Pick<Request, "body" | "signal">, limit: number, timeoutMs = 10000) {
  const reader = req.body?.getReader();
  if (!reader) throw new RequestBodyError("Missing request body.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestBodyError("Request took too long.", 408)), timeoutMs);
    abort = () => reject(new RequestBodyError("Request was interrupted.", 408));
    req.signal.addEventListener("abort", abort, { once: true });
    if (req.signal.aborted) abort();
  });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RequestBodyError("Request is too large.", 413);
      chunks.push(value);
    }
    // Preserve BOM, whitespace and Unicode exactly for signed webhook payloads.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    // A stream's cancellation hook may hang; it must not delay the response.
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Request could not be read.");
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function readStudioBody(req: Request, timeoutMs = 10000) {
  const text = await readBoundedText(req, 120000, timeoutMs);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new RequestBodyError("Invalid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RequestBodyError("Request must be a JSON object.");
  return parsed;
}
