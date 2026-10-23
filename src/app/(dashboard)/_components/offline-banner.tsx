"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Tells an intern on a weak signal that the connection dropped before they press Save,
// rather than after. The server render assumes online, so nothing flashes on load.
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-50 print:hidden">
      {!online && (
        <p className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          You&apos;re offline. You can keep reading and typing; saving will work again once you
          reconnect.
        </p>
      )}
    </div>
  );
}
