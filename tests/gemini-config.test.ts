import test from "node:test";
import assert from "node:assert/strict";
import {
  scanModel,
  scanThinkingConfig,
  SCAN_TIMEOUT_MS,
  FALLBACK_SCAN_TIMEOUT_MS,
} from "../lib/gemini-config";

test("receipt extraction uses the fast default and respects explicit models", () => {
  assert.equal(scanModel(""), "gemini-3.5-flash-lite");
  assert.equal(scanModel("   "), "gemini-3.5-flash-lite");
  assert.equal(scanModel(" gemini-3.8-flash "), "gemini-3.8-flash");
});

test("latency settings only use thinking modes supported by the model family", () => {
  for (const model of [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
  ])
    assert.deepEqual(scanThinkingConfig(model), { thinkingLevel: "minimal" });
  for (const model of [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.1-pro-preview",
  ])
    assert.deepEqual(scanThinkingConfig(model), { thinkingLevel: "low" });
  assert.deepEqual(scanThinkingConfig("gemini-2.5-flash"), {
    thinkingBudget: 0,
  });
  assert.equal(scanThinkingConfig("gemini-2.5-pro"), undefined);
  assert.equal(scanThinkingConfig("custom-model"), undefined);
  assert.ok(SCAN_TIMEOUT_MS + FALLBACK_SCAN_TIMEOUT_MS <= 35_000);
});
