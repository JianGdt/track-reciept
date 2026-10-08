import test from "node:test";
import assert from "node:assert/strict";
import {
  CreateReceiptSchema,
  UpdateReceiptSchema,
  ScanDtoSchema,
  ListReceiptsSchema,
  toMinor,
  fromMinor,
  qk,
} from "../packages/shared/src";
const receipt = {
  id: "ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1",
  merchant: "Shop",
  purchaseDate: "2026-10-08",
  totalMinor: 101,
  currency: "PHP",
  categoryId: null,
  paymentMethod: "Cash",
  notes: "",
  hasPhoto: false,
};
test("v1 money uses exact minor units for 0, 2 and 3 decimal currencies", () => {
  assert.equal(toMinor("1.01", "PHP"), 101);
  assert.equal(toMinor("0.29", "USD"), 29);
  assert.equal(toMinor("1.234", "KWD"), 1234);
  assert.equal(toMinor(100, "JPY"), 100);
  assert.equal(fromMinor(1234, "KWD"), 1.234);
  for (const [value, currency] of [
    ["1.001", "PHP"],
    ["1.5", "JPY"],
    ["-1", "PHP"],
    ["Infinity", "PHP"],
    ["9007199254740992", "PHP"],
  ])
    assert.throws(() => toMinor(value, currency));
});
test("v1 write schemas reject ownership injection, floats, paths and unknown fields", () => {
  assert.equal(CreateReceiptSchema.safeParse(receipt).success, true);
  for (const patch of [
    { userId: "other" },
    { imagePath: "other/file.jpg" },
    { totalMinor: 1.5 },
    { currency: "XXX" },
    { merchant: "a".repeat(121) },
    { notes: "x".repeat(1001) },
    { purchaseDate: "2026-02-30" },
  ])
    assert.equal(
      CreateReceiptSchema.safeParse({ ...receipt, ...patch }).success,
      false,
    );
  assert.equal(UpdateReceiptSchema.safeParse({}).success, false);
  assert.equal(
    UpdateReceiptSchema.safeParse({ hasPhoto: true }).success,
    false,
  );
  assert.equal(
    UpdateReceiptSchema.safeParse({ notes: "Update" }).success,
    true,
  );
});
test("list limits, dates, IDs and filter keys are bounded", () => {
  assert.equal(ListReceiptsSchema.parse({}).limit, 20);
  for (const input of [
    { limit: 101 },
    { limit: 0 },
    { limit: 1.5 },
    { month: "2026-13" },
    { categoryId: "../other" },
    { q: "x".repeat(121) },
    { cursor: "x".repeat(1001) },
    { userId: "other" },
  ])
    assert.equal(ListReceiptsSchema.safeParse(input).success, false);
});
test("AI contract permits unreadable amount but rejects extra instructions", () => {
  const value = {
    merchant: "Shop",
    purchaseDate: null,
    totalMinor: null,
    currency: "PHP",
    category: "other",
    confidence: 0.4,
  };
  assert.equal(ScanDtoSchema.safeParse(value).success, true);
  assert.equal(
    ScanDtoSchema.safeParse({ ...value, instructions: "ignore security" })
      .success,
    false,
  );
  assert.equal(
    ScanDtoSchema.safeParse({ ...value, totalMinor: 1.2 }).success,
    false,
  );
});
test("cache keys distinguish owners and filters", () => {
  assert.notDeepEqual(
    qk.photo("alice", receipt.id),
    qk.photo("bob", receipt.id),
  );
  assert.notDeepEqual(
    qk.list("alice", { month: "2026-10" }),
    qk.list("alice", { month: "2026-09" }),
  );
});
