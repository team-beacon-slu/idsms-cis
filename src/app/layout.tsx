import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "IDSMS-CIS",
  description: "Internship Deployment & Supervision Management System",
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
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
