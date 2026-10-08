import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  IdSchema,
  CurrencySchema,
  DateSchema,
  fromMinor,
  toMinor,
  scanRequestSchema,
  scanSchema,
  ownedImagePath,
  type ReceiptDto,
} from "@receipt-vault/shared";
import { withAuth, withValidation, query } from "./api-route";
import { readBytes } from "./api";
import { ServiceError } from "./service-error";
import * as repository from "./receipt-repository";
import * as service from "./receipt-service";

function legacy(row: ReceiptDto, uid: string) {
  return {
    id: row.id,
    user_id: uid,
    merchant: row.merchant,
    purchase_date: row.purchaseDate,
    total_amount: fromMinor(row.totalMinor, row.currency),
    currency: row.currency,
    category_id: row.categoryId,
    payment_method: row.paymentMethod,
    notes: row.notes,
    image_path: row.hasPhoto ? `${uid}/${row.id}.jpg` : null,
    scan_status: row.scanStatus,
    scan_raw: null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
export function deprecated(handler: ReturnType<typeof withAuth>) {
  return async (request: NextRequest) => {
    const response = await handler(request);
    response.headers.set("Deprecation", "@1791417600");
    response.headers.set("Link", '</api/v1/receipts>; rel="successor-version"');
    // Preserve the old string error shape for installed clients.
    if (response.status >= 400) {
      const body = await response.json();
      return NextResponse.json(
        {
          error: body.error.message,
          code: body.error.code,
          requestId: body.error.requestId,
        },
        { status: response.status, headers: response.headers },
      );
    }
    return response;
  };
}
export const receiptsGet = deprecated(
  withAuth(async (request, { uid }) => {
    const { cursor, limit } = query(
      request,
      z
        .object({
          cursor: z.string().max(1000).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .strict(),
    );
    const result = await repository.listReceipts(uid, {}, limit, cursor);
    return NextResponse.json({
      receipts: result.data.map((row) => legacy(row, uid)),
      page: result.page,
    });
  }),
);
const OldReceipt = z
  .object({
    id: IdSchema,
    user_id: z.string().max(128),
    merchant: z.string().trim().min(1).max(120),
    purchase_date: DateSchema,
    total_amount: z.number().finite().min(0).max(9999999999.99),
    currency: CurrencySchema,
    category_id: IdSchema.nullable(),
    payment_method: z.string().max(100),
    notes: z.string().max(1000),
    image_path: z.string().max(200).nullable(),
    scan_status: z.enum(["manual", "scanned", "failed"]),
    scan_raw: scanSchema.nullable(),
    created_at: z.string().max(50),
    updated_at: z.string().max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      toMinor(value.total_amount, value.currency);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["total_amount"],
        message: "Invalid amount for currency.",
      });
    }
  });
export const receiptsPost = deprecated(
  withAuth(async (request, { uid }) => {
    const { receipt, existing } = await withValidation(
      request,
      z.object({ receipt: OldReceipt, existing: z.boolean() }).strict(),
    );
    if (receipt.image_path && receipt.image_path !== `${uid}/${receipt.id}.jpg`)
      throw new ServiceError(404, "Photo not found.");
    const fields = {
      merchant: receipt.merchant,
      purchaseDate: receipt.purchase_date,
      totalMinor: toMinor(receipt.total_amount, receipt.currency),
      currency: receipt.currency,
      categoryId: receipt.category_id,
      paymentMethod: receipt.payment_method,
      notes: receipt.notes,
    };
    if (existing) await service.updateReceipt(uid, receipt.id, fields);
    else
      await service.createReceipt(uid, {
        ...fields,
        id: receipt.id,
        hasPhoto: Boolean(receipt.image_path),
      });
    return NextResponse.json({ ok: true });
  }),
);
export const receiptsDelete = deprecated(
  withAuth(async (request, { uid }) => {
    const { id } = query(request, z.object({ id: IdSchema }).strict());
    await service.deleteReceipt(uid, id);
    return NextResponse.json({ ok: true });
  }),
);
export const categoriesGet = deprecated(
  withAuth(async (_request, { uid }) =>
    NextResponse.json({
      categories: (await repository.listCategories(uid)).map((c) => ({
        ...c,
        user_id: uid,
        created_at: c.createdAt,
      })),
    }),
  ),
);
function oldPhotoId(request: NextRequest, uid: string) {
  const { path } = query(
    request,
    z.object({ path: z.string().max(200) }).strict(),
  );
  if (!ownedImagePath(uid, path))
    throw new ServiceError(404, "Photo not found.");
  return path.split("/")[1].replace(/\.jpg$/, "");
}
export const photoGet = deprecated(
  withAuth(async (request, { uid }) =>
    NextResponse.json({
      url: await service.photoUrl(uid, oldPhotoId(request, uid)),
    }),
  ),
);
export const photoPost = deprecated(
  withAuth(async (request, { uid }) => {
    const id = oldPhotoId(request, uid);
    if (request.headers.get("content-type") !== "image/jpeg")
      throw new ServiceError(415, "Please upload a JPEG photo.");
    await service.uploadPhoto(
      uid,
      id,
      await readBytes(request, 5 * 1024 * 1024),
    );
    return NextResponse.json({ ok: true });
  }),
);
export const photoDelete = deprecated(
  withAuth(async (request, { uid }) => {
    const id = oldPhotoId(request, uid);
    const receipt = await repository
      .userCollection(uid, "receipts")
      .doc(id)
      .get();
    if (receipt.exists)
      throw new ServiceError(409, "Delete the receipt to remove its photo.");
    // The receipt deletion service has already removed the object.
    return NextResponse.json({ ok: true });
  }),
);
export const scanPost = deprecated(
  withAuth(async (request, { uid }) => {
    const input = await withValidation(request, scanRequestSchema);
    if (input.imagePath !== `${uid}/${input.receiptId}.jpg`)
      throw new ServiceError(404, "Photo not found.");
    const { totalMinor, ...result } = await service.scanReceipt(
      uid,
      input.receiptId,
    );
    return NextResponse.json({
      ...result,
      total:
        totalMinor === null ? null : fromMinor(totalMinor, result.currency),
    });
  }),
);
