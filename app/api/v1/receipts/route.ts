import { NextResponse } from "next/server";
import {
  CreateReceiptSchema,
  ListReceiptsSchema,
  ReceiptDtoSchema,
  ReceiptPageSchema,
} from "@/lib/shared";
import {
  withAuth,
  withValidation,
  query,
  idempotencyKey,
  cachedJson,
} from "@/lib/api-route";
import { listReceipts } from "@/lib/receipt-repository";
import { createReceipt } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid }) => {
  const { limit, cursor, sort, ...filters } = query(
    request,
    ListReceiptsSchema,
  );
  return cachedJson(
    request,
    ReceiptPageSchema.parse(await listReceipts(uid, filters, limit, cursor)),
  );
});
export const POST = withAuth(async (request, { uid }) => {
  const input = await withValidation(request, CreateReceiptSchema);
  idempotencyKey(request, input.id);
  return NextResponse.json(
    ReceiptDtoSchema.parse(await createReceipt(uid, input)),
    { status: 201, headers: { Location: `/api/v1/receipts/${input.id}` } },
  );
});
