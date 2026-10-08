import Link from "next/link";
export default function NotFound() {
  return (
    <main className="route-state">
      <h1>We couldn’t find that page.</h1>
      <p>Return to your vault to browse your receipts.</p>
      <Link href="/">Back to receipts</Link>
    </main>
  );
}
