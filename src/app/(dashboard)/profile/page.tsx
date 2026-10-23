import Link from "next/link";
import { KeyRound, Mail, ShieldCheck, IdCard, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserPage, getCurrentSessionToken } from "@/lib/auth/session";
import { countOtherSessions, getUserProfile } from "@/lib/services/userService";
import { getMyDataRequestSummary } from "@/lib/services/dataRequestService";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { FullNameForm } from "./full-name-form";
import { DataRequestCard } from "./data-request-card";
import { SignOutOthersButton } from "./sign-out-others-button";
import { ThemeChoice } from "@/components/theme-toggle";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function humanizeRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });

// Five sections at most (Hick's law): who you are, how IDSMS looks, how your account is
// protected, what you agreed to, and your data. Each has an anchor so it can be linked.
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "data", label: "Your data" },
];

export default async function AccountSettingsPage() {
  const user = await requireUserPage();
  const sessionToken = await getCurrentSessionToken();
  const [profile, dataRequests, otherSessions, consent] = await Promise.all([
    getUserProfile(user.id),
    getMyDataRequestSummary(user.id),
    countOtherSessions(user.id, sessionToken),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { privacyConsentAt: true, privacyConsentVersion: true },
    }),
  ]);
  const isStudent = user.role === "STUDENT_INTERN";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Account settings"
        description="Who you are in IDSMS, how it looks for you, and how your account and data are kept."
      />

      <nav aria-label="Account settings sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-brand-200 px-3 py-1.5 text-sm text-brand-900 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <Card id="profile" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {isStudent
              ? "Your legal name is printed on your endorsement letter."
              : "Your name is shown to students and colleagues on reviews and in the sidebar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FullNameForm
            initial={
              isStudent ? (profile?.studentProfile?.fullName ?? null) : (profile?.fullName ?? null)
            }
            label={
              isStudent ? "Full name (as it should appear on your endorsement letter)" : "Your name"
            }
          />
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 py-3">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email (your sign-in)</p>
                <p className="truncate text-sm font-medium text-foreground">{profile?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-3">
              <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Role</p>
                <div className="mt-0.5">
                  <Badge variant="secondary">{profile ? humanizeRole(profile.role) : "—"}</Badge>
                </div>
              </div>
            </div>
            {profile?.studentProfile && (
              <div className="flex items-center gap-3 py-3">
                <IdCard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Student number</p>
                  <p className="text-sm font-medium text-foreground">
                    {profile.studentProfile.studentNumber}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="appearance" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Saved on this device. Match device follows your computer or phone&apos;s setting. The
            sidebar remembers whether you collapsed it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeChoice />
        </CardContent>
      </Card>

      <Card id="security" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Your password and the devices signed in to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="pb-4">
            <Link
              href="/change-password"
              className="group inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-medium text-primary hover:text-primary/80"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Change password
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="text-sm text-foreground">
              {otherSessions === 0
                ? "Only this device is signed in."
                : `Also signed in on ${otherSessions} other ${otherSessions === 1 ? "device" : "devices"}. On a shared or lab computer, sign them out.`}
            </p>
            {otherSessions > 0 && <SignOutOthersButton />}
          </div>
        </CardContent>
      </Card>

      <Card id="privacy" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>What you agreed to when you started using IDSMS.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">
            {consent?.privacyConsentAt
              ? `You agreed to the data privacy notice on ${fmtDate(consent.privacyConsentAt)}${
                  consent.privacyConsentVersion === PRIVACY_NOTICE_VERSION
                    ? " (the current version)."
                    : ". A newer version will be shown for you to review."
                }`
              : "You haven't agreed to the data privacy notice yet. It is shown when you sign in."}
          </p>
        </CardContent>
      </Card>

      <div id="data" className="scroll-mt-20">
        <DataRequestCard
          open={dataRequests.open ? { dueAt: dataRequests.open.dueAt.toISOString() } : null}
          lastFulfilledAt={dataRequests.lastFulfilledAt?.toISOString() ?? null}
        />
      </div>
    </div>
  );
}
