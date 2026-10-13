import { toMinor, type Receipt, type ReceiptFilters } from "./shared";

export type MonthlySpending = {
  month: string;
  totalMinor: number;
  count: number;
};

export function addMonthlySpending(
  months: Map<string, MonthlySpending>,
  purchaseDate: string,
  totalMinor: number,
) {
  const month = purchaseDate.slice(0, 7);
  const bucket = months.get(month) ?? { month, totalMinor: 0, count: 0 };
  bucket.totalMinor += totalMinor;
  bucket.count++;
  months.set(month, bucket);
}

export function spendingYear(months: MonthlySpending[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return (
      months.find((row) => row.month === month) ?? {
        month,
        totalMinor: 0,
        count: 0,
      }
    );
  });
}

export function selectReceipts(receipts: Receipt[], filters: ReceiptFilters) {
  return receipts.filter(
    (receipt) =>
      (!filters.month || receipt.purchase_date.startsWith(filters.month)) &&
      (!filters.categoryId || receipt.category_id === filters.categoryId) &&
      (!filters.q ||
        receipt.merchant.toLowerCase().includes(filters.q.toLowerCase())),
  );
}

export function summarizeSpending(receipts: Receipt[], currency: string) {
  let totalMinor = 0;
  const months = new Map<string, MonthlySpending>();
  const categories = new Map<
    string | null,
    { categoryId: string | null; count: number; totalMinor: number }
  >();
  for (const receipt of receipts) {
    if (receipt.currency !== currency) continue;
    const amount = toMinor(receipt.total_amount, currency);
    totalMinor += amount;
    addMonthlySpending(months, receipt.purchase_date, amount);
    const category = categories.get(receipt.category_id) ?? {
      categoryId: receipt.category_id,
      count: 0,
      totalMinor: 0,
    };
    category.count++;
    category.totalMinor += amount;
    categories.set(receipt.category_id, category);
  }
  return {
    count: receipts.length,
    totalMinor,
    currency,
    categories: [...categories.values()],
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
