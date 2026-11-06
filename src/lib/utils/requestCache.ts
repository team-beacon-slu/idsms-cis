import { cache } from "react";

// Memoises a read for the length of one page render (React cache()), so several
// components asking for the same data share one database trip. Outside a render
// (route handlers, transactions, tests) it simply calls through, so writes always see fresh data.
export const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T = cache;
