"use client";

import { ThemeProvider } from "next-themes";

// No next-auth SessionProvider: nothing calls useSession (pages read the session on the
// server), and the provider fetched /api/auth/session on every load and tab focus.
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      {children}
    </ThemeProvider>
  );
}
