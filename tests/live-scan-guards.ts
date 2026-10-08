// Opt-in: isolated synthetic owner, budget and control documents. No AI calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { firebaseAdmin } from "../lib/firebase-admin";
import { acquireScanLease, reserveScan, scanUsage } from "../lib/scan-guard";
import { LIMITS, utcQuotaWindow } from "../lib/limits";
import { ServiceError } from "../lib/service-error";

async function main() {
  if (process.env.RUN_LIVE_CHECKS !== "1")
    throw new Error("Explicit RUN_LIVE_CHECKS=1 is required.");
  const uid = `test-${randomUUID()}`;
  const scope = `-${uid}`;
  const db = firebaseAdmin().db;
  const { day } = utcQuotaWindow();
  const user = db.collection("users").doc(uid);
  const auth = db.collection("authUsers").doc(uid);
  const budget = db.collection("_scanBudgets").doc(`${day}${scope}`);
  const control = db.collection("_controls").doc(`scan${scope}`);
  const rejects = (promise: Promise<unknown>, code: string) =>
    assert.rejects(
      promise,
      (error: unknown) => error instanceof ServiceError && error.code === code,
    );
  try {
    await user.set({ testing: true });
    await auth.set({
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    const release = await acquireScanLease(uid);
    await rejects(acquireScanLease(uid), "SCAN_IN_PROGRESS");
    await release();
    const nextRelease = await acquireScanLease(uid);
    await release(); // Stale owner cannot remove the new lock.
    await rejects(acquireScanLease(uid), "SCAN_IN_PROGRESS");
    await nextRelease();
    const refund = await reserveScan(uid, scope);
    await refund();
    await refund();
    assert.equal((await scanUsage(uid)).used, 0);
    assert.equal((await budget.get()).get("count"), 1); // Costs are not refunded.
    for (let i = 0; i < LIMITS.scanPerDay; i++) await reserveScan(uid, scope);
    await rejects(reserveScan(uid, scope), "DAILY_QUOTA_EXCEEDED");
    assert.equal((await scanUsage(uid)).used, 30);
    await control.set({ disabled: true });
    await rejects(reserveScan(uid, scope), "SCAN_PAUSED");
    await control.delete();
    await user.collection("limits").doc(`quota-${day}`).set({ count: 0 });
    await budget.set({ count: LIMITS.globalScansPerDay });
    await rejects(reserveScan(uid, scope), "DAILY_BUDGET_REACHED");
    assert.equal((await scanUsage(uid)).used, 0); // Budget rejection spends no quota.
    await auth.set({ createdAt: new Date().toISOString() });
    assert.equal((await scanUsage(uid)).limit, 10);
    console.log(
      "Passed: concurrent/stale locks, idempotent refunds, daily quota, global budget, kill switch and new-account allowance.",
    );
  } finally {
    const docs = await user.collection("limits").limit(100).get();
    await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
    await Promise.all([
      user.delete(),
      auth.delete(),
      budget.delete(),
      control.delete(),
    ]);
    console.log("Removed synthetic guard test records.");
  }
}
main().catch(() => {
  console.error(
    "Scan guard checks failed; inspect configuration or assertions locally.",
  );
  process.exitCode = 1;
});
