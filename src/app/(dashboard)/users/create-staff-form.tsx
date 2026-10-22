"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STAFF_ROLES = [
  { value: "FACULTY_ADVISER", label: "Faculty adviser" },
  { value: "DEPARTMENT_COORDINATOR", label: "Department coordinator" },
  { value: "SUPER_ADMIN", label: "Super admin" },
] as const;

// POST /api/users existed with no form, so faculty and coordinator accounts could not
// be made in the app. Students still come only from the class-list import.
export function CreateStaffForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(STAFF_ROLES[0].value);
  const [isPending, setIsPending] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    const res = await sendJson("/api/users", {
      method: "POST",
      body: { email: email.trim(), role },
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.status === 409 ? "An account with that email already exists" : res.error);
      return;
    }
    const body = res.body as { user: { email: string }; temporaryPassword: string };
    setCreated({ email: body.user.email, password: body.temporaryPassword });
    setEmail("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="staff-email">Email</Label>
          <Input
            id="staff-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@slu.edu.ph"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden sm:w-56"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={isPending} className="cursor-pointer gap-1.5">
          <UserPlus className="size-4" aria-hidden="true" />
          {isPending ? "Creating..." : "Create account"}
        </Button>
      </form>
      {created && (
        <div
          role="status"
          className="rounded-lg border border-notice-border bg-notice p-4 text-sm text-notice-foreground"
        >
          <p>
            Account created for <span className="font-medium">{created.email}</span>. Give them this
            temporary password; they must change it when they first sign in. It is shown only once.
          </p>
          <p className="mt-2 font-mono text-base text-foreground select-all">{created.password}</p>
        </div>
      )}
    </div>
  );
}
