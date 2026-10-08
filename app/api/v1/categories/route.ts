import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CreateCategorySchema,
  CategoryDtoSchema,
  CategoryPageSchema,
  IdSchema,
} from "@/lib/shared";
import {
  withAuth,
  withValidation,
  query,
  cachedJson,
  idempotencyKey,
} from "@/lib/api-route";
import { listCategories, writeCategory } from "@/lib/receipt-repository";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid }) => {
  const { limit, cursor } = query(
    request,
    z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        cursor: IdSchema.optional(),
      })
      .strict(),
  );
  const rows = (await listCategories(uid)).filter(
    (row) => !cursor || row.id > cursor,
  );
  const data = rows.slice(0, limit);
  return cachedJson(
    request,
    CategoryPageSchema.parse({
      data,
      page: { limit, nextCursor: rows.length > limit ? data.at(-1)!.id : null },
    }),
    "private, max-age=300, stale-while-revalidate=600",
  );
});
export const POST = withAuth(async (request, { uid }) => {
  const { id, ...input } = await withValidation(request, CreateCategorySchema);
  idempotencyKey(request, id);
  return NextResponse.json(
    CategoryDtoSchema.parse(await writeCategory(uid, id, input, false)),
    { status: 201, headers: { Location: `/api/v1/categories/${id}` } },
  );
});
