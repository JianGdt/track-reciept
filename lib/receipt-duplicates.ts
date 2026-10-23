import { createHash } from "node:crypto";
import { receiptDateOptions } from "./receipt-date";
import type { ScanDto } from "./shared";

export const DUPLICATE_RECEIPT_MESSAGE =
  "This receipt has already been scanned and saved. Check your Receipts tab.";
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const receiptPhotoKey = (bytes: Buffer) => `photo:${digest(bytes)}`;

export function receiptScanKey(scan: ScanDto): string | null {
  // Store/date/total alone can describe two legitimate purchases. Require an
  // invoice number and branch address before blocking a different photograph.
  const number = normalize(scan.receiptNumber ?? "");
  const merchant = normalize(scan.merchant);
  const branch = normalize(scan.merchantAddress ?? "");
  const dates = receiptDateOptions(scan.printedDate);
  const date = dates.length ? dates.sort().join("|") : scan.purchaseDate;
  if (!number || !merchant || !branch || !date || scan.totalMinor === null)
    return null;
  return `invoice:${digest(JSON.stringify([merchant, branch, number, date, scan.totalMinor, scan.currency]))}`;
}
