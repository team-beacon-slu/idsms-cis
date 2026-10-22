"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronsUpDown, LogOut, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { ThemeChoice } from "@/components/theme-toggle";

export interface AccountIdentity {
  name: string;
  email: string;
  roleLabel: string;
}

const itemClass =
  "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground/85 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-ring";

// "Who am I?" answered where the navigation lives: the sidebar footer shows the person, and
// opens the account menu (identity, settings, theme, sign out). A disclosure, not an ARIA
// menu: it holds links and a radio group, which keep their own keyboard behaviour.
export function AccountMenu({ identity, rail }: { identity: AccountIdentity; rail: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Close when the route changes (adjusting state during render, not in an effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title={rail ? `${identity.name} · ${identity.roleLabel}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring",
          rail && "justify-center",
          open && "bg-brand-50"
        )}
      >
        <Avatar name={identity.name} />
        <span className={cn("min-w-0 flex-1", rail && "sr-only")}>
          <span className="block truncate text-sm font-semibold text-sidebar-foreground">
            {identity.name}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/65">
            {identity.roleLabel}
          </span>
        </span>
        {!rail && (
          <ChevronsUpDown
            className="size-4 shrink-0 text-sidebar-foreground/50"
            aria-hidden="true"
          />
        )}
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          id={panelId}
          className={cn(
            "absolute z-50 w-72 space-y-1 rounded-2xl glass-strong p-2",
            rail ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2"
          )}
        >
          <div className="flex items-center gap-3 border-b border-border px-2 pt-1 pb-3">
            <Avatar name={identity.name} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{identity.name}</p>
              <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
              <p className="mt-0.5 text-xs font-medium text-brand-700">{identity.roleLabel}</p>
            </div>
          </div>
          <Link href="/profile" className={itemClass}>
            <UserCog className="size-4 shrink-0" aria-hidden="true" />
            Account settings
          </Link>
          <div className="px-1 py-1.5">
            <p className="px-1.5 pb-1.5 text-xs text-muted-foreground">Theme</p>
            <ThemeChoice compact />
          </div>
          <div className="border-t border-border pt-1">
            <button
              type="button"
              className={itemClass}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
