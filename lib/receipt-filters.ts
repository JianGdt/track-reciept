import { ReceiptFiltersSchema, type ReceiptFilters } from "./shared";

// An absent/cleared month means the whole archive, including after a reload.
export function receiptFilters(
  params: Record<string, unknown>,
): ReceiptFilters {
  const parsed = ReceiptFiltersSchema.safeParse({
    q: params.q || undefined,
    month: params.month || undefined,
    categoryId: params.categoryId || undefined,
  });
  return parsed.success ? parsed.data : {};
}
