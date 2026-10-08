import { z } from "zod";
import { ScanDtoSchema, type ScanDto } from "@/lib/shared";

export class ScanError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable = false,
    public code = "SCAN_FAILED",
    public retryAfter?: number,
    public providerStatus?: number,
  ) {
    super(message);
  }
}

// Never include the provider body: it may echo receipt content or credentials.
export function providerScanError(status: number): ScanError {
  if (status === 429)
    return new ScanError(
      429,
      "The scanning service has reached its usage limit. Please try again later.",
      false,
      "SCAN_PROVIDER_RATE_LIMIT",
      60,
      status,
    );
  if ([400, 401, 403, 404].includes(status))
    return new ScanError(
      503,
      "The scanning service configuration was rejected. Check the Gemini key, model, and API access.",
      false,
      "SCAN_CONFIG_REJECTED",
      undefined,
      status,
    );
  return new ScanError(
    502,
    "The scanning service is temporarily unavailable. Your photo is saved; please retry the scan shortly.",
    status >= 500,
    "SCAN_PROVIDER_UNAVAILABLE",
    30,
    status,
  );
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

const ProviderResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export function parseReceiptResponse(data: unknown): ScanDto {
  const envelope = ProviderResponseSchema.safeParse(data);
  if (!envelope.success)
    throw new ScanError(
      502,
      "The scanner returned an invalid response. Please retry the scan.",
      true,
      "SCAN_INVALID_RESPONSE",
    );
  const candidate = envelope.data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS")
    throw new ScanError(
      502,
      "The scanner stopped before completing the result. Please retry the scan.",
      true,
      "SCAN_OUTPUT_LIMIT",
    );
  if (
    envelope.data.promptFeedback?.blockReason ||
    [
      "SAFETY",
      "RECITATION",
      "BLOCKLIST",
      "PROHIBITED_CONTENT",
      "SPII",
      "IMAGE_SAFETY",
    ].includes(candidate?.finishReason ?? "")
  )
    throw new ScanError(
      422,
      "The scanner could not process this photo. Use another receipt photo or enter details manually.",
      false,
      "SCAN_BLOCKED",
    );
  if (candidate?.finishReason !== "STOP")
    throw new ScanError(
      502,
      "The scanner did not return a complete result. Please retry the scan.",
      true,
      "SCAN_INCOMPLETE_RESPONSE",
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
      true,
      "SCAN_INVALID_JSON",
    );
  }
  const result = ScanDtoSchema.safeParse(parsed);
  if (!result.success)
    throw new ScanError(
      502,
      "The scanner returned invalid receipt fields. Please retry the scan or enter details manually.",
      true,
      "SCAN_INVALID_FIELDS",
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
