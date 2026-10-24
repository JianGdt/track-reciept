import "server-only";
import { betterAuth } from "better-auth";
import { firestoreAdapter } from "better-auth-firestore";
import { firebaseAdmin } from "./firebase-admin";
import { loadServerEnv } from "./server-env";
import { deleteAccountData } from "./account-service";
import { APIError } from "better-auth/api";
import { sendVerificationEmail } from "./verification-email";
import {
  emailAndPasswordPolicy,
  emailVerificationPolicy,
} from "./email-verification-policy";
export function trustedOrigins() {
  return [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3000", "http://localhost:3100"]
      : []),
  ];
}
function createAuthServer() {
  loadServerEnv();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Better Auth secret is not configured.");
  return betterAuth({
    appName: "ReceiptVault",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
    secret,
    database: firestoreAdapter({
      firestore: firebaseAdmin().db,
      migrationChecks: false,
      collections: {
        users: "authUsers",
        sessions: "authSessions",
        accounts: "authAccounts",
        verificationTokens: "authVerifications",
      },
    }),
    emailAndPassword: emailAndPasswordPolicy,
    emailVerification: {
      ...emailVerificationPolicy,
      sendVerificationEmail,
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          try {
            await deleteAccountData(user.id);
          } catch {
            throw new APIError("SERVICE_UNAVAILABLE", {
              message:
                "Account cleanup could not finish. Please retry deletion.",
            });
          }
        },
        afterDelete: async (user) => {
          await firebaseAdmin()
            .db.collection("users")
            .doc(user.id)
            .set({ deleting: true, deletedAt: new Date().toISOString() });
        },
      },
    },
    trustedOrigins: trustedOrigins(),
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-up/email": { window: 600, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: { database: { generateId: "uuid" } },
  });
}
let instance: ReturnType<typeof createAuthServer> | undefined;
export function getAuthServer() {
  return (instance ??= createAuthServer());
}
