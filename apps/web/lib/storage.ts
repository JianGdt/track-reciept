import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { loadServerEnv } from "./server-env";
import { PhotoStorageError, S3Receipts } from "./s3-receipts";

export function photoStorage() {
  loadServerEnv();
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new PhotoStorageError(
      503,
      "Photo storage needs its S3 bucket and access keys configured before uploading.",
    );
  const client = new S3Client({
    endpoint: endpoint || undefined,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
  });
  return new S3Receipts(client, bucket);
}
