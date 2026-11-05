import { readFileSync } from "node:fs";
import path from "node:path";

// SLU's templates are set in Calibri, Cambria and Century Gothic, which the headless
// Chromium on Vercel doesn't have. Carlito and Caladea are metric-compatible stand-ins
// (same widths, so lines break where SLU's do); Didact Gothic is the closest free
// geometric face. Embedded as data URIs so the preview and the PDF need no network.
// The files ship with the trace through outputFileTracingIncludes in next.config.mjs.
const FAMILIES = {
  Calibri: { pkg: "carlito", styles: ["400-normal", "400-italic", "700-normal", "700-italic"] },
  Cambria: { pkg: "caladea", styles: ["400-normal", "400-italic", "700-normal", "700-italic"] },
  "Century Gothic": { pkg: "didact-gothic", styles: ["400-normal"] },
} as const;

export type PrintFamily = keyof typeof FAMILIES;

const cache = new Map<PrintFamily, string>();

// @font-face rules that register each stand-in under the SLU font's own name. Never
// local(): every machine then prints the same glyphs, so line breaks don't drift.
export function fontFaces(...families: PrintFamily[]): string {
  return families
    .map((family) => {
      let css = cache.get(family);
      if (!css) {
        const { pkg, styles } = FAMILIES[family];
        css = styles
          .map((style) => {
            const [weight, fontStyle] = style.split("-");
            const file = path.join(
              process.cwd(),
              "node_modules/@fontsource",
              pkg,
              "files",
              `${pkg}-latin-${style}.woff2`
            );
            const data = readFileSync(file).toString("base64");
            return `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${fontStyle}; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
          })
          .join("\n");
        cache.set(family, css);
      }
      return css;
    })
    .join("\n");
}
