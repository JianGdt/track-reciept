import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../app/manifest";

function worker(offline: boolean) {
  const handlers: Record<string, (event: any) => void> = {};
  const writes: string[] = [];
  const fallback = new Response("Offline screen");
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    Response,
    self: {
      location: { origin: "https://vault.test" },
      clients: { claim: async () => {} },
      addEventListener: (type: string, handler: (event: any) => void) => {
        handlers[type] = handler;
      },
    },
    caches: {
      open: async () => ({
        add: async (url: string) => {
          writes.push(url);
        },
      }),
      keys: async () => [],
      match: async () => fallback,
    },
    fetch: async () => {
      if (offline) throw new Error("offline");
      return new Response("Live page");
    },
  });
  return { handlers, writes, fallback };
}

test("PWA caches only the generic offline page and never intercepts API or image requests", async () => {
  const w = worker(true);
  let install: Promise<unknown> | undefined;
  w.handlers.install({
    waitUntil: (p: Promise<unknown>) => {
      install = p;
    },
  });
  await install;
  assert.deepEqual(w.writes, ["/offline.html"]);
  for (const [url, mode, method] of [
    ["https://vault.test/api/auth/get-session", "navigate", "GET"],
    ["https://vault.test/api/v1/receipts", "cors", "POST"],
    ["https://storage.test/private.jpg", "no-cors", "GET"],
  ]) {
    w.handlers.fetch({
      request: { url, mode, method },
      respondWith: () => assert.fail("Private request intercepted"),
    });
  }
});

test("PWA navigation uses live responses and falls back only on network failure", async () => {
  for (const offline of [true, false]) {
    const w = worker(offline);
    let response: Promise<Response> | undefined;
    w.handlers.fetch({
      request: { url: "https://vault.test/", mode: "navigate", method: "GET" },
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    });
    assert.equal(
      await (await response)!.text(),
      offline ? "Offline screen" : "Live page",
    );
    assert.deepEqual(w.writes, []);
  }
});

test("PWA manifest uses standalone display and real square PNG icons", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  for (const icon of m.icons ?? []) {
    const file = readFileSync(`public${icon.src}`);
    const size = Number(icon.sizes!.split("x")[0]);
    assert.equal(file.readUInt32BE(16), size);
    assert.equal(file.readUInt32BE(20), size);
  }
});
