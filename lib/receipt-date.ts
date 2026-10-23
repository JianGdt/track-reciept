import { DateSchema } from "./shared/api-contract";

export function formatReceiptDate(value: string) {
  if (!DateSchema.safeParse(value).success) return "Choose a date";
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Derive both interpretations ourselves instead of trusting an AI's locale guess.
export function receiptDateOptions(
  printed: string | null | undefined,
): string[] {
  const text = printed?.trim() ?? "";
  if (DateSchema.safeParse(text).success) return [text];
  const numeric = /^(\d{1,2})\s*([/.-])\s*(\d{1,2})\s*\2\s*(\d{4})$/.exec(text);
  if (!numeric) return [];
  const [, first, , second, year] = numeric;
  if (!first || !second || !year) return [];
  return [
    ...new Set([
      `${year}-${first.padStart(2, "0")}-${second.padStart(2, "0")}`,
      `${year}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`,
    ]),
  ].filter((value) => DateSchema.safeParse(value).success);
}

export function resolveReceiptDate(
  printed: string | null | undefined,
  extracted: string | null,
) {
  // Cached scans from older app versions do not have the original date.
  if (printed === undefined) return extracted;
  if (!printed?.trim()) return null;
  const options = receiptDateOptions(printed);
  if (options.length) return options.length === 1 ? options[0]! : null;
  // Only trust model normalization for dates written with a month name.
  return /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i.test(
    printed,
  )
    ? extracted
    : null;
}
