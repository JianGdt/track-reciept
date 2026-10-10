import { z } from "zod";
import { ScanDtoSchema } from "./shared";

export const ScanStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("done"), result: ScanDtoSchema }),
  z.object({ state: z.literal("pending") }),
  z.object({
    state: z.literal("failed"),
    retryAfter: z.number().nonnegative(),
    retryable: z.boolean(),
  }),
  z.object({ state: z.literal("idle") }),
]);
export type ScanState = z.infer<typeof ScanStateSchema>;
export type ScanProgress = {
  stage: "preparing" | "uploading" | "scanning" | "waiting" | "retrying";
  retryAt?: number;
};

export function canRecoverScan(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error instanceof TypeError || error.name === "TimeoutError") return true;
  const { code, status } = error as Error & { code?: string; status?: number };
  if (code === "REQUEST_IN_PROGRESS") return true;
  if (code)
    return [
      "SCAN_TIMEOUT",
      "SCAN_CONNECTION_FAILED",
      "SCAN_PROVIDER_UNAVAILABLE",
      "SCAN_INVALID_JSON",
      "SCAN_INVALID_RESPONSE",
      "SCAN_OUTPUT_LIMIT",
      "SCAN_INCOMPLETE_RESPONSE",
      "SCAN_INVALID_FIELDS",
      "INVALID_AI_OUTPUT",
      "UPSTREAM_TIMEOUT",
      "UPSTREAM_ERROR",
    ].includes(code);
  return status === 502 || status === 504;
}

export function scanDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// At most two POSTs. Reads recover an already-finished scan after a lost response;
// a pending claim is never replaced by a concurrent provider call.
export async function recoverScan<T>({
  run,
  readState,
  fromResult,
  signal,
  onProgress,
  wait = scanDelay,
}: {
  run: () => Promise<T>;
  readState: () => Promise<ScanState>;
  fromResult: (result: z.infer<typeof ScanDtoSchema>) => T;
  signal: AbortSignal;
  onProgress: (progress: ScanProgress) => void;
  wait?: typeof scanDelay;
}): Promise<T> {
  signal.throwIfAborted();
  onProgress({ stage: "scanning" });
  try {
    return await run();
  } catch (error) {
    signal.throwIfAborted();
    if (!canRecoverScan(error)) throw error;
    onProgress({ stage: "waiting" });
    // A server claim expires after 180 seconds. Poll a little longer so an
    // interrupted worker can release its claim before the single retry.
    for (let poll = 0; poll < 40; poll++) {
      signal.throwIfAborted();
      // A failed status lookup must not trigger another paid attempt.
      const state = await readState().catch(() => {
        throw error;
      });
      if (state.state === "done") return fromResult(state.result);
      if (state.state === "failed" && !state.retryable) throw error;
      if (state.state === "pending") {
        await wait(5_000, signal);
        continue;
      }
      const retryAfter = Math.max(
        state.state === "failed" ? state.retryAfter : 0,
        (error as { code?: string }).code === "REQUEST_IN_PROGRESS"
          ? 0
          : ((error as { retryAfter?: number }).retryAfter ?? 0),
      );
      // Do not silently wait through quota limits or long operator cooldowns.
      if (retryAfter > 60) throw error;
      if (retryAfter > 0) {
        onProgress({
          stage: "waiting",
          retryAt: Date.now() + retryAfter * 1000,
        });
        await wait(retryAfter * 1000 + 250, signal);
      }
      signal.throwIfAborted();
      onProgress({ stage: "retrying" });
      return run();
    }
    throw error;
  }
}
