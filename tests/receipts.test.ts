import test from "node:test";
import assert from "node:assert/strict";
import {
  receiptSchema,
  scanSchema,
  scanRequestSchema,
  toCsv,
  type Receipt,
} from "../packages/shared/src";
const valid = {
  merchant: "Coffee shop",
  purchase_date: "2026-10-07",
  total_amount: 285,
  currency: "PHP",
  category_id: null,
  payment_method: "Cash",
  notes: "",
};
test("receipt validation rejects invalid calendar dates, missing totals and negative totals", () => {
  assert.equal(receiptSchema.safeParse(valid).success, true);
  for (const purchase_date of ["2026-02-30", "2026-13-01", "not a date"])
    assert.equal(
      receiptSchema.safeParse({ ...valid, purchase_date }).success,
      false,
    );
  for (const total_amount of [
    undefined,
    null,
    "",
    -1,
    Infinity,
    NaN,
    10000000000,
  ])
    assert.equal(
      receiptSchema.safeParse({ ...valid, total_amount }).success,
      false,
    );
  assert.equal(
    receiptSchema.safeParse({ ...valid, merchant: " " }).success,
    false,
  );
});
test("AI output preserves an unreadable total as null while rejecting invalid values", () => {
  const scan = {
    merchant: "Coffee shop",
    purchaseDate: null,
    total: 285,
    currency: "PHP",
    category: "food",
    confidence: 0.9,
  };
  assert.equal(scanSchema.safeParse(scan).success, true);
  assert.equal(scanSchema.safeParse({ ...scan, total: null }).success, true);
  for (const patch of [
    { total: -1 },
    { total: "285" },
    { confidence: 1.5 },
    { category: "instructions" },
    { currency: "pesos" },
  ])
    assert.equal(scanSchema.safeParse({ ...scan, ...patch }).success, false);
  assert.equal(scanSchema.safeParse({}).success, false);
});
test("scan request rejects arbitrary identifiers", () => {
  assert.equal(
    scanRequestSchema.safeParse({
      receiptId: "../../other-user",
      imagePath: "other/file.jpg",
    }).success,
    false,
  );
});
test("CSV handles commas and quotes and neutralizes spreadsheet formulas", () => {
  const row = {
    ...valid,
    id: "1",
    user_id: "1",
    merchant: '=HYPERLINK("https://example.com")',
    notes: 'hello, "world"\nnext line',
  } as Receipt;
  const csv = toCsv([row], {});
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('"hello, ""world""\nnext line"'));
});

import { ownedImagePath, nextScanQuota } from "../packages/shared/src/security";
test("private photos reject other users and path traversal", () => {
  const id = "ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1";
  assert.equal(ownedImagePath("alice", `alice/${id}.jpg`), true);
  for (const path of [
    `bob/${id}.jpg`,
    `alice2/${id}.jpg`,
    `alice/../bob/${id}.jpg`,
    `alice/${id}.png`,
    `alice/${id}.jpg/extra`,
  ])
    assert.equal(ownedImagePath("alice", path), false);
});
test("scan quotas allow 20 attempts, reject the next, and reset after one hour", () => {
  const now = 10_000_000;
  assert.deepEqual(nextScanQuota(undefined, now), {
    window_start: now,
    requests: 1,
  });
  assert.deepEqual(
    nextScanQuota({ window_start: now - 100, requests: 19 }, now),
    { window_start: now - 100, requests: 20 },
  );
  assert.equal(
    nextScanQuota({ window_start: now - 100, requests: 20 }, now),
    null,
  );
  assert.deepEqual(
    nextScanQuota({ window_start: now - 3_600_000, requests: 20 }, now),
    { window_start: now, requests: 1 },
  );
  assert.equal(nextScanQuota({ window_start: NaN, requests: 1 }, now), null);
});
