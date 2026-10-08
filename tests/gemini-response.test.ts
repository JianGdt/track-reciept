import test from "node:test";
import assert from "node:assert/strict";
import { parseReceiptResponse } from "../apps/web/lib/gemini-response";
import { receiptSchema } from "../packages/shared/src";
const fields = {
  merchant: "Sample store",
  purchaseDate: "2026-10-08",
  totalMinor: 150,
  currency: "PHP",
  category: "food",
  confidence: 0.95,
};
function response(value: unknown) {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
  };
}
test("partial extraction preserves readable fields and never invents a totalMinor", () => {
  const result = parseReceiptResponse(
    response({ ...fields, totalMinor: null }),
  );
  assert.equal(result.merchant, fields.merchant);
  assert.equal(result.purchaseDate, fields.purchaseDate);
  assert.equal(result.category, "food");
  assert.equal(result.totalMinor, null);
  assert.ok(result.confidence < 0.8);
  assert.equal(
    receiptSchema.safeParse({
      merchant: result.merchant,
      purchase_date: result.purchaseDate,
      total_amount: result.totalMinor,
      currency: result.currency,
      category_id: null,
      payment_method: "",
      notes: "",
    }).success,
    false,
  );
});
test("complete extraction preserves the amount including an explicit zero", () => {
  for (const totalMinor of [0, 150])
    assert.equal(
      parseReceiptResponse(response({ ...fields, totalMinor })).totalMinor,
      totalMinor,
    );
});
test("malformed output and invalid fields are scanner errors, not unreadable photos", () => {
  assert.throws(
    () =>
      parseReceiptResponse({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: '{"totalMinor":' }] },
          },
        ],
      }),
    { status: 502 },
  );
  assert.throws(
    () => parseReceiptResponse(response({ ...fields, totalMinor: -1 })),
    { status: 502 },
  );
  assert.throws(
    () =>
      parseReceiptResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    { status: 422 },
  );
});

test("overloads fall back once, while unreadable images and configuration failures do not", async () => {
  const { ScanError, withScanFallback } =
    await import("../apps/web/lib/gemini-response");
  const expected = parseReceiptResponse(response(fields));
  let calls = 0;
  const fallback = async () => {
    calls++;
    return expected;
  };
  assert.deepEqual(
    await withScanFallback(async () => {
      throw new ScanError(503, "Overloaded", true);
    }, fallback),
    expected,
  );
  assert.equal(calls, 1);
  for (const status of [422, 429, 502, 503]) {
    await assert.rejects(
      withScanFallback(async () => {
        throw new ScanError(status, "Do not retry");
      }, fallback),
      { status },
    );
  }
  assert.equal(calls, 1);
  await assert.rejects(
    withScanFallback(
      async () => {
        throw new ScanError(503, "Overloaded", true);
      },
      async () => {
        calls++;
        throw new ScanError(503, "Also overloaded", true);
      },
    ),
    { status: 503 },
  );
  assert.equal(calls, 2);
});
