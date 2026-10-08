// Explicit opt-in, synthetic owner only. Uses the configured Firestore server
// credentials and removes all documents it creates. Does not invoke AI or S3.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  claimStore,
  userCollection,
  rateLimit,
  listReceipts,
  saveReceipt,
} from "../apps/web/lib/receipt-repository";
import { once } from "../apps/web/lib/idempotency";
import { ServiceError } from "../apps/web/lib/service-error";

async function main() {
  if (process.env.RUN_LIVE_CHECKS !== "1")
    throw new Error("Set RUN_LIVE_CHECKS=1 to run.");
  const uid = `test-${randomUUID()}`;
  const id = randomUUID();
  try {
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let calls = 0;
    const action = async () => {
      calls++;
      started();
      await gate;
      return { totalMinor: 123 };
    };
    const first = once(claimStore(uid), "scan-test", "same-image", action);
    await ready;
    try {
      await assert.rejects(
        once(claimStore(uid), "scan-test", "same-image", action),
        (error) =>
          error instanceof ServiceError && error.code === "REQUEST_IN_PROGRESS",
      );
    } finally {
      finish();
    }
    assert.deepEqual(await first, { totalMinor: 123 });
    assert.deepEqual(
      await once(claimStore(uid), "scan-test", "same-image", action),
      { totalMinor: 123 },
    );
    assert.equal(calls, 1);
    await rateLimit(uid, "test-rate", 2, 600_000);
    await rateLimit(uid, "test-rate", 2, 600_000);
    await assert.rejects(
      rateLimit(uid, "test-rate", 2, 600_000),
      (error) =>
        error instanceof ServiceError &&
        error.status === 429 &&
        !!error.retryAfter,
    );
    await userCollection(uid, "receipts").doc(id).set({
      id,
      user_id: uid,
      merchant: "Legacy receipt",
      purchase_date: "2026-10-08",
      total_amount: 1.01,
      currency: "PHP",
      category_id: null,
      payment_method: "Cash",
      notes: "Existing receipt",
      image_path: null,
      scan_status: "manual",
      scan_raw: null,
      created_at: "2026-10-08T00:00:00Z",
      updated_at: "2026-10-08T00:00:00Z",
    });
    const rows = await listReceipts(uid, {}, 20);
    assert.equal(rows.data[0].totalMinor, 101);
    await saveReceipt(uid, id, { notes: "Updated through new service" }, true);
    const updated = await userCollection(uid, "receipts").doc(id).get();
    assert.equal(updated.get("totalMinor"), 101);
    assert.equal(updated.get("total_amount"), undefined);
    assert.equal(updated.get("purchase_date"), "2026-10-08");
    assert.equal(
      updated.get("createdAt").toDate().toISOString(),
      "2026-10-08T00:00:00.000Z",
    );
    assert.equal(
      updated.get("purchaseDate").toDate().toISOString().slice(0, 10),
      "2026-10-08",
    );
    console.log(
      "Firestore checks passed: concurrent scan claims, result replay, shared rate limits, legacy money read/update.",
    );
  } finally {
    for (const collection of ["receipts", "drafts", "requests", "limits"]) {
      const docs = await userCollection(uid, collection).limit(20).get();
      await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
    }
    console.log("Synthetic Firestore test documents removed.");
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Firestore check failed",
  );
  process.exitCode = 1;
});
