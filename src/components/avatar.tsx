import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils/displayName";

// Initials on the beacon navy, never a photo: a photo is personal data (RA 10173) and adds
// nothing to monitoring, while initials still make the account recognisable at a glance.
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full btn-glow text-[13px] font-semibold tracking-wide text-white ring-2 ring-white/70 dark:ring-white/10",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
