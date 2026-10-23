import test from "node:test";
import assert from "node:assert/strict";
import { receiptPhotoKey, receiptScanKey } from "../lib/receipt-duplicates";
import { canRecoverScan } from "../lib/scan-recovery";
import { VaultError } from "../lib/vault-client";
import type { ScanDto } from "../lib/shared";

const scan: ScanDto = {
  merchant: "Example Store",
  merchantAddress: "123 Main St., Manila",
  receiptNumber: "001245107",
  printedDate: "10/04/2026",
  purchaseDate: null,
  totalMinor: 29800,
  currency: "PHP",
  category: "food",
  confidence: 0.95,
};
test("duplicate photos share a key while different bytes do not", () => {
  assert.equal(
    receiptPhotoKey(Buffer.from("photo")),
    receiptPhotoKey(Buffer.from("photo")),
  );
  assert.notEqual(
    receiptPhotoKey(Buffer.from("photo")),
    receiptPhotoKey(Buffer.from("other")),
  );
});
test("invoice matching tolerates OCR casing, spacing and punctuation", () => {
  assert.ok(receiptScanKey(scan));
  assert.equal(
    receiptScanKey(scan),
    receiptScanKey({
      ...scan,
      merchant: "EXAMPLE  STORE",
      merchantAddress: "123 Main St Manila",
      printedDate: "10-04-2026",
    }),
  );
});
test("separate purchases, branches and amounts are not blocked as duplicates", () => {
  for (const change of [
    { receiptNumber: "001245108" },
    { merchantAddress: "Another branch" },
    { totalMinor: 29900 },
    { currency: "USD" as const },
    { printedDate: "10/05/2026" },
  ])
    assert.notEqual(
      receiptScanKey(scan),
      receiptScanKey({ ...scan, ...change }),
    );
  for (const change of [
    { receiptNumber: null },
    { merchantAddress: null },
    { totalMinor: null },
    { printedDate: null },
  ])
    assert.equal(receiptScanKey({ ...scan, ...change }), null);
});
test("duplicate conflicts do not trigger automatic paid scan retries", () => {
  assert.equal(
    canRecoverScan(new VaultError("Already saved", 409, "DUPLICATE_RECEIPT")),
    false,
  );
});
