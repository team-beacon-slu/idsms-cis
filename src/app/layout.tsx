import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: "IDSMS-CIS",
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
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
