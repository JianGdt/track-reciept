import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth";
import { enforceIp } from "@/lib/scan-guard";
import { ServiceError } from "@/lib/service-error";
export const runtime = "nodejs";
async function handler(request: NextRequest) {
  let auth;
  try {
    if (request.method === "POST") await enforceIp(request, "auth");
    auth = getAuthServer();
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(error.retryAfter ?? 60),
          },
        },
      );
    }
    if (
      error instanceof Error &&
      error.message.startsWith(
        "Firebase server credentials are not configured:",
      )
    ) {
      console.error(error.message);
      return NextResponse.json(
        { code: "AUTH_NOT_CONFIGURED", message: error.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        message:
          "Sign-in is not configured yet. Add the Firebase Admin credentials on the server.",
        code: "AUTH_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }
  return auth.handler(request);
}
export { handler as GET, handler as POST };
