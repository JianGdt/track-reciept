import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth";
export const runtime = "nodejs";
async function handler(request: NextRequest) {
  let auth;
  try {
    auth = getAuthServer();
  } catch (error) {
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
