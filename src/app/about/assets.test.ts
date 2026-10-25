/** @jest-environment node */
import { existsSync } from "fs";
import { join } from "path";

// The page has no backdrop without these renders (scripts/blender/render-all.sh), and a
// missing one only shows in the browser, never in a type check.
it.each(["day", "night", "day-m", "night-m"])("ships all six %s stills", (cut) => {
  for (let i = 0; i < 6; i++) {
    expect(existsSync(join(process.cwd(), "public/about", `beacon-${cut}-${i}.avif`))).toBe(true);
  }
});
