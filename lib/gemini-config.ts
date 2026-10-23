export const DEFAULT_SCAN_MODEL = "gemini-3.5-flash-lite";
export const SCAN_TIMEOUT_MS = 20_000;
export const FALLBACK_SCAN_TIMEOUT_MS = 15_000;

export function scanModel(configured = process.env.GEMINI_MODEL) {
  return configured?.trim() || DEFAULT_SCAN_MODEL;
}

export function scanThinkingConfig(model: string) {
  // Minimal is supported by these Lite models, but not 3.7/3.8 Flash.
  if (/^gemini-3\.(1|5)-flash-lite(?:-|$)/.test(model))
    return { thinkingLevel: "minimal" };
  if (model.startsWith("gemini-3")) return { thinkingLevel: "low" };
  if (/^gemini-2\.5-flash(?:-|$)/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}
