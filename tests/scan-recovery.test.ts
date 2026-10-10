import test from "node:test";
import assert from "node:assert/strict";
import {
  recoverScan,
  canRecoverScan,
  scanDelay,
  type ScanProgress,
} from "../lib/scan-recovery";
import { VaultError } from "../lib/vault-client";

const result = {
  merchant: "Store",
  purchaseDate: null,
  totalMinor: 1234,
  currency: "PHP" as const,
  category: "other" as const,
  confidence: 0.9,
};
const timeout = () =>
  new VaultError("Timed out", 504, "SCAN_TIMEOUT", undefined, 30);
const options = () => ({
  signal: new AbortController().signal,
  onProgress: (_: ScanProgress) => {},
  fromResult: (value: typeof result) => value,
});

test("a lost response recovers the saved result without another provider request", async () => {
  let calls = 0;
  const value = await recoverScan({
    ...options(),
    run: async () => {
      calls++;
      throw timeout();
    },
    readState: async () => ({ state: "done", result }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(value, result);
});
test("a temporary failure waits for the server cooldown and retries just once", async () => {
  let calls = 0;
  const waits: number[] = [];
  const stages: string[] = [];
  const value = await recoverScan({
    ...options(),
    run: async () => {
      if (++calls === 1) throw timeout();
      return result;
    },
    readState: async () => ({
      state: "failed",
      retryAfter: 35,
      retryable: true,
    }),
    wait: async (ms) => {
      waits.push(ms);
    },
    onProgress: (p) => {
      stages.push(p.stage);
    },
  });
  assert.deepEqual(value, result);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [35250]);
  assert.deepEqual(stages, ["scanning", "waiting", "waiting", "retrying"]);
});
test("a second failure is surfaced and does not create a retry loop", async () => {
  let calls = 0;
  await assert.rejects(
    recoverScan({
      ...options(),
      run: async () => {
        calls++;
        throw timeout();
      },
      readState: async () => ({ state: "idle" }),
      wait: async () => {},
    }),
  );
  assert.equal(calls, 2);
});
test("pending work is polled until complete without starting another scan", async () => {
  let reads = 0;
  let calls = 0;
  await recoverScan({
    ...options(),
    run: async () => {
      calls++;
      throw new VaultError(
        "Running",
        409,
        "REQUEST_IN_PROGRESS",
        undefined,
        180,
      );
    },
    readState: async () =>
      ++reads < 3 ? { state: "pending" } : { state: "done", result },
    wait: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(reads, 3);
});
test("abandoned pending jobs have bounded polling and never overlap a new scan", async () => {
  let calls = 0;
  let reads = 0;
  await assert.rejects(
    recoverScan({
      ...options(),
      run: async () => {
        calls++;
        throw timeout();
      },
      readState: async () => {
        reads++;
        return { state: "pending" };
      },
      wait: async () => {},
    }),
  );
  assert.equal(calls, 1);
  assert.equal(reads, 40);
});
test("quota, configuration, and validation errors never retry automatically", async () => {
  for (const [status, code] of [
    [429, "DAILY_QUOTA_EXCEEDED"],
    [503, "SCAN_CONFIG_REJECTED"],
    [503, "DAILY_BUDGET_REACHED"],
    [422, "SCAN_BLOCKED"],
    [401, "UNAUTHENTICATED"],
  ] as const) {
    const error = new VaultError("Stop", status, code);
    assert.equal(canRecoverScan(error), false);
    await assert.rejects(
      recoverScan({
        ...options(),
        run: async () => {
          throw error;
        },
        readState: async () => {
          assert.fail("must not poll");
        },
      }),
      { code },
    );
  }
});
test("closing the form during recovery prevents a second scan", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    recoverScan({
      ...options(),
      signal: controller.signal,
      run: async () => {
        calls++;
        throw timeout();
      },
      readState: async () => ({
        state: "failed",
        retryAfter: 30,
        retryable: true,
      }),
      wait: async () => {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
test("retry waits can be cancelled immediately", async () => {
  const controller = new AbortController();
  const delay = scanDelay(30_000, controller.signal);
  controller.abort();
  await assert.rejects(delay, { name: "AbortError" });
});

test("a pending scan that later fails permanently is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    recoverScan({
      ...options(),
      run: async () => {
        calls++;
        throw timeout();
      },
      readState: async () => ({
        state: "failed",
        retryAfter: 30,
        retryable: false,
      }),
      wait: async () => {
        assert.fail("must not wait");
      },
    }),
  );
  assert.equal(calls, 1);
});
