// Explicit opt-in only: creates synthetic accounts/receipts in the configured
// backend and deletes them in finally. Never scans with the paid AI provider.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
if (process.env.RUN_LIVE_CHECKS !== "1")
  throw new Error(
    "Set RUN_LIVE_CHECKS=1 to run against a configured dev server.",
  );
const base = process.env.TEST_API_URL || "http://localhost:3000";
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const sharp = require("sharp");
const users = [];
let checks = 0;
async function call(
  path,
  { user, method = "GET", body, raw, key, headers = {} } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: base,
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(60_000),
  });
  const result =
    response.status === 204 || response.status === 304
      ? null
      : response.headers.get("content-type")?.includes("json")
        ? await response.json()
        : await response.text();
  return { response, result };
}
async function expect(path, options, status) {
  const value = await call(path, options);
  assert.equal(
    value.response.status,
    status,
    `${options?.method ?? "GET"} ${path} expected ${status}, got ${value.response.status}; code=${value.result?.error?.code ?? "unknown"}`,
  );
  checks++;
  return value;
}
try {
  const anon = await expect("/api/v1/receipts", {}, 401);
  assert.equal(anon.result.error.code, "UNAUTHENTICATED");
  assert.equal(
    anon.result.error.requestId,
    anon.response.headers.get("x-request-id"),
  );
  for (let i = 0; i < 2; i++) {
    const password = randomUUID() + "Aa1!";
    const { response } = await expect(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        body: {
          name: "API test",
          email: `receipt-check-${randomUUID()}@example.com`,
          password,
        },
      },
      200,
    );
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.ok(cookie);
    users.push({ cookie, password });
  }
  const [alice, bob] = users;
  const category = randomUUID();
  const id = randomUUID();
  const fields = {
    id,
    merchant: "Synthetic receipt",
    purchaseDate: "2026-10-08",
    totalMinor: 1299,
    currency: "PHP",
    categoryId: null,
    paymentMethod: "Cash",
    notes: "Automated test fixture",
    hasPhoto: false,
  };
  const cats = await expect("/api/v1/categories", { user: alice }, 200);
  assert.equal(cats.result.data.length, 5);
  await expect(
    "/api/v1/categories",
    {
      user: alice,
      headers: { "If-None-Match": cats.response.headers.get("etag") },
    },
    304,
  );
  await expect(
    "/api/v1/categories",
    {
      user: alice,
      method: "POST",
      key: category,
      body: { id: category, name: "Test category", color: "#123456" },
    },
    201,
  );
  await expect(
    "/api/v1/receipts",
    {
      user: alice,
      method: "POST",
      key: id,
      body: { ...fields, userId: "other" },
    },
    422,
  );
  await expect(
    "/api/v1/receipts",
    {
      user: alice,
      method: "POST",
      key: id,
      body: { ...fields, totalMinor: 1.5 },
    },
    422,
  );
  await expect(
    "/api/v1/receipts",
    { user: alice, method: "POST", body: fields },
    422,
  );
  await expect(
    "/api/v1/receipts",
    { user: alice, method: "POST", key: id, body: fields },
    201,
  );
  await expect(
    "/api/v1/receipts",
    { user: alice, method: "POST", key: id, body: fields },
    201,
  );
  await expect(
    "/api/v1/receipts",
    {
      user: alice,
      method: "POST",
      key: id,
      body: { ...fields, notes: "Different" },
    },
    409,
  );
  await expect(`/api/v1/receipts/${id}`, { user: bob }, 404);
  await expect(`/api/v1/receipts/${id}/photo?format=json`, { user: bob }, 404);
  await expect(
    `/api/v1/receipts/${id}`,
    { user: alice, method: "PATCH", body: { categoryId: category } },
    200,
  );
  await expect(
    `/api/v1/categories/${category}`,
    { user: alice, method: "DELETE" },
    409,
  );
  await expect("/api/v1/receipts?limit=101", { user: alice }, 422);
  await expect("/api/v1/receipts?cursor=garbage", { user: alice }, 400);
  await expect("/api/v1/receipts?limit=1&limit=2", { user: alice }, 400);
  const first = await expect("/api/v1/receipts?limit=1", { user: alice }, 200);
  assert.equal(first.result.data[0].totalMinor, 1299);
  assert.equal(first.result.data[0].notes, fields.notes);
  assert.equal(first.result.data[0].userId, undefined);
  assert.equal(first.result.page.nextCursor, null);
  const photoId = randomUUID();
  await expect(
    `/api/v1/receipts/${photoId}/photo`,
    {
      user: alice,
      method: "PUT",
      raw: new Uint8Array([255, 216, 255, 0]),
      headers: { "Content-Type": "image/jpeg" },
    },
    415,
  );
  const image = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  await expect(
    `/api/v1/receipts/${photoId}/photo`,
    {
      user: alice,
      method: "PUT",
      raw: image,
      headers: { "Content-Type": "image/jpeg" },
    },
    204,
  );
  await expect(
    `/api/v1/receipts/${photoId}/photo`,
    {
      user: alice,
      method: "PUT",
      raw: image,
      headers: { "Content-Type": "image/jpeg" },
    },
    204,
  );
  await expect(
    "/api/v1/receipts",
    {
      user: alice,
      method: "POST",
      key: photoId,
      body: { ...fields, id: photoId, hasPhoto: true },
    },
    201,
  );
  const photo = await expect(
    `/api/v1/receipts/${photoId}/photo?format=json&variant=thumbnail`,
    { user: alice },
    200,
  );
  assert.ok(photo.result.url.startsWith("https://"));
  const signed = await fetch(photo.result.url, {
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(signed.status, 200);
  await signed.arrayBuffer();
  checks++;
  const unsigned = await fetch(photo.result.url.split("?")[0], {
    signal: AbortSignal.timeout(20_000),
  });
  assert.ok([401, 403].includes(unsigned.status));
  await unsigned.arrayBuffer();
  checks++;
  const page = await expect("/api/v1/receipts?limit=1", { user: alice }, 200);
  assert.ok(page.result.page.nextCursor);
  const next = await expect(
    `/api/v1/receipts?limit=1&cursor=${encodeURIComponent(page.result.page.nextCursor)}`,
    { user: alice },
    200,
  );
  assert.notEqual(page.result.data[0].id, next.result.data[0].id);
  await expect(
    `/api/v1/receipts?limit=1&cursor=${encodeURIComponent(page.result.page.nextCursor)}`,
    { user: bob },
    400,
  );
  const report = await expect(
    "/api/v1/reports/monthly?month=2026-10&currency=PHP",
    { user: alice },
    200,
  );
  assert.equal(report.result.totalMinor, 2598);
  assert.equal(report.result.count, 2);
  const exported = await expect(
    "/api/v1/exports/receipts?month=2026-10",
    { user: alice },
    200,
  );
  assert.equal(exported.result.split("\r\n").length, 3);
  await expect(
    `/api/v1/receipts/${photoId}`,
    { user: alice, method: "DELETE" },
    204,
  );
  await expect(
    `/api/v1/receipts/${photoId}`,
    { user: alice, method: "DELETE" },
    204,
  );
  await expect(
    `/api/v1/receipts/${photoId}/photo?format=json`,
    { user: alice },
    404,
  );
  await expect(
    `/api/v1/receipts/${id}`,
    { user: alice, method: "DELETE" },
    204,
  );
  await expect(
    `/api/v1/categories/${category}`,
    { user: alice, method: "DELETE" },
    204,
  );
  await expect(
    "/api/v1/receipts/scan",
    { user: alice, method: "POST", key: id, body: { receiptId: id } },
    404,
  );
  console.log(`Passed ${checks} live HTTP checks (no AI calls).`);
} finally {
  const cleanup = await Promise.allSettled(
    users.map(async (user) => {
      await expect(
        "/api/auth/delete-user",
        { user, method: "POST", body: { password: user.password } },
        200,
      );
      await expect("/api/v1/receipts", { user }, 401);
    }),
  );
  if (cleanup.some((result) => result.status === "rejected"))
    throw new Error(
      "A synthetic account cleanup failed; retry cleanup before continuing.",
    );
  console.log("Synthetic test accounts and their receipt/photo data removed.");
}
