"use client";

import "./globals.css";

// Replaces the root layout when it fails (e.g. the session lookup), so it renders its own html/body.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground antialiased">
        <div role="alert" className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">IDSMS-CIS couldn&apos;t load</h1>
          <p className="text-sm text-muted-foreground">
            The server or the connection had a problem. Try again in a moment
            {error.digest ? ` (code ${error.digest})` : ""}.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
