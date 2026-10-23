// A timeout after submission is ambiguous: never refund or retry automatically.
export async function confirmBillingImport(
  request: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>,
  apply: boolean, rowCount: number, timeoutMs = 10000,
) {
  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 100 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw new Error("Invalid billing confirmation limits");
  const message = apply
    ? "Import not confirmed. Inspect audit records or rerun the identical file; do not assume rollback after a timeout."
    : "Preview failed. Check record matching, age, state and amounts. No writes requested.";
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error(message)); }, timeoutMs);
      }),
    ]);
    if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data))
      throw new Error(message);
    const data = result.data as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") !== "already_imported,apply,eligible" || data.apply !== apply ||
        !Number.isSafeInteger(data.eligible) || !Number.isSafeInteger(data.already_imported) ||
        (data.eligible as number) < 0 || (data.already_imported as number) < 0 ||
        (data.eligible as number) + (data.already_imported as number) !== rowCount)
      throw new Error(message);
    return { apply, eligible: data.eligible as number, already_imported: data.already_imported as number };
  } catch {
    // Provider/transport errors may contain private request details.
    throw new Error(message);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
