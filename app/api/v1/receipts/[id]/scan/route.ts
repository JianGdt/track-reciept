import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-route";
import { receiptScanState } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (_request, { uid, id }) =>
  NextResponse.json(await receiptScanState(uid, id)),
);
