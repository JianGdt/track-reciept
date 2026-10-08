import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getAuthServer } from "./auth";
import { firebaseAdmin } from "./firebase-admin";
import { listReceipts, listCategories, rateLimit } from "./receipt-repository";
import { LIMITS } from "./limits";
import { scanUsage } from "./scan-guard";
import { legacyReceipt, type Session } from "./vault-client";
import { ReceiptFiltersSchema, type ReceiptFilters } from "./shared";

export const currentSession = cache(async (): Promise<Session | null> => {
  const session = await getAuthServer().api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  const user = await firebaseAdmin()
    .db.collection("users")
    .doc(session.user.id)
    .get();
  if (user.get("deleting")) return null;
  return { user: { id: session.user.id, email: session.user.email } };
});

export async function dashboardData(
  params: Record<string, string | string[] | undefined>,
) {
  const parsed = ReceiptFiltersSchema.safeParse({
    q: params.q,
    month: params.month,
    categoryId: params.categoryId,
  });
  const filters: ReceiptFilters = parsed.success ? parsed.data : {};
  const session = await currentSession();
  if (!session) return { session: null, filters, view: "Receipts" };
  const uid = session.user.id;
  await rateLimit(uid, "reads", LIMITS.readPerMinute, 60_000);
  const [receipts, categories, usage] = await Promise.all([
    listReceipts(uid, filters, 20),
    listCategories(uid),
    scanUsage(uid).catch(() => undefined),
  ]);
  return {
    session,
    usage,
    filters,
    view: ["Reports", "Settings"].includes(String(params.view))
      ? String(params.view)
      : "Receipts",
    receipts: { ...receipts, data: receipts.data.map(legacyReceipt) },
    categories: categories.map((c) => ({
      ...c,
      user_id: "",
      created_at: c.createdAt,
    })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
