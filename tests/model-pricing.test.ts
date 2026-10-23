import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewedModelPricing } from "../src/lib/studio/model-pricing";
const now = Date.parse("2026-10-20T12:00:00Z");
const model = { enabled: true, input_rate: 100000, output_rate: 200000, max_output: 2048, reviewed_at: new Date(now).toISOString() };
test("reviewed model pricing accepts current bounded values and exact age boundary", () => {
  assert.equal(reviewedModelPricing(model, now), true);
  assert.equal(reviewedModelPricing({...model,reviewed_at:new Date(now-30*86400000).toISOString()},now),true);
});
test("invalid, stale, future, disabled and out-of-bound pricing fails closed", () => {
  for (const patch of [
    {enabled:false}, {reviewed_at:"invalid"}, {reviewed_at:null},
    {reviewed_at:new Date(now+1).toISOString()},
    {reviewed_at:new Date(now-30*86400000-1).toISOString()},
    {input_rate:0}, {input_rate:1.5}, {input_rate:"1000"},
    {output_rate:Infinity}, {output_rate:1000000001},
    {max_output:127}, {max_output:4097}, {max_output:NaN},
  ]) assert.equal(reviewedModelPricing({...model,...patch},now),false,JSON.stringify(patch));
});
