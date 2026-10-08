import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { S3Receipts, photoStorageError } from "../apps/web/lib/s3-receipts";

type Command = { constructor: { name: string }; input: Record<string, any> };
function store(send: (command: Command) => Promise<any>) {
  return new S3Receipts(
    { send } as unknown as ConstructorParameters<typeof S3Receipts>[0],
    "private-receipts",
  );
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const key = "receipts/user/receipt.jpg";
const missing = () =>
  Object.assign(new Error("missing"), {
    name: "NotFound",
    $metadata: { httpStatusCode: 404 },
  });

test("S3 upload retries are idempotent and different content cannot overwrite a receipt", async () => {
  let metadata: any;
  let writes = 0;
  const s = store(async (command) => {
    assert.equal(command.input.Bucket, "private-receipts");
    assert.equal(command.input.Key, key);
    if (command.constructor.name === "HeadObjectCommand") {
      if (!metadata) throw missing();
      return { Metadata: metadata };
    }
    assert.equal(command.input.IfNoneMatch, "*");
    assert.equal(command.input.ContentType, "image/jpeg");
    assert.equal(command.input.ACL, undefined);
    metadata = command.input.Metadata;
    writes++;
    return {};
  });
  await s.upload(key, jpeg);
  await s.upload(key, jpeg);
  await assert.rejects(s.upload(key, Buffer.concat([jpeg, Buffer.from([3])])), {
    status: 409,
  });
  assert.equal(writes, 1);
});

test("concurrent S3 uploads compare the winning object's hash after conditional failure", async () => {
  let reads = 0;
  const hash = createHash("sha256").update(jpeg).digest("hex");
  const s = store(async (command) => {
    if (command.constructor.name === "HeadObjectCommand") {
      if (++reads === 1) throw missing();
      return { Metadata: { receipt_sha256: hash } };
    }
    throw { $metadata: { httpStatusCode: 412 } };
  });
  await s.upload(key, jpeg);
  assert.equal(reads, 2);
});

test("invalid or oversized uploads never reach S3", async () => {
  const s = store(async () => {
    assert.fail("must not send invalid files");
  });
  await assert.rejects(s.upload(key, Buffer.from("not an image")), {
    status: 415,
  });
  await assert.rejects(s.upload(key, Buffer.alloc(5 * 1024 * 1024 + 1)), {
    status: 413,
  });
});

test("scan downloads validate actual stream size even when metadata understates it", async () => {
  let cancelled = false;
  const s = store(async () => ({
    ContentType: "image/jpeg",
    ContentLength: 4,
    Body: {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
    },
  }));
  await assert.rejects(s.download(key), { status: 413 });
  assert.equal(cancelled, true);
});

test("scan downloads validate content type and JPEG signature", async () => {
  for (const [type, bytes] of [
    ["text/plain", jpeg],
    ["image/jpeg", Buffer.from("wrong")],
  ] as const) {
    const s = store(async () => ({
      ContentType: type,
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
      },
    }));
    await assert.rejects(s.download(key), { status: 415 });
  }
});

test("storage errors never expose provider credentials or raw messages", () => {
  const safe = photoStorageError(
    Object.assign(new Error("secret-provider-details"), {
      $metadata: { httpStatusCode: 403 },
    }),
  );
  assert.equal(safe.status, 503);
  assert.doesNotMatch(safe.message, /secret-provider-details/);
});
