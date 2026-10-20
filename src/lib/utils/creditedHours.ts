// Every hours total in the app reads stored entries through this helper, so
// SLU's crediting rules apply everywhere. Pure (type-only Prisma import).
import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | null | undefined;

export interface CreditableEntry {
  creditedHours?: Num;
  actualHours?: Num;
  scheduledHours?: Num;
  attendanceStatus?: string | null;
}

// The select every hours reader uses, so the fallback has what it needs.
export const CREDITED_HOURS_SELECT = {
  creditedHours: true,
  actualHours: true,
  scheduledHours: true,
  attendanceStatus: true,
} as const;

// Credited hours of one stored entry. Legacy rows (no creditedHours) are
// capped at their scheduled hours: no excess counts without an approved OT.
export function entryCreditedHours(e: CreditableEntry): number {
  if (e.creditedHours != null) return Number(e.creditedHours);
  if (e.attendanceStatus === "ABSENT" || e.attendanceStatus === "HOLIDAY") return 0;
  const cap = e.scheduledHours != null ? Number(e.scheduledHours) : Infinity;
  return Math.min(Number(e.actualHours ?? 0), cap);
}

export function sumCreditedHours(entries: CreditableEntry[]): number {
  return Math.round(entries.reduce((sum, e) => sum + entryCreditedHours(e), 0) * 100) / 100;
}
