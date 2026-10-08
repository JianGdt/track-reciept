import { z } from "zod";
export const ServerEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.email(),
  FIREBASE_PRIVATE_KEY: z.string().min(50),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GEMINI_API_KEY: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  SCAN_ENABLED: z.enum(["true", "false"]).default("true"),
});
export function validateServerEnv(env: NodeJS.ProcessEnv) {
  const result = ServerEnvSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
