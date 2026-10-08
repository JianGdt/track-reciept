import { NextResponse } from "next/server";
import { ReceiptDtoSchema, UpdateReceiptSchema } from "@/lib/shared";
import { withAuth, withValidation, cachedJson } from "@/lib/api-route";
import {
  getReceipt,
  updateReceipt,
  deleteReceipt,
} from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid, id }) =>
  cachedJson(request, ReceiptDtoSchema.parse(await getReceipt(uid, id))),
);
export const PATCH = withAuth(async (request, { uid, id }) =>
  NextResponse.json(
    ReceiptDtoSchema.parse(
      await updateReceipt(
        uid,
        id,
        await withValidation(request, UpdateReceiptSchema),
      ),
    ),
  ),
);
export const DELETE = withAuth(async (_request, { uid, id }) => {
  await deleteReceipt(uid, id);
  return new Response(null, { status: 204 });
});
