"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden";

type Option = { id: string; label: string };

function useSubmit() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  async function run(url: string, init: Parameters<typeof sendJson>[1], success: string) {
    setIsPending(true);
    const res = await sendJson(url, init);
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return (res.body ?? {}) as { id?: string };
  }
  return { isPending, run };
}

// "BSCS 4B" -> "BSCS": the program a section name starts with, if it is one.
export function programFromName(name: string, programs: string[]): string | undefined {
  const head = name.trim().toUpperCase().split(/[\s-]/)[0];
  return programs.find((p) => p === head);
}

// Efficiency item 28: name + adviser is enough. Dates come from the active semester, the
// program from the name (until picked by hand), and the adviser is assigned for that semester.
export function NewClassGroupForm({
  programs,
  advisers = [],
  activeSemester,
}: {
  programs: string[];
  advisers?: Option[];
  activeSemester?: { id: string; startDate: string; endDate: string };
}) {
  const { isPending, run } = useSubmit();
  const [form, setForm] = useState({
    name: "",
    program: programs[0],
    classType: "Regular",
    startDate: activeSemester?.startDate ?? "",
    endDate: activeSemester?.endDate ?? "",
  });
  const [programPicked, setProgramPicked] = useState(false);
  const [facultyId, setFacultyId] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const created = await run(
      "/api/class-groups",
      { method: "POST", body: form },
      `${form.name.trim()} created`
    );
    if (!created) return;
    if (facultyId && activeSemester && created.id) {
      await run(
        `/api/class-groups/${created.id}/advisers`,
        { method: "POST", body: { facultyId, semesterId: activeSemester.id } },
        "Adviser assigned"
      );
    }
    setForm((f) => ({ ...f, name: "" }));
    setProgramPicked(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cg-name">Name</Label>
        <Input
          id="cg-name"
          required
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            const program = programPicked ? undefined : programFromName(name, programs);
            setForm((f) => ({ ...f, name, ...(program && { program }) }));
          }}
          placeholder="BSIT 4A"
        />
      </div>
      {advisers.length > 0 && activeSemester && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="cg-adviser">Adviser (this semester)</Label>
          <select
            id="cg-adviser"
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            className={selectClass}
          >
            <option value="">Assign later</option>
            {advisers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="cg-program">Program</Label>
        <select
          id="cg-program"
          value={form.program}
          onChange={(e) => {
            setProgramPicked(true);
            set("program")(e);
          }}
          className={selectClass}
        >
          {programs.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cg-type">Class type</Label>
        <Input id="cg-type" required value={form.classType} onChange={set("classType")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cg-start">Starts</Label>
        <Input
          id="cg-start"
          type="date"
          required
          value={form.startDate}
          onChange={set("startDate")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cg-end">Ends</Label>
        <Input id="cg-end" type="date" required value={form.endDate} onChange={set("endDate")} />
      </div>
      <div className="sm:col-span-6">
        <Button type="submit" disabled={isPending} className="cursor-pointer gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          {isPending ? "Creating..." : "Create class group"}
        </Button>
      </div>
    </form>
  );
}

export function AssignAdviserForm({
  classGroupId,
  advisers,
  semesters,
  defaultSemesterId,
}: {
  classGroupId: string;
  advisers: Option[];
  semesters: Option[];
  defaultSemesterId?: string;
}) {
  const { isPending, run } = useSubmit();
  const [facultyId, setFacultyId] = useState(advisers.length === 1 ? advisers[0].id : "");
  const [semesterId, setSemesterId] = useState(defaultSemesterId ?? semesters[0]?.id ?? "");

  if (advisers.length === 0 || semesters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {advisers.length === 0
          ? "No faculty adviser accounts yet. A super admin creates them on the Users page."
          : "No open semester. Create one on the Semesters page first."}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          `/api/class-groups/${classGroupId}/advisers`,
          { method: "POST", body: { facultyId, semesterId } },
          "Adviser assigned"
        );
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor={`adviser-${classGroupId}`} className="text-xs text-muted-foreground">
          Adviser
        </Label>
        <select
          id={`adviser-${classGroupId}`}
          value={facultyId}
          onChange={(e) => setFacultyId(e.target.value)}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Choose an adviser
          </option>
          {advisers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1 sm:w-56">
        <Label htmlFor={`semester-${classGroupId}`} className="text-xs text-muted-foreground">
          Semester
        </Label>
        <select
          id={`semester-${classGroupId}`}
          value={semesterId}
          onChange={(e) => setSemesterId(e.target.value)}
          className={selectClass}
        >
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={isPending}
        className="cursor-pointer gap-1.5"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        Assign
      </Button>
    </form>
  );
}

export function RemoveAdviserButton({
  assignmentId,
  label,
}: {
  assignmentId: string;
  label: string;
}) {
  const { isPending, run } = useSubmit();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        void run(
          `/api/class-group-advisers/${assignmentId}`,
          { method: "DELETE" },
          "Adviser removed"
        )
      }
      className="cursor-pointer gap-1 text-muted-foreground"
    >
      <X className="size-3.5" aria-hidden="true" />
      Remove<span className="sr-only"> {label}</span>
    </Button>
  );
}

// Rename inline; delete asks for a second click instead of a browser dialog.
export function ClassGroupActions({
  classGroupId,
  name,
  internCount,
}: {
  classGroupId: string;
  name: string;
  internCount: number;
}) {
  const { isPending, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            `/api/class-groups/${classGroupId}`,
            { method: "PATCH", body: { name: draft } },
            "Class group renamed"
          );
          if (ok) setEditing(false);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <Label htmlFor={`rename-${classGroupId}`} className="sr-only">
          New name
        </Label>
        <Input
          id={`rename-${classGroupId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoFocus
          required
          className="h-8 w-44"
        />
        <Button type="submit" size="sm" disabled={isPending} className="cursor-pointer">
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(name);
            setEditing(false);
          }}
          className="cursor-pointer"
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        className="cursor-pointer gap-1 text-muted-foreground"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Rename<span className="sr-only"> {name}</span>
      </Button>
      {internCount > 0 ? (
        <span className="px-2 text-xs text-muted-foreground">
          Has interns, so it can&apos;t be deleted
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            void run(`/api/class-groups/${classGroupId}`, { method: "DELETE" }, `${name} deleted`);
          }}
          onBlur={() => setConfirming(false)}
          className="cursor-pointer gap-1 text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {confirming ? "Click again to delete" : "Delete"}
          <span className="sr-only"> {name}</span>
        </Button>
      )}
    </div>
  );
}

// Efficiency item 29: one click gives the active semester last semester's advisers.
export function CopyAdvisersButton({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  async function copy() {
    setIsPending(true);
    const res = await sendJson("/api/class-groups/copy-advisers", {
      method: "POST",
      body: { semesterId },
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const copied = Number(res.body.copied);
    toast.success(
      res.body.fromSemesterId
        ? `${copied} ${copied === 1 ? "assignment" : "assignments"} copied`
        : "No earlier semester has adviser assignments"
    );
    router.refresh();
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={copy}
      className="cursor-pointer gap-1.5"
    >
      <UserPlus className="size-4" aria-hidden="true" />
      {isPending ? "Copying..." : "Copy adviser assignments from last semester"}
    </Button>
  );
}
