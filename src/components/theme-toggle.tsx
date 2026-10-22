"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};
// false on the server and during hydration, true after: the stored theme is only known
// in the browser, so the choice renders unselected until then instead of mismatching.
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

const CHOICES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match device", icon: Monitor },
] as const;

// The Appearance setting on Profile; `compact` is the same choice inside the account menu.
export function ThemeChoice({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1.5">
      {CHOICES.map(({ value, label, icon: Icon }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
              compact ? "px-1 py-2 text-xs" : "px-3 py-3",
              selected
                ? "border-brand-600 bg-brand-50 font-medium text-brand-900"
                : "border-border text-foreground/80 hover:bg-brand-50/60"
            )}
          >
            <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
            {compact && value === "system" ? "Device" : label}
          </button>
        );
      })}
    </div>
  );
}

// The sidebar's one-tap switch between light and dark. The icon follows the theme class
// through CSS, so it renders right before hydration.
export function ThemeToggle({
  className,
  labelClassName,
}: {
  className?: string;
  labelClassName?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      title="Light / dark"
      className={className}
    >
      <Moon className="size-4 shrink-0 dark:hidden" strokeWidth={1.6} aria-hidden="true" />
      <Sun className="hidden size-4 shrink-0 dark:block" strokeWidth={1.6} aria-hidden="true" />
      <span className={labelClassName}>
        <span className="dark:hidden">Dark theme</span>
        <span className="hidden dark:inline">Light theme</span>
      </span>
    </button>
  );
}
