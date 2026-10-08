import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadServerEnv } from "./server-env";
export function firebaseAdmin() {
  loadServerEnv();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey)
    throw new Error(
      `Firebase server credentials are not configured: ${[!projectId && "project", !clientEmail && "email", !privateKey && "key"].filter(Boolean).join(", ")}`,
    );
  const app =
    getApps().find((app) => app.name === "receipt-vault-admin") ??
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      "receipt-vault-admin",
    );
  return {
    db: getFirestore(app),
  };
}
