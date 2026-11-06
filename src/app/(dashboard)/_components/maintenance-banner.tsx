import { Megaphone } from "lucide-react";

// NFR-REL-01: the Super Admin's notice (Settings), on every signed-in page.
export function MaintenanceBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50 print:hidden"
    >
      <p className="mx-auto flex max-w-[1480px] items-start gap-2">
        <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
    </div>
  );
}
