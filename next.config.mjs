import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app never uses next/image. With `unoptimized`, /_next/image answers 404 before any
  // decoding, which closes the GHSA-2xp9 image-optimizer RCE surface on 14.x.
  images: { unoptimized: true },
  poweredByHeader: false,
  // No page may be framed (clickjacking on one-click admin actions). Pages also get
  // the full nonce-based script CSP from src/proxy.ts; this header covers API
  // responses and static files too.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Without this, Next's build tracing infers the workspace root by walking
  // upward and — on Windows — ends up lstat-ing drive-root reserved files
  // (hiberfil.sys, pagefile.sys, etc.), throwing noisy EINVAL Watchpack errors
  // on every `next dev` start. Pinning the root here stops the upward walk.
  outputFileTracingRoot: __dirname,
  // Keep the headless-browser packages as runtime requires so webpack doesn't
  // try to bundle Chromium's binary/ESM internals.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
