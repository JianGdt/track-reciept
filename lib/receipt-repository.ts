import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  Timestamp,
  type Transaction,
  type DocumentData,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  categories,
  ReceiptDtoSchema,
  fromMinor,
  toMinor,
  IdSchema,
  DateSchema,
  type ReceiptDto,
  type ReceiptFilters,
  type CreateReceipt,
  type ScanDto,
} from "@/lib/shared";
import { firebaseAdmin } from "./firebase-admin";
import { ServiceError } from "./service-error";
import type { Claim, ClaimStore } from "./idempotency";
import { LIMITS } from "./limits";

const iso = (value: unknown) =>
  value instanceof Timestamp
    ? value.toDate().toISOString()
    : typeof value === "string"
      ? value
      : "";
export const userCollection = (uid: string, name: string) =>
  firebaseAdmin().db.collection("users").doc(uid).collection(name);
export async function requireActiveAccount(tx: Transaction, uid: string) {
  const user = await tx.get(firebaseAdmin().db.collection("users").doc(uid));
  if (user.get("deleting"))
    throw new ServiceError(403, "Account deletion is in progress.");
}
export async function saveDraft(uid: string, id: string, data: DocumentData) {
  await firebaseAdmin().db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const ref = userCollection(uid, "drafts").doc(id);
    const draft = await tx.get(ref);
    const receipt = await tx.get(userCollection(uid, "receipts").doc(id));
    if (draft.get("deleted") || receipt.exists)
      throw new ServiceError(
        409,
        "This receipt was saved or deleted. Start a new receipt.",
      );
    tx.set(ref, data, { merge: true });
  });
}
export const defaultCategories = categories.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name,
  color: ["#dca446", "#659879", "#769ad0", "#cb8172", "#9296a5"][i],
  createdAt: "",
}));

// Read legacy rows without a destructive database migration. New writes store
// integer money and retain purchase_date only as a backwards-compatible index.
export function decodeReceipt(id: string, data: DocumentData): ReceiptDto {
  return ReceiptDtoSchema.parse({
    id,
    merchant: data.merchant,
    purchaseDate:
      data.purchaseDate instanceof Timestamp
        ? data.purchaseDate.toDate().toISOString().slice(0, 10)
        : (data.purchaseDate ?? data.purchase_date),
    totalMinor: data.totalMinor ?? toMinor(data.total_amount, data.currency),
    currency: data.currency,
    categoryId: data.categoryId ?? data.category_id ?? null,
    paymentMethod: data.paymentMethod ?? data.payment_method ?? "",
    notes: data.notes ?? "",
    hasPhoto: Boolean(data.imagePath ?? data.image_path),
    scanStatus: data.scanStatus ?? data.scan_status ?? "manual",
    createdAt: iso(data.createdAt ?? data.created_at),
    updatedAt: iso(data.updatedAt ?? data.updated_at),
  });
}
const CursorSchema = z
  .object({ date: DateSchema, id: IdSchema, scope: z.string().length(64) })
  .strict();
const scope = (uid: string, filters: ReceiptFilters) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        uid,
        filters.month ?? "",
        filters.categoryId ?? "",
        filters.q ?? "",
        filters.currency ?? "",
      ]),
    )
    .digest("hex");
export function matches(receipt: ReceiptDto, filters: ReceiptFilters) {
  return (
    (!filters.month || receipt.purchaseDate.startsWith(filters.month)) &&
    (!filters.categoryId || receipt.categoryId === filters.categoryId) &&
    (!filters.currency || receipt.currency === filters.currency) &&
    (!filters.q ||
      receipt.merchant.toLowerCase().includes(filters.q.toLowerCase()))
  );
}
export async function listReceipts(
  uid: string,
  filters: ReceiptFilters,
  limit: number,
  cursor?: string,
) {
  let query = userCollection(uid, "receipts")
    .orderBy("purchase_date", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    let parsed;
    try {
      parsed = CursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString()),
      );
    } catch {
      throw new ServiceError(400, "Invalid page cursor.");
    }
    if (parsed.scope !== scope(uid, filters))
      throw new ServiceError(
        400,
        "The page cursor does not match these filters.",
      );
    query = query.startAfter(parsed.date, parsed.id);
  }
  // Bound work even for sparse substring matches; a page can be empty with a
  // next cursor. Clients must use nextCursor rather than data.length to stop.
  if (filters.month)
    query = query
      .where("purchase_date", ">=", `${filters.month}-01`)
      .where("purchase_date", "<=", `${filters.month}-31`);
  const scanLimit =
    filters.q || filters.categoryId || filters.currency ? 200 : limit;
  const snapshot = await query
    .select(
      "merchant",
      "purchaseDate",
      "purchase_date",
      "totalMinor",
      "total_amount",
      "currency",
      "categoryId",
      "category_id",
      "paymentMethod",
      "payment_method",
      "notes",
      "imagePath",
      "image_path",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
      "scanStatus",
      "scan_status",
      "deleting",
    )
    .limit(scanLimit + 1)
    .get();
  const data: ReceiptDto[] = [];
  let last: ReceiptDto | undefined;
  let index = 0;
  for (const doc of snapshot.docs.slice(0, scanLimit)) {
    index++;
    const row = decodeReceipt(doc.id, doc.data());
    last = row;
    if (!doc.get("deleting") && matches(row, filters)) data.push(row);
    if (data.length === limit) break;
  }
  const hasMore = index < snapshot.size;
  return {
    data,
    page: {
      limit,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                date: last.purchaseDate,
                id: last.id,
                scope: scope(uid, filters),
              }),
            ).toString("base64url")
          : null,
    },
  };
}
export async function receiptDocument(uid: string, id: string) {
  const doc = await userCollection(uid, "receipts").doc(id).get();
  if (!doc.exists || doc.get("deleting"))
    throw new ServiceError(404, "Receipt not found.");
  return doc;
}
export async function listCategories(uid: string) {
  const docs = await userCollection(uid, "categories").limit(101).get();
  if (docs.size > 100) throw new ServiceError(422, "Category limit exceeded.");
  const result = new Map(defaultCategories.map((c) => [c.id, c]));
  for (const doc of docs.docs) {
    if (doc.get("deleted")) {
      result.delete(doc.id);
      continue;
    }
    result.set(doc.id, {
      id: doc.id,
      name: doc.get("name"),
      color: doc.get("color") ?? null,
      createdAt: iso(doc.get("createdAt") ?? doc.get("created_at")),
    });
  }
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export async function saveReceipt(
  uid: string,
  id: string,
  input: CreateReceipt | Partial<CreateReceipt>,
  existing: boolean,
) {
  const db = firebaseAdmin().db;
  return db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const ref = userCollection(uid, "receipts").doc(id);
    const old = await tx.get(ref);
    if (old.get("deleting"))
      throw new ServiceError(409, "This receipt is being deleted.");
    if (existing && !old.exists)
      throw new ServiceError(404, "Receipt not found.");
    const previous = old.exists ? decodeReceipt(id, old.data()!) : null;
    const candidate = { ...previous, ...input };
    if (candidate.categoryId) {
      const cat = await tx.get(
        userCollection(uid, "categories").doc(candidate.categoryId),
      );
      if (
        cat.get("deleted") ||
        (!cat.exists &&
          !defaultCategories.some((c) => c.id === candidate.categoryId))
      )
        throw new ServiceError(422, "Choose a valid category.");
    }
    const draft = await tx.get(userCollection(uid, "drafts").doc(id));
    if (!existing && draft.get("deleted"))
      throw new ServiceError(
        409,
        "This receipt was deleted. Start a new receipt.",
      );
    const now = new Date().toISOString();
    if (!existing && old.exists) {
      if (old.get("createFingerprint") === fingerprint(input)) return previous!;
      throw new ServiceError(
        409,
        "This receipt ID is already used for different data.",
      );
    }
    if (!existing && candidate.hasPhoto && !draft.get("uploaded"))
      throw new ServiceError(422, "Upload your photo before saving.");
    let receiptCount: number | undefined;
    const profileRef = firebaseAdmin().db.collection("users").doc(uid);
    if (!old.exists) {
      const profile = await tx.get(profileRef);
      receiptCount = profile.get("receiptCount");
      if (receiptCount === undefined) {
        // One-time initialization for existing accounts, under the same transaction.
        receiptCount = (
          await tx.get(
            userCollection(uid, "receipts").select().limit(LIMITS.maxReceipts),
          )
        ).size;
      }
      if (!Number.isSafeInteger(receiptCount) || receiptCount! < 0)
        throw new ServiceError(
          503,
          "Could not check receipt capacity. Please retry.",
        );
      if (receiptCount! >= LIMITS.maxReceipts)
        throw new ServiceError(
          409,
          "Your vault has reached 2,000 receipts. Delete an old receipt before adding another.",
          "RECEIPT_LIMIT_REACHED",
        );
    }
    const result = ReceiptDtoSchema.parse({
      ...candidate,
      id,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      scanStatus:
        previous?.scanStatus ?? (draft.get("scan") ? "scanned" : "manual"),
    });
    // Never accept storage paths, AI results, owner or timestamps from callers.
    const imagePath = result.hasPhoto ? `receipts/${uid}/${id}.jpg` : null;
    tx.set(ref, {
      ...result,
      imagePath,
      purchaseDate: Timestamp.fromDate(
        new Date(`${result.purchaseDate}T00:00:00Z`),
      ),
      createdAt: Timestamp.fromDate(new Date(result.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(result.updatedAt)),
      scanConfidence:
        old.get("scanConfidence") ?? draft.get("scan")?.confidence ?? null,
      purchase_date: result.purchaseDate,
      merchantLower: result.merchant.toLowerCase(),
      purchaseMonth: result.purchaseDate.slice(0, 7),
      createFingerprint: old.get("createFingerprint") ?? fingerprint(input),
    });
    tx.delete(userCollection(uid, "drafts").doc(id));
    if (receiptCount !== undefined)
      tx.set(profileRef, { receiptCount: receiptCount + 1 }, { merge: true });
    return result;
  });
}
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function claimStore<T>(uid: string): ClaimStore<T> {
  const collection = userCollection(uid, "requests");
  const leaseId = randomUUID();
  return {
    claim: (key, hash, now) =>
      firebaseAdmin().db.runTransaction(async (tx) => {
        await requireActiveAccount(tx, uid);
        const ref = collection.doc(key);
        const snapshot = await tx.get(ref);
        const previous = snapshot.data() as Claim<T> | undefined;
        if (previous && previous.expiresAt > now) return previous;
        tx.set(ref, {
          state: "pending",
          leaseId,
          fingerprint: hash,
          expiresAt: now + 180_000,
          deleteAfter: Timestamp.fromMillis(now + 86_400_000),
        });
        return null;
      }),
    finish: async (key, claim) => {
      await firebaseAdmin().db.runTransaction(async (tx) => {
        await requireActiveAccount(tx, uid);
        const previous = await tx.get(collection.doc(key));
        if (!previous.exists || previous.get("leaseId") !== leaseId) return;
        tx.set(collection.doc(key), {
          leaseId,
          ...claim,
          deleteAfter: Timestamp.fromMillis(claim.expiresAt + 86_400_000),
        });
      });
    },
  };
}
export async function rateLimit(
  uid: string,
  group: string,
  limit: number,
  windowMs: number,
) {
  return firebaseAdmin().db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const ref = userCollection(uid, "limits").doc(group);
    const doc = await tx.get(ref);
    const now = Date.now();
    const start = Number(doc.get("start") ?? now);
    const reset = start + windowMs <= now;
    const count = reset ? 0 : Number(doc.get("count") ?? 0);
    if (
      !Number.isFinite(start) ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count >= limit
    )
      throw new ServiceError(
        429,
        "Too many requests. Please try again later.",
        "RATE_LIMITED",
        Number.isFinite(start)
          ? Math.max(1, Math.ceil((start + windowMs - now) / 1000))
          : 60,
        {
          limit,
          remaining: 0,
          reset: Math.ceil(
            (Number.isFinite(start) ? start + windowMs : now + windowMs) / 1000,
          ),
        },
      );
    tx.set(ref, { start: reset ? now : start, count: count + 1 });
    return {
      limit,
      remaining: limit - count - 1,
      reset: Math.ceil(((reset ? now : start) + windowMs) / 1000),
    };
  });
}

export async function writeCategory(
  uid: string,
  id: string,
  input: { name: string; color: string | null },
  existing: boolean,
) {
  return firebaseAdmin().db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const collection = userCollection(uid, "categories");
    const docs = await tx.get(collection.limit(101));
    const old = docs.docs.find((doc) => doc.id === id);
    const fallback = defaultCategories.find((c) => c.id === id);
    if (existing && ((!old && !fallback) || old?.get("deleted")))
      throw new ServiceError(404, "Category not found.");
    if (!existing && (old || fallback)) {
      if (old?.get("name") === input.name && old?.get("color") === input.color)
        return { id, ...input, createdAt: iso(old.get("createdAt")) };
      throw new ServiceError(409, "Category already exists.");
    }
    if (!existing && docs.size >= 95)
      throw new ServiceError(422, "You can have up to 100 categories.");
    const result = {
      id,
      ...input,
      createdAt:
        iso(old?.get("createdAt") ?? old?.get("created_at")) ||
        new Date().toISOString(),
    };
    tx.set(collection.doc(id), result);
    return result;
  });
}
export async function deleteCategory(uid: string, id: string) {
  await firebaseAdmin().db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const ref = userCollection(uid, "categories").doc(id);
    const old = await tx.get(ref);
    const collection = userCollection(uid, "receipts");
    const [current, legacy] = await Promise.all([
      tx.get(collection.where("categoryId", "==", id).limit(1)),
      tx.get(collection.where("category_id", "==", id).limit(1)),
    ]);
    if (!current.empty || !legacy.empty)
      throw new ServiceError(
        409,
        "Reassign this category's receipts before deleting it.",
      );
    if (old.exists || defaultCategories.some((c) => c.id === id))
      tx.set(ref, { deleted: true });
  });
}
