import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer, trustedOrigins } from "./auth";
import { loadServerEnv } from "./server-env";
import { firebaseAdmin } from "./firebase-admin";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser(request: NextRequest) {
  loadServerEnv();
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || !trustedOrigins().includes(origin))
      throw new ApiError(403, "This request did not come from a trusted app.");
  }
  let auth;
  try {
    auth = getAuthServer();
  } catch {
    throw new ApiError(
      503,
      "The server needs Firebase Admin credentials before you can save receipts.",
    );
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new ApiError(401, "Please log in again.");
  if (
    (
      await firebaseAdmin().db.collection("users").doc(session.user.id).get()
    ).get("deleting")
  )
    throw new ApiError(
      403,
      "Account deletion is in progress. Retry deletion to finish.",
    );
  return session.user.id;
}
export function apiError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not complete the request. Please try again.",
    },
    { status: error instanceof ApiError ? error.status : 503 },
  );
}
export async function readBytes(request: NextRequest, limit: number) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > limit)
  )
    throw new ApiError(413, "The file or request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "The request is empty.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new ApiError(413, "The file or request is too large.");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks, length);
}
