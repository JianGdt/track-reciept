import { ScanDtoSchema, type ScanDto } from "@/lib/shared";

export class ScanError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export async function withScanFallback(
  primary: () => Promise<ScanDto>,
  fallback?: () => Promise<ScanDto>,
): Promise<ScanDto> {
  try {
    return await primary();
  } catch (error) {
    if (!(error instanceof ScanError) || !error.retryable || !fallback)
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fallback();
  }
}

export function parseReceiptResponse(data: {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
}): ScanDto {
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== "STOP")
    throw new ScanError(
      422,
      "The scan did not finish reading this photo. Retry the scan or use a clearer photo.",
    );
  const text =
    candidate.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScanError(
      502,
      "The scanner returned an incomplete result. Please retry the scan.",
    );
  }
  const result = ScanDtoSchema.safeParse(parsed);
  if (!result.success)
    throw new ScanError(
      502,
      "The scanner returned invalid receipt fields. Please retry the scan or enter details manually.",
    );
  // Preserve readable fields without inventing an unreadable amount.
  return {
    ...result.data,
    confidence:
      result.data.totalMinor === null
        ? Math.min(result.data.confidence, 0.5)
        : result.data.confidence,
  };
}
