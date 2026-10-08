import { ServiceError } from "./service-error";
export type Claim<T> = {
  state: "pending" | "done" | "failed";
  fingerprint: string;
  expiresAt: number;
  value?: T;
  error?: { status: number; message: string; code?: string };
};
export interface ClaimStore<T> {
  claim(
    key: string,
    fingerprint: string,
    now: number,
  ): Promise<Claim<T> | null>;
  finish(key: string, claim: Claim<T>): Promise<void>;
}
export async function once<T>(
  store: ClaimStore<T>,
  key: string,
  fingerprint: string,
  action: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const previous = await store.claim(key, fingerprint, now);
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new ServiceError(
        409,
        "This idempotency key was used for different data.",
        "IDEMPOTENCY_CONFLICT",
      );
    if (previous.state === "done") return previous.value!;
    if (previous.state === "failed")
      throw new ServiceError(
        previous.error!.status,
        previous.error!.message,
        previous.error!.code,
        Math.max(1, Math.ceil((previous.expiresAt - now) / 1000)),
      );
    throw new ServiceError(
      409,
      "This request is already processing. Please wait before retrying.",
      "REQUEST_IN_PROGRESS",
      180,
    );
  }
  try {
    const value = await action();
    await store.finish(key, {
      state: "done",
      fingerprint,
      value,
      expiresAt: Date.now() + 600_000,
    });
    return value;
  } catch (error) {
    const safe =
      error instanceof ServiceError
        ? error
        : new ServiceError(
            503,
            "The request could not finish. Please retry shortly.",
          );
    await store.finish(key, {
      state: "failed",
      fingerprint,
      expiresAt: Date.now() + 30_000,
      error: {
        status: safe.status,
        message: safe.message,
        code: safe.code ?? "REQUEST_FAILED",
      },
    });
    throw safe;
  }
}
