import { createHash } from "node:crypto";
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class PhotoStorageError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const maxBytes = 5 * 1024 * 1024;
function status(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}
export function photoStorageError(error: unknown) {
  if (error instanceof PhotoStorageError) return error;
  if ((error as { name?: string })?.name === "NoSuchBucket")
    return new PhotoStorageError(
      503,
      "The photo bucket is unavailable. Check the storage setup.",
    );
  if (status(error) === 403)
    return new PhotoStorageError(
      503,
      "Photo storage access was denied. Check the storage credentials and bucket permissions.",
    );
  return new PhotoStorageError(
    503,
    "Photo storage is temporarily unavailable. Please try again.",
  );
}

// The API validates session ownership before passing an object key here.
export class S3Receipts {
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}
  private target(key: string) {
    return { Bucket: this.bucket, Key: key };
  }
  private async head(key: string) {
    try {
      return await this.client.send(new HeadObjectCommand(this.target(key)));
    } catch (error) {
      if (status(error) === 404 && (error as Error).name !== "NoSuchBucket")
        return null;
      throw error;
    }
  }
  async upload(key: string, bytes: Buffer) {
    if (bytes.length > maxBytes)
      throw new PhotoStorageError(413, "Photo must be smaller than 5 MB.");
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
      throw new PhotoStorageError(415, "Please upload a JPEG photo.");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing = await this.head(key);
    if (existing) {
      if (existing.Metadata?.receipt_sha256 !== hash)
        throw new PhotoStorageError(
          409,
          "A different photo is already attached.",
        );
      return;
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          ...this.target(key),
          Body: bytes,
          ContentType: "image/jpeg",
          Metadata: { receipt_sha256: hash },
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      // A concurrent request may have completed the identical upload.
      if (status(error) !== 412) throw error;
      const winner = await this.head(key);
      if (winner?.Metadata?.receipt_sha256 !== hash)
        throw new PhotoStorageError(
          409,
          "A different photo is already attached.",
        );
    }
  }
  async url(key: string) {
    if (!(await this.head(key)))
      throw new PhotoStorageError(404, "Photo not found.");
    return getSignedUrl(this.client, new GetObjectCommand(this.target(key)), {
      expiresIn: 300,
    });
  }
  async download(key: string) {
    let response;
    try {
      response = await this.client.send(new GetObjectCommand(this.target(key)));
    } catch (error) {
      if (status(error) === 404 && (error as Error).name !== "NoSuchBucket")
        throw new PhotoStorageError(404, "Photo not found. Upload it again.");
      throw error;
    }
    if (!response.Body) throw new PhotoStorageError(404, "Photo not found.");
    const reader = response.Body.transformToWebStream().getReader();
    try {
      if ((response.ContentLength ?? 0) > maxBytes)
        throw new PhotoStorageError(413, "Photo must be smaller than 5 MB.");
      if (response.ContentType !== "image/jpeg")
        throw new PhotoStorageError(415, "Please upload a JPEG photo.");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes)
          throw new PhotoStorageError(413, "Photo must be smaller than 5 MB.");
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks, length);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
        throw new PhotoStorageError(415, "Please upload a JPEG photo.");
      return bytes;
    } finally {
      await reader.cancel();
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand(this.target(key)));
  }
  async deleteUserPhotos(uid: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(uid))
      throw new PhotoStorageError(400, "Invalid account ID.");
    const prefix = `receipts/${uid}/`;
    for (let page = 0; page < 100; page++) {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: 1000,
        }),
      );
      if (!result.Contents?.length) return;
      const objects = result.Contents.map((object) => ({ Key: object.Key! }));
      if (objects.some((object) => !object.Key.startsWith(prefix)))
        throw new PhotoStorageError(503, "Could not verify photo ownership.");
      const deleted = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
      if (deleted.Errors?.length)
        throw new PhotoStorageError(
          503,
          "Some photos could not be removed. Retry account deletion.",
        );
    }
    throw new PhotoStorageError(
      503,
      "Photo cleanup needs another attempt. Retry account deletion.",
    );
  }
}
