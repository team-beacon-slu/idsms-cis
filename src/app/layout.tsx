import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import { connection } from "next/server";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

// The taste sheet's face, self-hosted by next/font (the CSP allows font-src 'self' only).
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  // Every page names itself first, so tabs and history are told apart: "Weekly reports · IDSMS-CIS".
  title: { template: "%s · IDSMS-CIS", default: "IDSMS-CIS" },
  description: "Internship document submission and monitoring for SAMCIS, Saint Louis University",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render every page per request: the CSP nonce from src/proxy.ts only reaches
  // Next's scripts on dynamic renders. A page prerendered at build time (the
  // sign-in pages) would carry no nonce and the CSP would block its scripts.
  await connection();
  // next-themes sets the theme class with an inline script before paint; the CSP only
  // runs it with this request's nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // suppressHydrationWarning: that script adds the theme class before React hydrates.
    <html lang="en" className={`${dmSans.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
