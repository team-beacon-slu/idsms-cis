import { notFound } from "next/navigation";
import { formatCalendarDate } from "@/lib/documents/html";
import { WORK_MODALITY_LABEL } from "@/lib/utils/labels";
import Link from "next/link";
import { Role } from "@prisma/client";
import { MapPin, Briefcase, User, Phone, ShieldCheck, Plus, Lock } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import {
  ALLOWED_MOA_TRANSITIONS,
  getCompany,
  listMoaRecordsForCompany,
} from "@/lib/services/predeployment/companyService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanyVerifyToggle } from "./company-verify-toggle";
import { CompanyForeignToggle } from "./company-foreign-toggle";
import { MoaStatusActions } from "./moa-status-actions";
import { CompanyReplyForm } from "./company-reply-form";
import {
  getCompanyFeedback,
  MIN_GROUP,
  REPLY_EDITORS,
} from "@/lib/services/predeployment/companyEvaluationService";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function VerificationPill({ isVerified }: { isVerified: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        isVerified
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-slate-200 bg-slate-100 text-slate-700"
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", isVerified ? "bg-green-500" : "bg-slate-400")}
        aria-hidden="true"
      />
      {isVerified ? "Verified" : "Unverified"}
    </span>
  );
}

export default async function CompanyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUserPage();
  const company = await getCompany(params.id);
  if (!company) {
    notFound();
  }

  const isStaff = STAFF_ROLES.includes(user.role);
  // FR-MOA-07: MOA records are restricted to staff — never fetched or shown
  // to a student, not even an empty list.
  const [moaRecords, feedback] = isStaff
    ? await Promise.all([listMoaRecordsForCompany(params.id), getCompanyFeedback(params.id)])
    : [[], null];
  const canReply = REPLY_EDITORS.includes(user.role);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{company.name}</h1>
            <VerificationPill isVerified={company.isVerified} />
            {company.isForeign && (
              <span className="inline-flex items-center rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-900">
                Foreign-owned
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{company.address}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Modality: {WORK_MODALITY_LABEL[company.workModality]}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{company.supervisorName}</span>
            <Phone className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">{company.supervisorContact}</span>
          </div>

          {isStaff && (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                Staff
              </div>
              <div className="flex flex-wrap gap-2">
                <CompanyVerifyToggle companyId={company.id} isVerified={company.isVerified} />
                <CompanyForeignToggle companyId={company.id} isForeign={company.isForeign} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isStaff && (
        <Card className="border-primary/20">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="flex items-center gap-2">
                MOA records
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Staff only
                </span>
              </CardTitle>
            </div>
            <Button asChild size="sm" className="cursor-pointer">
              <Link href={`/companies/${company.id}/moa/new`} className="gap-1.5">
                <Plus className="size-4" aria-hidden="true" />
                Add MOA
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableCaption className="sr-only">MOA records for {company.name}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Valid from</TableHead>
                    <TableHead>Valid to</TableHead>
                    <TableHead>Programs</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moaRecords.map((moa) => (
                    <TableRow key={moa.id}>
                      <TableCell>
                        <StatusBadge status={moa.status} />
                      </TableCell>
                      <TableCell>{formatCalendarDate(new Date(moa.validFrom))}</TableCell>
                      <TableCell>{formatCalendarDate(new Date(moa.validTo))}</TableCell>
                      <TableCell>{moa.programsCovered.join(", ")}</TableCell>
                      <TableCell>
                        <MoaStatusActions
                          moaId={moa.id}
                          nextStatuses={ALLOWED_MOA_TRANSITIONS[moa.status]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {moaRecords.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No MOA records yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {feedback && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="flex items-center gap-2">
                Interns&apos; experience
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Staff only
                </span>
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Facts and ratings appear once {MIN_GROUP} interns are behind them, pooled across
              terms, so no one intern can be singled out. No score or verdict: whether to keep
              partnering is the coordinator&apos;s call.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Facts</h2>
              <p className="text-sm">
                {feedback.internCount === 0
                  ? "No interns placed here yet."
                  : feedback.facts
                    ? `Interns placed: ${feedback.placements.map((p) => `${p.term} (${p.count})`).join(", ")}.`
                    : `Interns placed: ${feedback.internCount}.`}
              </p>
              {feedback.facts ? (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Fact
                    label="Average confirmed hours a week"
                    value={String(feedback.facts.averageWeeklyHours)}
                  />
                  <Fact
                    label="Weekly reports on time"
                    value={
                      feedback.facts.onTimeShare === null ? "—" : `${feedback.facts.onTimeShare}%`
                    }
                  />
                  <Fact
                    label="Approved overtime requests"
                    value={String(feedback.facts.overtime)}
                  />
                  <Fact label="Approved absences" value={String(feedback.facts.absences)} />
                </dl>
              ) : (
                feedback.internCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Shown once {MIN_GROUP} interns have been placed here ({feedback.internCount} so
                    far).
                  </p>
                )
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Interns&apos; ratings</h2>
              {feedback.ratings ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Average of {feedback.ratings.count} evaluations, 1 (very poor) to 5 (very good).
                  </p>
                  <dl className="divide-y rounded-lg border border-border">
                    {feedback.ratings.averages.map((a) => (
                      <div key={a.key} className="flex items-center justify-between gap-4 p-3">
                        <dt className="text-sm">{a.label}</dt>
                        <dd className="text-sm font-semibold tabular-nums">{a.average}</dd>
                      </div>
                    ))}
                  </dl>
                  {feedback.ratings.comments.length > 0 && (
                    <ul className="space-y-2">
                      {feedback.ratings.comments.map((c, i) => (
                        <li key={i} className="rounded-lg bg-muted/40 p-3 text-sm">
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Shown once {MIN_GROUP} interns have evaluated this company (
                  {feedback.evaluationCount} so far).
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Company&apos;s reply</h2>
              {canReply ? (
                <CompanyReplyForm companyId={company.id} current={feedback.reply?.text ?? ""} />
              ) : feedback.reply ? (
                <p className="text-sm">{feedback.reply.text}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No reply recorded.</p>
              )}
              {feedback.reply?.at && (
                <p className="text-xs text-muted-foreground">
                  Recorded {formatCalendarDate(new Date(feedback.reply.at))}
                </p>
              )}
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
