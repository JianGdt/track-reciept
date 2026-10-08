export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 24px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 20 }}>
        Your receipts and privacy
      </h1>
      <p>
        Resibo’ko stores your account email, receipt photos, store names, dates,
        amounts, categories, payment methods, and notes to organize your
        receipts. Account credentials are handled by Better Auth, records are
        stored in Firebase Firestore, and photos are stored in private,
        access-controlled object storage. Photo links expire after five minutes.
      </p>
      <p style={{ marginBlock: 16 }}>
        When you choose or take a photo for scanning, the image is sent to
        Google Gemini to extract receipt fields. You review and confirm the
        result before a receipt is saved. Google’s handling of that image
        depends on the API service tier; unpaid services may use submitted
        content for product improvement and human review. Read the{" "}
        <a
          href="https://ai.google.dev/gemini-api/terms"
          target="_blank"
          rel="noreferrer"
        >
          Gemini API data terms
        </a>{" "}
        before uploading sensitive information. You can enter a receipt manually
        without sending a photo.
      </p>
      <p style={{ marginBlock: 16 }}>
        You can export receipt details as CSV from the website and delete
        individual receipts with their photos. Deleting your account removes
        receipt records, stored photos (including unfinished uploads), and
        account credentials. A minimal deletion marker is retained to prevent
        in-flight requests from recreating deleted data. Deletion in this app
        does not control any retention by the AI provider.
      </p>
      <p style={{ marginBlock: 16 }}>
        Unfinished photo uploads remain private until account deletion or
        operator cleanup. Operational logs contain request IDs, hashed account
        identifiers, timings, and error codes; they do not include photos,
        passwords, receipt contents, or full AI responses.
      </p>
      <a href="/">Back to your vault</a>
    </main>
  );
}
