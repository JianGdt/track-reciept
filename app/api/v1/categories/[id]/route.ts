import { NextResponse } from "next/server";
import { CategoryFieldsSchema, CategoryDtoSchema } from "@/lib/shared";
import { withAuth, withValidation } from "@/lib/api-route";
import {
  listCategories,
  writeCategory,
  deleteCategory,
} from "@/lib/receipt-repository";
import { ServiceError } from "@/lib/service-error";
export const runtime = "nodejs";
export const PATCH = withAuth(async (request, { uid, id }) => {
  const input = await withValidation(
    request,
    CategoryFieldsSchema.partial()
      .strict()
      .refine((value) => Object.keys(value).length > 0),
  );
  const old = (await listCategories(uid)).find(
    (category) => category.id === id,
  );
  if (!old) throw new ServiceError(404, "Category not found.");
  return NextResponse.json(
    CategoryDtoSchema.parse(
      await writeCategory(
        uid,
        id,
        {
          name: input.name ?? old.name,
          color: input.color === undefined ? (old.color ?? null) : input.color,
        },
        true,
      ),
    ),
  );
});
export const DELETE = withAuth(async (_request, { uid, id }) => {
  await deleteCategory(uid, id);
  return new Response(null, { status: 204 });
});
