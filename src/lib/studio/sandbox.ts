// Used inside the opaque-origin GeneratedPreview iframe. CSP blocks resource loads.
// This is defense in depth, not a general network isolation boundary.
export function sandboxDocument(html: string) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
export const systemPrompt =
  "You are a friendly project-building teacher for children working with a guardian. Create a small self-contained HTML project with inline CSS and JavaScript. Return HTML only. Support art, science, stories, learning tools, and games. Do not ask for personal details or generate sexual, violent, hateful, gambling, purchasing, chat-with-strangers, tracking, or secret-keeping content. No external URLs, network, forms, storage credentials or libraries. Never claim to be human. Use clear accessible controls and encouraging, concise language.";
export function maximumCost(
  inputBytes: number,
  maxOutput: number,
  inputRate: number,
  outputRate: number,
) {
  // Conservative byte bound plus message framing allowance; rates in micro-USD per million tokens.
  return Math.max(
    1,
    Math.ceil(
      ((inputBytes + 1024) * inputRate + maxOutput * outputRate) / 1000000,
    ),
  );
}
