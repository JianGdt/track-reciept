import "server-only";
import { randomUUID, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { Timestamp } from "firebase-admin/firestore";
import { firebaseAdmin } from "./firebase-admin";
import { requireActiveAccount, userCollection } from "./receipt-repository";
import { ServiceError } from "./service-error";
import { LIMITS, utcQuotaWindow } from "./limits";

const unavailable = () =>
  new ServiceError(
    503,
    "This service is temporarily unavailable. Please try again shortly.",
    "TEMPORARILY_UNAVAILABLE",
    60,
  );
const count = (value: unknown) => {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw unavailable();
  return Number(value);
};
export async function guardStore<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw unavailable();
  }
}

// Only trust the platform-provided IP in Vercel. Local development has no IP gate.
export async function enforceIp(request: Request, kind: "scan" | "auth") {
  if (process.env.VERCEL !== "1") return;
  const ip = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (!ip || !isIP(ip) || !process.env.BETTER_AUTH_SECRET) throw unavailable();
  const identity = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
    .update(ip)
    .digest("hex");
  const limit = kind === "auth" ? LIMITS.authPerMinute : LIMITS.scanIpPerMinute;
  await guardStore(() =>
    firebaseAdmin().db.runTransaction(async (tx) => {
      const ref = firebaseAdmin()
        .db.collection("_ipLimits")
        .doc(`${kind}-${identity}`);
      const previous = await tx.get(ref);
      const now = Date.now();
      const start = Number(previous.get("start") ?? now);
      const expired = start + 60_000 <= now;
      const used = expired ? 0 : count(previous.get("count"));
      if (!Number.isFinite(start)) throw unavailable();
      if (used >= limit)
        throw new ServiceError(
          429,
          "Too many attempts. Try again shortly.",
          "RATE_LIMITED",
          Math.max(1, Math.ceil((start + 60_000 - now) / 1000)),
        );
      tx.set(ref, {
        start: expired ? now : start,
        count: used + 1,
        deleteAfter: Timestamp.fromMillis(now + 3_600_000),
      });
    }),
  );
}

export async function scanUsage(uid: string) {
  return guardStore(async () => {
    const { day, reset } = utcQuotaWindow();
    const [auth, quota] = await Promise.all([
      firebaseAdmin().db.collection("authUsers").doc(uid).get(),
      userCollection(uid, "limits").doc(`quota-${day}`).get(),
    ]);
    const created = auth.get("createdAt");
    const date =
      created instanceof Timestamp
        ? created.toMillis()
        : new Date(created ?? Date.now()).getTime();
    const limit =
      !Number.isFinite(date) || Date.now() - date < 86_400_000
        ? LIMITS.newAccountScanPerDay
        : LIMITS.scanPerDay;
    return {
      used: count(quota.get("count")),
      limit,
      resetsAt: new Date(reset).toISOString(),
    };
  });
}

// A per-user lease protects different receipt IDs, not only identical retries.
export async function acquireScanLease(uid: string) {
  const token = randomUUID();
  const ref = userCollection(uid, "limits").doc("scan-lock");
  await guardStore(() =>
    firebaseAdmin().db.runTransaction(async (tx) => {
      await requireActiveAccount(tx, uid);
      const doc = await tx.get(ref);
      const now = Date.now();
      if (Number(doc.get("expiresAt") ?? 0) > now)
        throw new ServiceError(
          409,
          "Another scan is running. Wait for it to finish.",
          "SCAN_IN_PROGRESS",
          10,
        );
      tx.set(ref, { token, expiresAt: now + LIMITS.scanLeaseMs });
    }),
  );
  return async () => {
    await guardStore(() =>
      firebaseAdmin().db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        // Never release a newer worker's lease after expiration.
        if (current.get("token") === token) tx.delete(ref);
      }),
    );
  };
}

// Reserve user and global allowance together. Global attempts are never refunded:
// a timeout may still have been billed by the provider.
export async function reserveScan(uid: string, testScope = "") {
  const { day, reset, retryAfter } = utcQuotaWindow();
  const reservation = randomUUID();
  const quotaRef = userCollection(uid, "limits").doc(`quota-${day}`);
  const ticketRef = userCollection(uid, "limits").doc(
    `reservation-${reservation}`,
  );
  await guardStore(() =>
    firebaseAdmin().db.runTransaction(async (tx) => {
      await requireActiveAccount(tx, uid);
      const db = firebaseAdmin().db;
      const budgetRef = db.collection("_scanBudgets").doc(`${day}${testScope}`);
      const [quota, budget, control, auth] = await Promise.all([
        tx.get(quotaRef),
        tx.get(budgetRef),
        tx.get(db.collection("_controls").doc(`scan${testScope}`)),
        tx.get(db.collection("authUsers").doc(uid)),
      ]);
      if (
        process.env.SCAN_ENABLED === "false" ||
        control.get("disabled") === true
      )
        throw new ServiceError(
          503,
          "Scanning is paused. Enter details manually.",
          "SCAN_PAUSED",
          60,
        );
      const created = auth.get("createdAt");
      const since =
        created instanceof Timestamp
          ? created.toMillis()
          : new Date(created ?? Date.now()).getTime();
      const limit =
        !Number.isFinite(since) || Date.now() - since < 86_400_000
          ? LIMITS.newAccountScanPerDay
          : LIMITS.scanPerDay;
      const used = count(quota.get("count"));
      const attempts = count(quota.get("attempts"));
      const attemptLimit =
        !Number.isFinite(since) || Date.now() - since < 86_400_000
          ? LIMITS.newAccountScanAttemptsPerDay
          : LIMITS.scanAttemptsPerDay;
      if (attempts >= attemptLimit)
        throw new ServiceError(
          429,
          "Today's scan attempt limit has been reached. Your photo can still be saved with manually entered details. Try scanning again tomorrow.",
          "DAILY_SCAN_ATTEMPTS_EXCEEDED",
          retryAfter,
        );
      if (used >= limit)
        throw new ServiceError(
          429,
          "Daily scan allowance reached. Enter manually or try again tomorrow.",
          "DAILY_QUOTA_EXCEEDED",
          retryAfter,
        );
      const globalUsed = count(budget.get("count"));
      if (globalUsed >= LIMITS.globalScansPerDay)
        throw new ServiceError(
          503,
          "Today's scanning capacity has been reached. You can still enter receipts manually.",
          "DAILY_BUDGET_REACHED",
          retryAfter,
        );
      const deleteAfter = Timestamp.fromMillis(reset + 86_400_000);
      // Refunding a failed scan never restores this abuse-prevention counter.
      tx.set(quotaRef, {
        count: used + 1,
        attempts: attempts + 1,
        deleteAfter,
      });
      tx.set(budgetRef, { count: globalUsed + 1, deleteAfter });
      tx.set(ticketRef, { day, refunded: false, deleteAfter });
    }),
  );
  return async () => {
    await guardStore(() =>
      firebaseAdmin().db.runTransaction(async (tx) => {
        const [ticket, quota] = await Promise.all([
          tx.get(ticketRef),
          tx.get(quotaRef),
        ]);
        if (!ticket.exists || ticket.get("refunded") || !quota.exists) return;
        tx.update(quotaRef, {
          count: Math.max(0, count(quota.get("count")) - 1),
        });
        tx.update(ticketRef, { refunded: true });
      }),
    );
  };
}
