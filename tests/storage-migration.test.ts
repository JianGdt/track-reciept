import test from "node:test";
import assert from "node:assert/strict";
import { migrateStorage } from "../apps/web/scripts/storage-migration";

function fixture(targetContent?: string) {
  const target = new Map<string, string>();
  const keys = ["receipts/owner/one.jpg", "receipts/owner/one.thumb.jpg"];
  if (targetContent !== undefined) target.set(keys[0], targetContent);
  const writes: any[] = [];
  const client = (source: boolean) => ({
    send: async (command: any) => {
      const { Key, ContinuationToken } = command.input;
      if (command.constructor.name === "ListObjectsV2Command") {
        assert.equal(command.input.Prefix, "receipts/");
        return {
          Contents: [{ Key: keys[ContinuationToken ? 1 : 0], Size: 5 }],
          IsTruncated: !ContinuationToken,
          NextContinuationToken: ContinuationToken ? undefined : "page2",
        };
      }
      if (command.constructor.name === "PutObjectCommand") {
        assert.equal(source, false);
        assert.equal(command.input.IfNoneMatch, "*");
        assert.deepEqual(command.input.Metadata, {
          receipt_sha256: "original",
        });
        writes.push(command.input);
        target.set(Key, command.input.Body.toString());
        return {};
      }
      assert.equal(command.constructor.name, "GetObjectCommand");
      const value = source ? "photo" : target.get(Key);
      if (value === undefined)
        throw Object.assign(new Error("missing"), {
          $metadata: { httpStatusCode: 404 },
        });
      return {
        ContentType: "image/jpeg",
        Metadata: { receipt_sha256: "original" },
        Body: {
          transformToWebStream: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(Buffer.from(value));
                controller.close();
              },
            }),
        },
      };
    },
  });
  return {
    source: { bucket: "old", client: client(true) as any },
    target: { bucket: "new", client: client(false) as any },
    writes,
  };
}

test("migration dry-run counts paginated originals and thumbnails without writes", async () => {
  const f = fixture();
  const result = await migrateStorage(f.source, f.target, "dry-run");
  assert.equal(result.objects, 2);
  assert.equal(result.bytes, 10);
  assert.equal(f.writes.length, 0);
});
test("migration preserves bytes, keys and metadata and verifies retry without writes", async () => {
  const f = fixture();
  const first = await migrateStorage(f.source, f.target, "copy");
  assert.equal(first.copied, 2);
  assert.equal(first.verified, 2);
  const retry = await migrateStorage(f.source, f.target, "copy");
  assert.equal(retry.copied, 0);
  assert.equal(retry.verified, 2);
  assert.equal(f.writes.length, 2);
});
test("migration reports differing bytes and missing files without overwriting", async () => {
  const f = fixture("other");
  const check = await migrateStorage(f.source, f.target, "verify");
  assert.equal(check.conflicts, 1);
  assert.equal(check.missing, 1);
  assert.equal(f.writes.length, 0);
  const copy = await migrateStorage(f.source, f.target, "copy");
  assert.equal(copy.conflicts, 1);
  assert.equal(copy.copied, 1);
});
