import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { scanUsage } from "@/lib/scan-guard";
export const runtime = "nodejs";
export const GET = withAuth(async (_request, { uid }) =>
  NextResponse.json(await scanUsage(uid)),
);
