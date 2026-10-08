import "server-only";
import { firebaseAdmin } from "./firebase-admin";
import { photoStorage } from "./storage";
export async function deleteAccountData(uid: string) {
  const db = firebaseAdmin().db;
  const user = db.collection("users").doc(uid);
  await user.set({ deleting: true }, { merge: true });
  await photoStorage().deleteUserPhotos(uid);
  // Resumable cleanup: preserve auth until every resource is removed.
  for (const name of [
    "receipts",
    "drafts",
    "categories",
    "requests",
    "limits",
  ]) {
    let finished = false;
    for (let page = 0; page < 100; page++) {
      const docs = await user.collection(name).limit(100).get();
      if (docs.empty) {
        finished = true;
        break;
      }
      const batch = db.batch();
      docs.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    if (!finished) throw new Error("Account cleanup must be retried.");
  }
  await db.collection("_scanLimits").doc(uid).delete();
}
