import * as React from "react";

// Memoises a read for the length of one page render (React cache()), so several
// components asking for the same data share one database trip. Outside a render
// (route handlers, transactions) it simply calls through, so writes always see fresh data.
// shortcut: Next's bundled React 19 has cache(); Jest loads the installed react@18, which
// does not, so tests run uncached. Drop the fallback once package.json moves to React 19.
export const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);
