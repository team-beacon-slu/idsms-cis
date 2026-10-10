import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Without this, Next's build tracing infers the workspace root by walking
  // upward and — on Windows — ends up lstat-ing drive-root reserved files
  // (hiberfil.sys, pagefile.sys, etc.), throwing noisy EINVAL Watchpack errors
  // on every `next dev` start. Pinning the root here stops the upward walk.
  // (Next 14.x still expects this under `experimental`; it moved to top-level in 15+.)
  experimental: {
    outputFileTracingRoot: __dirname,
    // Next 14: keep the headless-browser packages as runtime requires so
    // webpack doesn't try to bundle Chromium's binary/ESM internals.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  },
};

export default nextConfig;
