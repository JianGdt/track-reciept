import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReceiptResponse,
  providerScanError,
} from "../lib/gemini-response";
import { receiptSchema } from "../lib/shared";
const fields = {
  merchant: "Sample store",
  purchaseDate: "2026-10-08",
  totalMinor: 150,
  currency: "PHP",
  category: "food",
  confidence: 0.95,
};

test("provider outages retain the upstream status and a manual retry delay", () => {
  for (const status of [500, 502, 503, 504]) {
    const error = providerScanError(status);
    assert.equal(error.status, 502);
    assert.equal(error.code, "SCAN_PROVIDER_UNAVAILABLE");
    assert.equal(error.providerStatus, status);
    assert.equal(error.retryAfter, 30);
    assert.equal(error.retryable, true);
  }
  const quota = providerScanError(429);
  assert.equal(quota.status, 429);
  assert.equal(quota.retryAfter, 60);
  for (const status of [400, 401, 403, 404]) {
    const error = providerScanError(status);
    assert.equal(error.code, "SCAN_CONFIG_REJECTED");
    assert.equal(error.retryable, false);
    assert.equal(error.retryAfter, undefined);
    assert.equal(error.providerStatus, status);
  }
});
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
    { status: 502, code: "SCAN_OUTPUT_LIMIT" },
  );
});

test("overloads fall back once, while unreadable images and configuration failures do not", async () => {
  const { ScanError, withScanFallback } =
    await import("../lib/gemini-response");
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

test("invalid provider envelopes fail safely and blocked photos remain input errors", () => {
  for (const data of [
    null,
    [],
    "secret upstream text",
    { candidates: [null] },
    { candidates: [{ content: { parts: "bad" } }] },
  ]) {
    assert.throws(() => parseReceiptResponse(data), {
      status: 502,
      code: "SCAN_INVALID_RESPONSE",
    });
  }
  assert.throws(() => parseReceiptResponse({ candidates: [] }), {
    status: 502,
    code: "SCAN_INCOMPLETE_RESPONSE",
  });
  assert.throws(
    () => parseReceiptResponse({ promptFeedback: { blockReason: "SAFETY" } }),
    { status: 422, code: "SCAN_BLOCKED" },
  );
  assert.throws(
    () =>
      parseReceiptResponse(response({ ...fields, purchaseDate: "10/08/2026" })),
    { status: 502, code: "SCAN_INVALID_FIELDS" },
  );
});
