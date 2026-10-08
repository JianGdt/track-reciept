import { z } from "zod";
import { CurrencySchema, DateSchema, toMinor } from "./api-contract";
export * from "./api-contract";
export const categories = [
  "Food",
  "Groceries",
  "Transport",
  "Bills",
  "Other",
] as const;
export { default as tokens } from "./tokens.json";
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const date = DateSchema;
export const receiptSchema = z
  .object({
    merchant: z.string().trim().min(1, "Enter a store name").max(120),
    purchase_date: date,
    total_amount: z
      .number({ error: "Enter a valid total" })
      .finite()
      .min(0, "Total cannot be negative")
      .max(9999999999.99),
    currency: CurrencySchema,
    category_id: z.string().uuid().nullable(),
    payment_method: z.string().max(100),
    notes: z.string().max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      toMinor(value.total_amount, value.currency);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["total_amount"],
        message: "Check the amount and decimal places for this currency.",
      });
    }
  });
export const scanSchema = z
  .object({
    merchant: z.string().max(120),
    purchaseDate: date.nullable(),
    total: z.number().finite().nonnegative().max(9999999999.99).nullable(),
    currency: CurrencySchema,
    category: z.enum(["food", "groceries", "transport", "bills", "other"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const scanRequestSchema = z
  .object({
    receiptId: z.string().uuid(),
    imagePath: z.string().max(200),
  })
  .strict();
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type ScanResult = z.infer<typeof scanSchema>;
export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
};
export type Receipt = ReceiptInput & {
  id: string;
  user_id: string;
  image_path: string | null;
  scan_status: "manual" | "scanned" | "failed";
  scan_raw: ScanResult | null;
  created_at: string;
  updated_at: string;
};
export const formatMoney = (amount: number, currency = "PHP") =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(
    amount,
  );
export function toCsv(rows: Receipt[], names: Record<string, string>) {
  const cell = (v: unknown) => {
    let text = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    ["Store", "Date", "Total", "Currency", "Category", "Notes"],
    ...rows.map((r) => [
      r.merchant,
      r.purchase_date,
      r.total_amount,
      r.currency,
      names[r.category_id ?? ""] ?? "Other",
      r.notes,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

export { ownedImagePath, nextScanQuota, type ScanQuota } from "./security";
