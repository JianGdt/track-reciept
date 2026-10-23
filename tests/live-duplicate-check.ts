// Opt-in integration test. Only creates and removes synthetic owner data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { firebaseAdmin } from "../lib/firebase-admin";
import {
  saveReceipt,
  userCollection,
  assertReceiptNotDuplicate,
} from "../lib/receipt-repository";
import { receiptPhotoKey } from "../lib/receipt-duplicates";

async function main() {
  if (process.env.RUN_LIVE_CHECKS !== "1")
    throw new Error("Set RUN_LIVE_CHECKS=1");
  const uid = `test-duplicate-${randomUUID()}`;
  const ids = [randomUUID(), randomUUID()];
  const key = receiptPhotoKey(Buffer.from("synthetic duplicate image"));
  const fields = {
    merchant: "Synthetic test",
    purchaseDate: "2026-10-24",
    totalMinor: 100,
    currency: "PHP" as const,
    categoryId: null,
    paymentMethod: "",
    notes: "",
    hasPhoto: true,
  };
  try {
    await Promise.all(
      ids.map((id) =>
        userCollection(uid, "drafts")
          .doc(id)
          .set({ uploaded: true, duplicateKeys: [key] }),
      ),
    );
    const attempts = await Promise.allSettled(
      ids.map((id) => saveReceipt(uid, id, { id, ...fields }, false)),
    );
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = attempts.find((r) => r.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal(rejected.reason.code, "DUPLICATE_RECEIPT");
    const winner = attempts.findIndex((r) => r.status === "fulfilled");
    const savedId = ids[winner]!;
    await saveReceipt(uid, savedId, { id: savedId, ...fields }, false); // Idempotent replay.
    await saveReceipt(uid, savedId, { notes: "Edited" }, true); // Editing itself works.
    await assertReceiptNotDuplicate(`${uid}-other-owner`, randomUUID(), [key]);
    const rows = await userCollection(uid, "receipts").get();
    assert.equal(rows.size, 1);
    await rows.docs[0]!.ref.delete();
    await assertReceiptNotDuplicate(uid, randomUUID(), [key]);
    console.log(
      "Passed: concurrent duplicate blocked, replay/edit allowed, owner isolation, deleted receipt can be added again.",
    );
  } finally {
    for (const collection of ["receipts", "drafts"]) {
      const rows = await userCollection(uid, collection).get();
      await Promise.all(rows.docs.map((doc) => doc.ref.delete()));
    }
    await firebaseAdmin().db.collection("users").doc(uid).delete();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Duplicate check failed",
  );
  process.exitCode = 1;
});
