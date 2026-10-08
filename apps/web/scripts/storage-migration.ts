import { createHash } from "node:crypto";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

type Store = { client: S3Client; bucket: string };
export type MigrationMode = "dry-run" | "copy" | "verify";
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function read(store: Store, key: string) {
  const result = await store.client.send(
    new GetObjectCommand({ Bucket: store.bucket, Key: key }),
  );
  if (!result.Body) throw new Error("Object body missing");
  // Receipt originals and thumbnails are bounded; never buffer arbitrary bucket data.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = result.Body.transformToWebStream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20 * 1024 * 1024)
        throw new Error("Object exceeds migration limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return { bytes: Buffer.concat(chunks), result };
}

// Never deletes or overwrites objects. Preserve original keys, bytes and metadata.
export async function migrateStorage(
  source: Store,
  target: Store,
  mode: MigrationMode,
) {
  const summary = {
    objects: 0,
    bytes: 0,
    copied: 0,
    verified: 0,
    missing: 0,
    conflicts: 0,
  };
  let cursor: string | undefined;
  do {
    const page = await source.client.send(
      new ListObjectsV2Command({
        Bucket: source.bucket,
        Prefix: "receipts/",
        MaxKeys: 100,
        ContinuationToken: cursor,
      }),
    );
    for (const object of page.Contents ?? []) {
      const key = object.Key;
      if (!key?.startsWith("receipts/"))
        throw new Error("Unexpected object key");
      summary.objects++;
      summary.bytes += object.Size ?? 0;
      if (mode === "dry-run") continue;
      const original = await read(source, key);
      let destination;
      try {
        destination = await read(target, key);
      } catch (error) {
        const missing = error as {
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (
          missing.$metadata?.httpStatusCode !== 404 ||
          missing.name === "NoSuchBucket"
        )
          throw error;
      }
      if (!destination && mode === "copy") {
        try {
          await target.client.send(
            new PutObjectCommand({
              Bucket: target.bucket,
              Key: key,
              Body: original.bytes,
              ContentType: original.result.ContentType,
              CacheControl: original.result.CacheControl,
              ContentDisposition: original.result.ContentDisposition,
              ContentEncoding: original.result.ContentEncoding,
              Metadata: original.result.Metadata,
              IfNoneMatch: "*",
            }),
          );
          summary.copied++;
        } catch (error) {
          if (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode !== 412
          )
            throw error;
        }
        destination = await read(target, key);
      }
      if (!destination) summary.missing++;
      else if (digest(original.bytes) !== digest(destination.bytes))
        summary.conflicts++;
      else summary.verified++;
    }
    const next = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!next || next === cursor))
      throw new Error("Invalid storage pagination");
    cursor = next;
  } while (cursor);
  return summary;
}
