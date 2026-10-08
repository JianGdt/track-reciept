import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import { migrateStorage, type MigrationMode } from "./storage-migration";

async function main() {
  const envPath = resolve(import.meta.dirname, "../../../.env.local");
  const env = {
    ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {}),
    ...process.env,
  };
  const arg = process.argv[2] ?? "dry-run";
  if (!["dry-run", "copy", "verify"].includes(arg) || process.argv.length > 3)
    throw new Error("Use pnpm storage:migrate [dry-run|copy|verify]");
  function config(prefix: string) {
    const required = [
      "ENDPOINT",
      "BUCKET",
      "ACCESS_KEY_ID",
      "SECRET_ACCESS_KEY",
    ];
    const missing = required.filter((name) => !env[`${prefix}_${name}`]);
    if (missing.length)
      throw new Error(
        `Missing configuration: ${missing.map((name) => `${prefix}_${name}`).join(", ")}`,
      );
    const endpoint = env[`${prefix}_ENDPOINT`]!;
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "Storage endpoint must use HTTPS without embedded credentials",
      );
    return {
      endpoint,
      bucket: env[`${prefix}_BUCKET`]!,
      client: new S3Client({
        endpoint,
        region: env[`${prefix}_REGION`] || "auto",
        credentials: {
          accessKeyId: env[`${prefix}_ACCESS_KEY_ID`]!,
          secretAccessKey: env[`${prefix}_SECRET_ACCESS_KEY`]!,
        },
        forcePathStyle: env[`${prefix}_FORCE_PATH_STYLE`] === "true",
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
      }),
    };
  }
  // Dedicated source credentials keep delta-copy usable AFTER changing active S3 settings.
  const source = config("MIGRATION_SOURCE_S3");
  const target = config("R2");
  if (
    source.endpoint.replace(/\/$/, "") === target.endpoint.replace(/\/$/, "") &&
    source.bucket === target.bucket
  )
    throw new Error("Source and destination must differ");
  if (
    !/^[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(
      new URL(target.endpoint).hostname,
    )
  )
    throw new Error("R2_ENDPOINT must be the account S3 API endpoint");
  try {
    const summary = await migrateStorage(source, target, arg as MigrationMode);
    console.log(JSON.stringify({ mode: arg, ...summary }));
    if (summary.missing || summary.conflicts) process.exitCode = 1;
  } finally {
    source.client.destroy();
    target.client.destroy();
  }
}
main().catch((error: unknown) => {
  // Never print SDK errors: they can contain signed URLs, object keys or credentials.
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^(Missing configuration:|Use pnpm|Storage endpoint must|Source and destination|R2_ENDPOINT)/.test(
      message,
    )
      ? message
      : "Storage migration failed. Check credentials, bucket access and connectivity; no source objects were deleted.",
  );
  process.exitCode = 1;
});
