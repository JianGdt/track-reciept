import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { getAuthServer } from "./auth";
import { firebaseAdmin } from "./firebase-admin";
import { listReceipts, listCategories, rateLimit } from "./receipt-repository";
import { LIMITS } from "./limits";
import { legacyReceipt, type Session } from "./vault-client";
import { ReceiptFiltersSchema, today, type ReceiptFilters } from "./shared";

export const currentSession = cache(async (): Promise<Session | null> => {
  const requestHeaders = await headers();
  // Anonymous visits do not need to initialize auth and its database adapter.
  // A cookie's presence is only a hint; getSession still verifies it below.
  if (!getSessionCookie(requestHeaders)) return null;
  const session = await getAuthServer().api.getSession({
    headers: requestHeaders,
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
  const renderDate = today();
  filters.month ||= renderDate.slice(0, 7);
  const session = await currentSession();
  if (!session) return { session: null, filters, renderDate, view: "Receipts" };
  const uid = session.user.id;
  await rateLimit(uid, "reads", LIMITS.readPerMinute, 60_000);
  const [receipts, categories] = await Promise.all([
    listReceipts(uid, filters, 20),
    listCategories(uid),
  ]);
  return {
    session,
    renderDate,
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
