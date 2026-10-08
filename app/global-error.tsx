"use client";
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "12vh 24px",
          background: "#15191f",
          color: "#f5f4f0",
          fontFamily: "sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, margin: "auto" }}>
          <h1>We couldn’t open your vault.</h1>
          <p>Please reload and try again.</p>
          {error.digest && <p>Reference: {error.digest}</p>}
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      </body>
    </html>
  );
}
