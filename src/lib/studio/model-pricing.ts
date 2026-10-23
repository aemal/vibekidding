export function reviewedModelPricing(model: {
  enabled: unknown; input_rate: unknown; output_rate: unknown;
  max_output: unknown; reviewed_at: unknown;
}, now = Date.now()): boolean {
  const rate = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 1000000000;
  const reviewed = typeof model.reviewed_at === "string" ? Date.parse(model.reviewed_at) : NaN;
  return model.enabled === true && rate(model.input_rate) && rate(model.output_rate) &&
    typeof model.max_output === "number" && Number.isSafeInteger(model.max_output) &&
    model.max_output >= 128 && model.max_output <= 4096 &&
    Number.isFinite(reviewed) && reviewed <= now && now - reviewed <= 30 * 86400000;
}
