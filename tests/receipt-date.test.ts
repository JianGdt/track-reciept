import test from "node:test";
import assert from "node:assert/strict";
import {
  formatReceiptDate,
  receiptDateOptions,
  resolveReceiptDate,
} from "../lib/receipt-date";
import { parseReceiptResponse } from "../lib/gemini-response";
import {
  receiptSchema,
  scanSchema,
  ScanDtoSchema,
  ReceiptDtoSchema,
} from "../lib/shared";
import { legacyReceipt } from "../lib/vault-client";

test("ambiguous printed dates offer both calendar-valid interpretations without selecting one", () => {
  for (const printed of [
    "10/04/2026",
    "10-04-2026",
    "10.04.2026",
    " 10 / 04 / 2026 ",
  ])
    assert.deepEqual(receiptDateOptions(printed), ["2026-10-04", "2026-04-10"]);
  assert.equal(resolveReceiptDate("10/04/2026", "2026-10-04"), null);
  assert.equal(formatReceiptDate("2026-10-04"), "Oct 4, 2026");
  assert.equal(formatReceiptDate("2026-04-10"), "Apr 10, 2026");
});

test("clear numeric dates normalize without a prompt, including equal day and month", () => {
  for (const printed of ["25/10/2026", "10/25/2026", "2026-10-25"])
    assert.equal(resolveReceiptDate(printed, null), "2026-10-25");
  assert.deepEqual(receiptDateOptions("04/04/2026"), ["2026-04-04"]);
  assert.equal(resolveReceiptDate("29/02/2024", null), "2024-02-29");
  assert.equal(resolveReceiptDate("Oct 4, 2026", "2026-10-04"), "2026-10-04");
});

test("missing, invalid, and short-year dates are never silently replaced with a model guess", () => {
  for (const printed of [
    null,
    "",
    " ",
    "31/02/2026",
    "29/02/2026",
    "10/04/26",
    "13/14/2026",
  ])
    assert.equal(resolveReceiptDate(printed, "2026-10-23"), null);
  assert.equal(resolveReceiptDate(undefined, "2026-10-04"), "2026-10-04");
});

test("scan parsing preserves original text and removes an ambiguous model guess", () => {
  const result = parseReceiptResponse({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                merchant: "Example",
                printedDate: "10/04/2026",
                purchaseDate: "2026-10-04",
                totalMinor: 29800,
                currency: "PHP",
                category: "food",
                confidence: 0.95,
              }),
            },
          ],
        },
      },
    ],
  });
  assert.equal(result.printedDate, "10/04/2026");
  assert.equal(result.purchaseDate, null);
  const recovered = ScanDtoSchema.parse(result);
  const { totalMinor, ...fields } = recovered;
  const formScan = scanSchema.parse({ ...fields, total: totalMinor! / 100 });
  assert.equal(formScan.printedDate, "10/04/2026");
  const form = {
    merchant: "Example",
    purchase_date: "",
    total_amount: 298,
    currency: "PHP",
    category_id: null,
    payment_method: "",
    notes: "",
  };
  assert.equal(receiptSchema.safeParse(form).success, false);
  for (const date of receiptDateOptions(formScan.printedDate))
    assert.equal(
      receiptSchema.safeParse({ ...form, purchase_date: date }).success,
      true,
    );
});

test("saved receipt DTO retains the printed date alongside the confirmed date", () => {
  const saved = ReceiptDtoSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    merchant: "Example",
    purchaseDate: "2026-04-10",
    printedDate: "10/04/2026",
    totalMinor: 29800,
    currency: "PHP",
    categoryId: null,
    paymentMethod: "",
    notes: "",
    hasPhoto: true,
    scanStatus: "scanned",
    createdAt: "2026-10-23T00:00:00Z",
    updatedAt: "2026-10-23T00:00:00Z",
  });
  const receipt = legacyReceipt(saved);
  assert.equal(receipt.purchase_date, "2026-04-10");
  assert.equal(receipt.printed_date, "10/04/2026");
  const { printedDate: _, ...old } = saved;
  assert.equal(legacyReceipt(ReceiptDtoSchema.parse(old)).printed_date, null);
});
