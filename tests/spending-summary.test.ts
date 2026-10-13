import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { qk, type Receipt } from "../lib/shared";
import {
  selectReceipts,
  summarizeSpending,
  spendingYear,
  addMonthlySpending,
  type MonthlySpending,
} from "../lib/spending-summary";
import { ReportSchema } from "../lib/shared";

const manual: Receipt = {
  id: "manual",
  user_id: "alice",
  merchant: "Dali store",
  purchase_date: "2026-09-10",
  total_amount: 188,
  currency: "PHP",
  category_id: null,
  payment_method: "Card",
  notes: "",
  image_path: null,
  scan_status: "manual",
  scan_raw: null,
  created_at: "",
  updated_at: "",
};
const scanned: Receipt = {
  ...manual,
  id: "scanned",
  merchant: "Coffee shop",
  purchase_date: "2026-10-13",
  total_amount: 285.25,
  scan_status: "scanned",
};

test("all months includes manual and scanned receipts regardless of purchase month", () => {
  const summary = summarizeSpending(
    selectReceipts([manual, scanned], {}),
    "PHP",
  );
  assert.equal(summary.totalMinor, 47325);
  assert.equal(summary.count, 2);
  assert.equal(summary.categories[0].totalMinor, 47325);
  assert.deepEqual(summary.months, [
    { month: "2026-09", totalMinor: 18800, count: 1 },
    { month: "2026-10", totalMinor: 28525, count: 1 },
  ]);
  assert.equal(ReportSchema.safeParse(summary).success, true);
});

test("year chart fills empty months and separates years and currencies", () => {
  const summary = summarizeSpending(
    [
      manual,
      scanned,
      { ...manual, id: "previous", purchase_date: "2025-09-10" },
      { ...scanned, id: "dollars", currency: "USD" },
    ],
    "PHP",
  );
  const year = spendingYear(summary.months, 2026);
  assert.equal(year.length, 12);
  assert.deepEqual(year[0], { month: "2026-01", totalMinor: 0, count: 0 });
  assert.equal(year[8].totalMinor, 18800);
  assert.equal(year[9].totalMinor, 28525);
  assert.equal(
    year.reduce((sum, row) => sum + row.totalMinor, 0),
    47325,
  );
  assert.equal(spendingYear(summary.months, 2025)[8].totalMinor, 18800);
});

test("monthly aggregation accumulates across pages and uses exact minor units", () => {
  const months = new Map<string, MonthlySpending>();
  for (let i = 0; i < 125; i++) addMonthlySpending(months, "2026-10-01", 10);
  addMonthlySpending(months, "2026-10-31", 20);
  addMonthlySpending(months, "2026-11-01", 50);
  assert.deepEqual(months.get("2026-10"), {
    month: "2026-10",
    count: 126,
    totalMinor: 1270,
  });
  assert.equal(months.get("2026-11")?.totalMinor, 50);
});

test("changing a purchase date moves its spending into the correct month", () => {
  const summary = summarizeSpending(
    [{ ...manual, purchase_date: "2026-10-01" }, scanned],
    "PHP",
  );
  assert.deepEqual(summary.months, [
    { month: "2026-10", totalMinor: 47325, count: 2 },
  ]);
});

test("month and search selections narrow totals without mixing currencies", () => {
  const rows = [manual, scanned, { ...scanned, id: "usd", currency: "USD" }];
  const selection = selectReceipts(rows, { month: "2026-10", q: "COFFEE" });
  assert.equal(summarizeSpending(selection, "PHP").totalMinor, 28525);
  assert.equal(
    summarizeSpending(selectReceipts(rows, { month: "2026-08" }), "PHP")
      .totalMinor,
    0,
  );
  assert.equal(
    summarizeSpending(selectReceipts(rows, { categoryId: "another" }), "PHP")
      .totalMinor,
    0,
  );
});

test("edits and deletes recalculate the saved spending amount", () => {
  assert.equal(
    summarizeSpending([{ ...manual, total_amount: 200 }, scanned], "PHP")
      .totalMinor,
    48525,
  );
  assert.equal(summarizeSpending([scanned], "PHP").totalMinor, 28525);
});

test("receipt refresh invalidates both list and spending reports for the same account", async () => {
  const cache = new QueryClient();
  const keys = [
    qk.list("alice", {}),
    qk.report("alice", { currency: "PHP" }),
    qk.report("alice", { month: "2026-09", currency: "PHP" }),
  ];
  for (const key of keys) cache.setQueryData(key, {});
  const other = qk.report("bob", { currency: "PHP" });
  cache.setQueryData(other, {});
  await cache.invalidateQueries({ queryKey: qk.receipts("alice") });
  for (const key of keys)
    assert.equal(cache.getQueryState(key)?.isInvalidated, true);
  assert.equal(cache.getQueryState(other)?.isInvalidated, false);
  cache.clear();
});
