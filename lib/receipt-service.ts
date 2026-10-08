import "server-only";
import {
  fromMinor,
  ScanDtoSchema,
  toCsv,
  type CreateReceipt,
  type ReceiptFilters,
  type Receipt,
  type ScanDto,
} from "@/lib/shared";
import * as repository from "./receipt-repository";
import { photoStorage } from "./storage";
import { photoStorageError } from "./s3-receipts";
import { extractReceipt } from "./gemini";
import { ScanError } from "./gemini-response";
import { ServiceError } from "./service-error";
import { once } from "./idempotency";
import { acquireScanLease, reserveScan } from "./scan-guard";
import { LIMITS } from "./limits";
import { firebaseAdmin } from "./firebase-admin";
import { prepareReceiptImage } from "./receipt-image";

async function storageAction<T>(
  action: (storage: ReturnType<typeof photoStorage>) => Promise<T>,
) {
  try {
    return await action(photoStorage());
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    const safe = photoStorageError(error);
    throw new ServiceError(safe.status, safe.message, "PHOTO_STORAGE_ERROR");
  }
}
export const getReceipt = async (uid: string, id: string) => {
  const doc = await repository.receiptDocument(uid, id);
  return repository.decodeReceipt(id, doc.data()!);
};
export const createReceipt = (uid: string, input: CreateReceipt) =>
  repository.saveReceipt(uid, input.id, input, false);
export const updateReceipt = (
  uid: string,
  id: string,
  input: Partial<CreateReceipt>,
) => repository.saveReceipt(uid, id, input, true);
export async function uploadPhoto(uid: string, id: string, bytes: Buffer) {
  const receipt = await repository
    .userCollection(uid, "receipts")
    .doc(id)
    .get();
  if (receipt.exists)
    throw new ServiceError(409, "This receipt has already been saved.");
  const draft = repository.userCollection(uid, "drafts").doc(id);
  if ((await draft.get()).get("deleted"))
    throw new ServiceError(
      409,
      "This receipt was deleted. Start a new receipt.",
    );
  const { full, thumbnail } = await prepareReceiptImage(bytes);
  await storageAction(async (storage) => {
    await storage.upload(`receipts/${uid}/${id}.jpg`, full);
    await storage.upload(`receipts/${uid}/${id}.thumb.jpg`, thumbnail);
  });
  try {
    await repository.saveDraft(uid, id, {
      uploaded: true,
      imagePath: `receipts/${uid}/${id}.jpg`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // If account cleanup raced this upload, remove the newly uploaded objects.
    if (error instanceof ServiceError && error.status === 403)
      await storageAction(async (storage) => {
        await storage.delete(`receipts/${uid}/${id}.jpg`);
        await storage.delete(`receipts/${uid}/${id}.thumb.jpg`);
      });
    throw error;
  }
}
export async function photoUrl(uid: string, id: string, thumbnail = false) {
  const receipt = await getReceipt(uid, id);
  if (!receipt.hasPhoto) throw new ServiceError(404, "Photo not found.");
  return storageAction(async (storage) => {
    if (thumbnail) {
      try {
        return await storage.url(`receipts/${uid}/${id}.thumb.jpg`);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "status" in error &&
          error.status === 404
        ))
          throw error;
      }
    }
    return storage.url(`receipts/${uid}/${id}.jpg`);
  });
}
export async function deleteReceipt(uid: string, id: string) {
  const ref = repository.userCollection(uid, "receipts").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  // Keep a tombstone on failure so a retry can finish cleanup. Never delete
  // the only record of a private object before storage confirms deletion.
  await ref.update({ deleting: true });
  if (snapshot.get("imagePath") || snapshot.get("image_path"))
    await storageAction(async (storage) => {
      await storage.delete(`receipts/${uid}/${id}.jpg`);
      await storage.delete(`receipts/${uid}/${id}.thumb.jpg`);
    });
  await repository
    .userCollection(uid, "drafts")
    .doc(id)
    .set({ deleted: true, uploaded: false });
  await repository.userCollection(uid, "requests").doc(`scan-${id}`).delete();
  await firebaseAdmin().db.runTransaction(async (tx) => {
    const profile = firebaseAdmin().db.collection("users").doc(uid);
    const [current, user] = await Promise.all([tx.get(ref), tx.get(profile)]);
    if (!current.exists) return;
    const total = user.get("receiptCount");
    if (Number.isSafeInteger(total) && total > 0)
      tx.update(profile, { receiptCount: total - 1 });
    tx.delete(ref);
  });
}
export async function scanReceipt(uid: string, id: string) {
  if (process.env.SCAN_ENABLED === "false")
    throw new ServiceError(
      503,
      "Scanning is temporarily paused. You can enter details manually.",
      "SCAN_DISABLED",
    );
  const draft = repository.userCollection(uid, "drafts").doc(id);
  return once<ScanDto>(
    repository.claimStore(uid),
    `scan-${id}`,
    id,
    async () => {
      const doc = await draft.get();
      if (!doc.get("uploaded") || doc.get("deleted"))
        throw new ServiceError(404, "Upload a receipt photo first.");

      await repository.rateLimit(
        uid,
        "scan-minute",
        LIMITS.scanPerMinute,
        60_000,
      );
      const release = await acquireScanLease(uid);
      let refund: (() => Promise<void>) | undefined;
      try {
        const bytes = await storageAction((storage) =>
          storage.download(`receipts/${uid}/${id}.jpg`),
        );
        refund = await reserveScan(uid);
        let raw;
        try {
          raw = await extractReceipt(bytes);
        } catch (error) {
          if (error instanceof ScanError)
            throw new ServiceError(
              error.status,
              error.message,
              error.code,
              error.retryAfter ?? (error.retryable ? 30 : undefined),
              undefined,
              error.providerStatus,
            );
          throw new ServiceError(
            502,
            "Could not read the receipt. Please retry.",
            "SCAN_FAILED",
          );
        }
        let result: ScanDto;
        try {
          result = ScanDtoSchema.parse(raw);
        } catch {
          throw new ServiceError(
            502,
            "The scanner returned invalid fields. Please retry or enter them manually.",
            "INVALID_AI_OUTPUT",
          );
        }
        await repository.saveDraft(uid, id, { scan: result });
        return result;
      } catch (error) {
        if (
          refund &&
          (!(error instanceof ServiceError) ||
            error.status >= 500 ||
            error.status === 429)
        ) {
          await refund();
        }
        throw error;
      } finally {
        await release().catch(() =>
          console.error(JSON.stringify({ code: "SCAN_LEASE_RELEASE_FAILED" })),
        );
      }
    },
  );
}
async function visitReceipts(
  uid: string,
  filters: ReceiptFilters,
  visit: (row: Awaited<ReturnType<typeof getReceipt>>) => void,
) {
  let cursor: string | undefined;
  // A bounded synchronous report/export. Larger archives require a background
  // export job; never silently report a partial total.
  for (let page = 0; page < 100; page++) {
    const result = await repository.listReceipts(uid, filters, 100, cursor);
    result.data.forEach(visit);
    if (!result.page.nextCursor) return;
    cursor = result.page.nextCursor;
  }
  throw new ServiceError(
    422,
    "This archive is too large for an interactive report. Contact support for an export.",
    "ARCHIVE_TOO_LARGE",
  );
}
export async function report(
  uid: string,
  filters: ReceiptFilters & { currency: string },
) {
  let count = 0,
    totalMinor = 0;
  const categories = new Map<
    string | null,
    { categoryId: string | null; count: number; totalMinor: number }
  >();
  await visitReceipts(uid, { ...filters, currency: undefined }, (row) => {
    count++;
    if (row.currency !== filters.currency) return;
    totalMinor += row.totalMinor;
    if (!Number.isSafeInteger(totalMinor))
      throw new ServiceError(422, "Report total exceeds the supported amount.");
    const category = categories.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      count: 0,
      totalMinor: 0,
    };
    category.count++;
    category.totalMinor += row.totalMinor;
    categories.set(row.categoryId, category);
  });
  return {
    count,
    totalMinor,
    currency: filters.currency,
    categories: [...categories.values()],
  };
}
export async function exportReceipts(uid: string, filters: ReceiptFilters) {
  const rows: Receipt[] = [];
  await visitReceipts(uid, filters, (row) =>
    rows.push({
      id: row.id,
      user_id: uid,
      merchant: row.merchant,
      purchase_date: row.purchaseDate,
      total_amount: fromMinor(row.totalMinor, row.currency),
      currency: row.currency,
      category_id: row.categoryId,
      payment_method: row.paymentMethod,
      notes: row.notes,
      image_path: null,
      scan_status: row.scanStatus,
      scan_raw: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }),
  );
  const cats = await repository.listCategories(uid);
  return (
    "\ufeff" + toCsv(rows, Object.fromEntries(cats.map((c) => [c.id, c.name])))
  );
}
