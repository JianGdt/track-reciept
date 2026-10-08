import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, utcQuotaWindow } from "../lib/limits";
test("daily quota resets at UTC midnight across month and year boundaries", () => {
  const last = utcQuotaWindow(Date.parse("2026-12-31T23:59:59.500Z"));
  assert.equal(last.day, "2026-12-31");
  assert.equal(last.reset, Date.parse("2027-01-01T00:00:00Z"));
  assert.equal(last.retryAfter, 1);
  assert.equal(utcQuotaWindow(last.reset).retryAfter, 86400);
});
test("new-account allowance is lower and uploaded payload fits the hosting body limit", () => {
  assert.ok(LIMITS.newAccountScanPerDay < LIMITS.scanPerDay);
  assert.ok(LIMITS.maxUploadBytes < 4.5 * 1024 * 1024);
});
