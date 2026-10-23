"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// Every password field: a Show/Hide button (GOV.UK's tested pattern), a Caps Lock hint, and
// the password hidden again on submit so it isn't left on screen. Paste and autocomplete stay
// on, so password managers work (WCAG 2.2 accessible authentication).
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & {
    /** An icon inside the field's left edge (sign-in); the input needs left padding for it. */
    icon?: React.ReactNode;
  }
>(({ className, id, icon, onKeyUp, onBlur, "aria-describedby": describedBy, ...props }, ref) => {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;
  const capsId = `${inputId}-caps`;
  const wrapper = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  // Announce only after a press, so screen readers don't hear "hidden" on every page load.
  const [toggled, setToggled] = React.useState(false);
  const [caps, setCaps] = React.useState(false);

  React.useEffect(() => {
    const form = wrapper.current?.closest("form");
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div ref={wrapper} className="space-y-1.5">
      <div className="relative">
        {icon}
        <Input
          ref={ref}
          id={inputId}
          type={shown ? "text" : "password"}
          // Never auto-capitalise or auto-correct a shown password on phones.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn("pr-20", className)}
          aria-describedby={cn(describedBy, caps && capsId) || undefined}
          onKeyUp={(e) => {
            setCaps(e.getModifierState("CapsLock"));
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCaps(false);
            onBlur?.(e);
          }}
          {...props}
        />
        <button
          type="button"
          aria-controls={inputId}
          aria-pressed={shown}
          onClick={() => {
            setShown((s) => !s);
            setToggled(true);
          }}
          className="absolute top-1/2 right-1 inline-flex h-9 -translate-y-1/2 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden md:h-8"
        >
          {shown ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          {shown ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {toggled ? (shown ? "Your password is shown" : "Your password is hidden") : ""}
      </span>
      {caps && (
        <p id={capsId} className="text-[13px] font-medium text-notice-foreground">
          Caps Lock is on
        </p>
      )}
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
