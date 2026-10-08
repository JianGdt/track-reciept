import { NextResponse } from "next/server";
import { ScanInputSchema, ScanDtoSchema } from "@receipt-vault/shared";
import { withAuth, withValidation, idempotencyKey } from "@/lib/api-route";
import { scanReceipt } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = withAuth(async (request, { uid }) => {
  const input = await withValidation(request, ScanInputSchema);
  idempotencyKey(request, input.receiptId);
  return NextResponse.json(
    ScanDtoSchema.parse(await scanReceipt(uid, input.receiptId)),
  );
});
