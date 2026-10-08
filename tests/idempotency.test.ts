import test from "node:test";
import assert from "node:assert/strict";
import { once, type Claim, type ClaimStore } from "../lib/idempotency";
import { ServiceError } from "../lib/service-error";
function memory<T>(): ClaimStore<T> {
  const claims = new Map<string, Claim<T>>();
  return {
    async claim(key, fingerprint, now) {
      const old = claims.get(key);
      if (old && old.expiresAt > now) return old;
      claims.set(key, {
        state: "pending",
        fingerprint,
        expiresAt: now + 180_000,
      });
      return null;
    },
    async finish(key, value) {
      claims.set(key, value);
    },
  };
}
test("concurrent scans invoke the provider once; completed retries replay the result", async () => {
  const store = memory<{ totalMinor: number }>();
  let calls = 0;
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const action = async () => {
    calls++;
    await gate;
    return { totalMinor: 1234 };
  };
  const first = once(store, "scan-id", "image", action);
  await assert.rejects(
    once(store, "scan-id", "image", action),
    (error) =>
      error instanceof ServiceError && error.code === "REQUEST_IN_PROGRESS",
  );
  complete();
  assert.deepEqual(await first, { totalMinor: 1234 });
  assert.deepEqual(await once(store, "scan-id", "image", action), {
    totalMinor: 1234,
  });
  assert.equal(calls, 1);
  await assert.rejects(
    once(store, "scan-id", "changed-image", action),
    (error) =>
      error instanceof ServiceError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});
test("failed scans are briefly replayed with retry timing and no duplicate charge", async () => {
  const store = memory<number>();
  let calls = 0;
  const action = async () => {
    calls++;
    throw new ServiceError(504, "Timed out.", "UPSTREAM_TIMEOUT");
  };
  await assert.rejects(once(store, "scan-id", "image", action), {
    status: 504,
  });
  await assert.rejects(
    once(store, "scan-id", "image", action),
    (error) =>
      error instanceof ServiceError &&
      error.status === 504 &&
      !!error.retryAfter,
  );
  assert.equal(calls, 1);
});
