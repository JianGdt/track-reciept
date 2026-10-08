"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="route-state">
      <h1>Something interrupted your vault.</h1>
      <p>Please try again. Your saved receipts are still in your account.</p>
      {error.digest && <small>Reference: {error.digest}</small>}
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
