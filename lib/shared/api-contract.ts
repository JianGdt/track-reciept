import { z } from "zod";

export const IdSchema = z.string().uuid();
export const CurrencySchema = z.enum([
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "SGD",
  "AUD",
  "CAD",
  "HKD",
  "KRW",
  "CNY",
  "AED",
  "SAR",
  "THB",
  "MYR",
  "IDR",
  "TWD",
  "VND",
  "INR",
  "KWD",
  "BHD",
]);
export function currencyDigits(currency: string) {
  return ["JPY", "KRW", "VND"].includes(currency)
    ? 0
    : ["KWD", "BHD"].includes(currency)
      ? 3
      : 2;
}
export function toMinor(value: number | string, currency: string): number {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a valid amount.");
  const [whole, fraction = ""] = text.split(".");
  const digits = currencyDigits(currency);
  if (/[1-9]/.test(fraction.slice(digits)))
    throw new Error("Too many decimal places for this currency.");
  const minor =
    Number(whole) * 10 ** digits +
    Number(fraction.slice(0, digits).padEnd(digits, "0"));
  if (!Number.isSafeInteger(minor) || minor > 999_999_999_999)
    throw new Error("Amount is too large.");
  return minor;
}
export const fromMinor = (value: number, currency: string) =>
  value / 10 ** currencyDigits(currency);
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2100-12-31"
    );
  }, "Enter a valid purchase date (1900–2100).");
export const ReceiptFieldsSchema = z
  .object({
    merchant: z.string().trim().min(1).max(120),
    purchaseDate: DateSchema,
    totalMinor: z.number().int().min(0).max(999_999_999_999),
    currency: CurrencySchema,
    categoryId: IdSchema.nullable(),
    paymentMethod: z.string().trim().max(100),
    notes: z.string().max(1000),
  })
  .strict();
export const CreateReceiptSchema = ReceiptFieldsSchema.extend({
  id: IdSchema,
  hasPhoto: z.boolean(),
}).strict();
export const UpdateReceiptSchema = ReceiptFieldsSchema.partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide a field to update.",
  );
export const ReceiptDtoSchema = ReceiptFieldsSchema.extend({
  // Existing receipts remain readable; new/edited fields have tighter limits.
  merchant: z.string().min(1).max(200),
  notes: z.string().max(2000),
  id: IdSchema,
  hasPhoto: z.boolean(),
  scanStatus: z.enum(["manual", "scanned", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export const ScanDtoSchema = z
  .object({
    merchant: z.string().max(120),
    purchaseDate: DateSchema.nullable(),
    totalMinor: z.number().int().min(0).max(999_999_999_999).nullable(),
    currency: CurrencySchema,
    category: z.enum(["food", "groceries", "transport", "bills", "other"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const ScanInputSchema = z.object({ receiptId: IdSchema }).strict();
export const ReceiptFiltersSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    categoryId: IdSchema.optional(),
    q: z.string().trim().max(120).optional(),
    currency: CurrencySchema.optional(),
  })
  .strict();
export const ListReceiptsSchema = ReceiptFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(1000).optional(),
  sort: z.literal("-purchaseDate").default("-purchaseDate"),
}).strict();
export const CategoryFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
  })
  .strict();
export const CategoryDtoSchema = CategoryFieldsSchema.extend({
  id: IdSchema,
  createdAt: z.string(),
}).strict();
export const CreateCategorySchema = CategoryFieldsSchema.extend({
  id: IdSchema,
}).strict();
export const PageSchema = z
  .object({ nextCursor: z.string().nullable(), limit: z.number().int() })
  .strict();
export const ReceiptPageSchema = z
  .object({ data: z.array(ReceiptDtoSchema), page: PageSchema })
  .strict();
export const CategoryPageSchema = z
  .object({ data: z.array(CategoryDtoSchema), page: PageSchema })
  .strict();
export const ReportSchema = z
  .object({
    count: z.number().int(),
    totalMinor: z.number().int(),
    currency: CurrencySchema,
    categories: z.array(
      z.object({
        categoryId: IdSchema.nullable(),
        totalMinor: z.number().int(),
        count: z.number().int(),
      }),
    ),
  })
  .strict();
export type ReceiptDto = z.infer<typeof ReceiptDtoSchema>;
export type ReceiptFilters = z.infer<typeof ReceiptFiltersSchema>;
export type CreateReceipt = z.infer<typeof CreateReceiptSchema>;
export type ScanDto = z.infer<typeof ScanDtoSchema>;
export const qk = {
  receipts: (uid = "") => ["receipts", uid] as const,
  list: (uid: string, filters: ReceiptFilters) =>
    ["receipts", uid, "list", filters] as const,
  report: (uid: string, filters: ReceiptFilters) =>
    ["receipts", uid, "report", filters] as const,
  photo: (uid: string, id: string) => ["receipts", uid, "photo", id] as const,
  categories: (uid = "") => ["categories", uid] as const,
};
export const queryDefaults = {
  staleTime: 30_000,
  gcTime: 300_000,
  refetchOnWindowFocus: false,
  retry: 1,
} as const;
