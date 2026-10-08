import test from "node:test";
import assert from "node:assert/strict";
import {
  createVaultClient,
  VaultError,
  type AuthPort,
} from "../packages/firebase/src";
const auth = (): AuthPort => ({
  getSession: async () => ({ data: { user: { id: "alice", email: null } } }),
  signIn: { email: async () => ({ error: null }) },
  signUp: { email: async () => ({ error: null }) },
  signOut: async () => ({ error: null }),
});
test("Strict Mode subscriptions share one session request and cache the result", async () => {
  let calls = 0;
  const port = auth();
  port.getSession = async () => {
    calls++;
    return { data: { user: { id: "alice", email: null } } };
  };
  const client = createVaultClient(port);
  const first = client.auth.watch(() => {});
  first();
  const second = client.auth.watch(() => {});
  await client.auth.refresh();
  await client.auth.refresh();
  second();
  assert.equal(calls, 1);
});
test("double scan actions share a promise and send an idempotency key", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "/api/v1/receipts/scan");
    assert.equal(
      (init.headers as Record<string, string>)["Idempotency-Key"],
      "ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1",
    );
    assert.deepEqual(JSON.parse(init.body as string), {
      receiptId: "ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1",
    });
    return Response.json({
      merchant: "Shop",
      purchaseDate: null,
      totalMinor: 123,
      currency: "PHP",
      category: "other",
      confidence: 0.8,
    });
  });
  const client = createVaultClient(auth());
  const a = client.scan("ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1");
  const b = client.scan("ce2cc9dd-e6c1-4c8c-b2c3-33c14d02fed1");
  assert.equal(a, b);
  await a;
  assert.equal(calls, 1);
});
test("204 deletes succeed; structured errors retain safe message and request ID", async (t) => {
  const client = createVaultClient(auth());
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 204 }),
  );
  await client.deleteReceipt("id");
  mock.mock.mockImplementation(async () =>
    Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Try later.",
          requestId: "req-123",
        },
      },
      { status: 429, headers: { "Retry-After": "60" } },
    ),
  );
  await assert.rejects(
    client.deleteReceipt("id"),
    (error) =>
      error instanceof VaultError &&
      error.message === "Try later." &&
      error.requestId === "req-123" &&
      error.retryAfter === 60,
  );
});
