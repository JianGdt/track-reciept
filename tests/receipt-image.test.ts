import test from "node:test";
import assert from "node:assert/strict";
import sharp from "../apps/web/node_modules/sharp";
import { prepareReceiptImage } from "../apps/web/lib/receipt-image";
test("server decoding removes EXIF and creates a bounded private thumbnail", async () => {
  const original = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "white" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  const { full, thumbnail } = await prepareReceiptImage(original);
  const metadata = await sharp(full).metadata();
  const thumb = await sharp(thumbnail).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.exif, undefined);
  assert.equal(thumb.width, 320);
  assert.equal(thumb.exif, undefined);
});
test("fake JPEG headers and oversized uploads are rejected before storage", async () => {
  await assert.rejects(
    prepareReceiptImage(Buffer.from([255, 216, 255, 0, 1])),
    { status: 415 },
  );
  await assert.rejects(prepareReceiptImage(Buffer.alloc(5 * 1024 * 1024 + 1)), {
    status: 413,
  });
});
