import {
  ReceiptPageSchema,
  CategoryPageSchema,
  ReportSchema,
  ScanDtoSchema,
  ReceiptDtoSchema,
  CreateReceiptSchema,
  fromMinor,
  toMinor,
  type Category,
  type Receipt,
  type ReceiptDto,
  type ReceiptFilters,
} from "@/lib/shared";
import { ScanStateSchema } from "../scan-recovery";
export class VaultError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public requestId?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function legacyReceipt(row: ReceiptDto): Receipt {
  return {
    id: row.id,
    user_id: "",
    merchant: row.merchant,
    purchase_date: row.purchaseDate,
    total_amount: fromMinor(row.totalMinor, row.currency),
    currency: row.currency,
    category_id: row.categoryId,
    payment_method: row.paymentMethod,
    notes: row.notes,
    image_path: row.hasPhoto ? row.id : null,
    scan_status: row.scanStatus,
    scan_raw: null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
const queryString = (filters: Record<string, unknown>) =>
  new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
const photoId = (path: string) =>
  path
    .split("/")
    .at(-1)!
    .replace(/\.jpg$/, "");
export type Session = { user: { id: string; email: string | null } };
type AuthResult = { error: { message?: string } | null };
export type AuthPort = {
  getSession: () => Promise<{
    data: Session | null;
    error?: { message?: string } | null;
  }>;
  signIn: {
    email: (data: { email: string; password: string }) => Promise<AuthResult>;
  };
  signUp: {
    email: (data: {
      name: string;
      email: string;
      password: string;
    }) => Promise<AuthResult>;
  };
  signOut: () => Promise<AuthResult>;
  deleteUser?: (data: { password: string }) => Promise<AuthResult>;
};
export function createVaultClient(authClient: AuthPort, apiBaseUrl = "") {
  const listeners = new Set<(session: Session | null) => void>();
  let sessionRequest: Promise<Session | null> | undefined;
  let lastSession: Session | null = null;
  let sessionAt = 0;
  function refreshSession(force = false): Promise<Session | null> {
    if (sessionRequest) return sessionRequest;
    if (!force && Date.now() - sessionAt < 300_000) {
      listeners.forEach((fn) => fn(lastSession));
      return Promise.resolve(lastSession);
    }
    sessionRequest = authClient
      .getSession()
      .then((result) => {
        if (result.error) throw new Error("Could not check your session.");
        lastSession = result.data ?? null;
        sessionAt = Date.now();
        listeners.forEach((fn) => fn(lastSession));
        return lastSession;
      })
      .finally(() => {
        sessionRequest = undefined;
      });
    return sessionRequest;
  }
  async function authAction(action: () => Promise<AuthResult>) {
    try {
      const result = await action();
      if (result.error)
        return {
          error: new Error(
            result.error.message ?? "Could not sign in. Try again.",
          ),
        };
      sessionAt = 0;
      if (sessionRequest) await sessionRequest.catch(() => undefined);
      await refreshSession(true);
      return { error: null };
    } catch {
      return { error: new Error("Could not connect. Please try again.") };
    }
  }
  async function request(
    path: string,
    options: RequestInit = {},
    text = false,
  ) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)])
        : AbortSignal.timeout(60_000),
      credentials: "include",
      headers: {
        ...options.headers,
      },
    }).catch((error: unknown) => {
      if (options.signal?.aborted || path !== "/api/v1/receipts/scan")
        throw error;
      const timedOut =
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name);
      throw new VaultError(
        "The scanner could not finish. Your photo is uploaded. You can enter the details below and save, or try scanning again.",
        timedOut ? 504 : 502,
        timedOut ? "SCAN_TIMEOUT" : "SCAN_CONNECTION_FAILED",
      );
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        sessionAt = 0;
        void refreshSession(true).catch(() => undefined);
      }
      throw new VaultError(
        result.error?.message ??
          (typeof result.error === "string"
            ? result.error
            : path === "/api/v1/receipts/scan" && response.status === 504
              ? "Reading this receipt took too long. Your photo is uploaded. You can enter the details below and save, or try scanning again."
              : "Request failed. Please try again."),
        response.status,
        result.error?.code,
        result.error?.requestId,
        Number(response.headers.get("retry-after")) || undefined,
      );
    }
    if (response.status === 204) return null;
    return text ? response.text() : response.json();
  }
  const scans = new Map<string, Promise<unknown>>();
  return {
    auth: {
      primeSession(session: Session | null) {
        lastSession = session;
        sessionAt = Date.now();
      },
      watch(callback: (session: Session | null) => void) {
        listeners.add(callback);
        void refreshSession().catch(() => callback(null));
        return () => {
          listeners.delete(callback);
        };
      },
      refresh: refreshSession,
      signUp: ({ email, password }: { email: string; password: string }) =>
        authAction(() =>
          authClient.signUp.email({
            email,
            password,
            name: email.split("@")[0] || "Receipt owner",
          }),
        ),
      signInWithPassword: ({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) => authAction(() => authClient.signIn.email({ email, password })),
      signOut: () => authAction(() => authClient.signOut()),
      deleteAccount: (password: string) =>
        authAction(() => {
          if (!authClient.deleteUser)
            throw new Error("Account deletion is unavailable.");
          return authClient.deleteUser({ password });
        }),
    },
    listReceipts: async (filters: ReceiptFilters = {}, cursor?: string) => {
      const result = ReceiptPageSchema.parse(
        await request(
          `/api/v1/receipts?${queryString({ ...filters, cursor })}`,
        ),
      );
      return { ...result, data: result.data.map(legacyReceipt) };
    },
    scanUsage: async () =>
      (await request("/api/v1/receipts/scan/usage")) as {
        used: number;
        limit: number;
        resetsAt: string;
      },
    listCategories: async (): Promise<Category[]> => {
      const result = CategoryPageSchema.parse(
        await request("/api/v1/categories?limit=100"),
      );
      return result.data.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        created_at: c.createdAt,
        user_id: "",
      }));
    },
    report: async (filters: ReceiptFilters = {}) =>
      ReportSchema.parse(
        await request(`/api/v1/reports/monthly?${queryString(filters)}`),
      ),
    exportReceipts: (filters: ReceiptFilters = {}) =>
      request(
        `/api/v1/exports/receipts?${queryString(filters)}`,
        {},
        true,
      ) as Promise<string>,
    async saveReceipt(receipt: Receipt, existing: boolean) {
      const body = CreateReceiptSchema.parse({
        id: receipt.id,
        merchant: receipt.merchant,
        purchaseDate: receipt.purchase_date,
        totalMinor: toMinor(receipt.total_amount, receipt.currency),
        currency: receipt.currency,
        categoryId: receipt.category_id,
        paymentMethod: receipt.payment_method,
        notes: receipt.notes,
        hasPhoto: Boolean(receipt.image_path),
      });
      const { id, hasPhoto, ...fields } = body;
      ReceiptDtoSchema.parse(
        await request(
          existing ? `/api/v1/receipts/${id}` : "/api/v1/receipts",
          {
            method: existing ? "PATCH" : "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": id,
            },
            body: JSON.stringify(existing ? fields : body),
          },
        ),
      );
    },
    deleteReceipt: (id: string) =>
      request(`/api/v1/receipts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    uploadPhoto: (
      path: string,
      data: Blob | ArrayBuffer,
      signal?: AbortSignal,
    ) =>
      request(`/api/v1/receipts/${encodeURIComponent(photoId(path))}/photo`, {
        method: "PUT",
        signal,
        headers: { "Content-Type": "image/jpeg" },
        body: data,
      }),
    async photoUrl(path: string): Promise<string> {
      const result = await request(
        `/api/v1/receipts/${encodeURIComponent(photoId(path))}/photo?format=json`,
        { cache: "no-store" },
      );
      if (typeof result.url !== "string" || !result.url.startsWith("https://"))
        throw new Error("Invalid photo URL.");
      return result.url;
    },
    scanState: async (receiptId: string, signal?: AbortSignal) =>
      ScanStateSchema.parse(
        await request(
          `/api/v1/receipts/${encodeURIComponent(receiptId)}/scan`,
          { signal },
        ),
      ),
    scan: (receiptId: string, _imagePath?: string, signal?: AbortSignal) => {
      const existing = scans.get(receiptId);
      if (existing) return existing;
      const pending = request("/api/v1/receipts/scan", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": receiptId,
        },
        body: JSON.stringify({ receiptId }),
      })
        .then((value) => {
          const { totalMinor, ...result } = ScanDtoSchema.parse(value);
          return {
            ...result,
            total:
              totalMinor === null
                ? null
                : fromMinor(totalMinor, result.currency),
          };
        })
        .finally(() => scans.delete(receiptId));
      scans.set(receiptId, pending);
      return pending;
    },
  };
}
