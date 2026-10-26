// The privacy notice and terms of use, in one place: the public /privacy and /terms pages
// render them in full and the sign-in consent dialog shows the key points. Change the text
// here, then bump PRIVACY_NOTICE_VERSION (src/lib/privacy.ts) so everyone agrees again.

export const LEGAL_UPDATED = "23 October 2026";

export const PRIVACY_KEY_POINTS = [
  "SLU SAMCIS collects your name, student number, email, program, host company, attendance, reports and requirement statuses to monitor your internship.",
  "Only you, your faculty adviser, the department coordinator and system administrators see your records.",
  "Records are kept for three years after the semester, then deleted.",
  "You can ask for a copy or a correction of your data at any time from Account settings.",
];

export const TERMS_KEY_POINTS = [
  "Your account is yours alone: don't share your password or sign in for someone else.",
  "Reports and hours must be true; falsifying them is handled under SLU's student and employee codes of conduct.",
  "Staff use interns' records only to monitor their internship and never copy or share them outside IDSMS-CIS.",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-brand-900">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export function PrivacyNoticeBody() {
  return (
    <div className="space-y-6">
      <p className="text-[15px] leading-relaxed text-foreground/90">
        IDSMS-CIS is the internship document submission and monitoring system of the School of
        Accountancy, Management, Computing and Information Studies (SAMCIS), Saint Louis University.
        This notice explains what personal information it processes and why, under the Data Privacy
        Act of 2012 (Republic Act No. 10173) and its implementing rules.
      </p>
      <Section title="Who is responsible">
        <p>
          Saint Louis University, through SAMCIS, is the personal information controller. The
          department coordinator runs the internship program day to day. Questions or requests for
          the SLU Data Protection Officer can be sent through your department coordinator.
        </p>
      </Section>
      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Account details: name, SLU email, role, and for students the student number, program and
            class group.
          </li>
          <li>
            Internship details: host company, work schedule and work plan, attendance and hours,
            daily and weekly reports, monthly and final reports.
          </li>
          <li>
            Requirement statuses: whether each pre-deployment item (for example the medical
            certificate or parent consent) was submitted and approved. The documents themselves stay
            in Google Classroom; IDSMS records only the status.
          </li>
          <li>Leave and time requests, conduct records and the reasons given for them.</li>
          <li>
            Security records: sign-in attempts, the IP address of actions, and an audit log of
            changes.
          </li>
        </ul>
        <p>
          IDSMS does not collect proof of insurance, signed documents or ID photos; those are held
          by SLU offline.
        </p>
      </Section>
      <Section title="Why we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To check internship requirements before deployment and issue endorsement letters.</li>
          <li>To count and confirm internship hours and track weekly reports and deadlines.</li>
          <li>To let faculty advisers review reports and the coordinator monitor compliance.</li>
          <li>To send reminders and notices about deadlines and reviews.</li>
          <li>To keep the system secure and investigate misuse.</li>
        </ul>
        <p>
          The internship is part of your academic program (CHED CMO No. 104, s. 2017), so this
          processing is necessary for SLU to deliver it. We also ask for your agreement when you
          first sign in.
        </p>
      </Section>
      <Section title="Who can see it">
        <p>
          You see your own records. Your faculty adviser sees the records of the interns in their
          class groups. The department coordinator and system administrators see all interns&apos;
          records to run the program. IDSMS does not sell or publish personal information.
        </p>
        <p>
          Service providers process data on SLU&apos;s behalf only to run the system: the server and
          database host, and the email service that sends notifications.
        </p>
        <p>
          <strong>AI assist.</strong> When the department turns it on, AI reads the text of weekly
          reports to give your adviser hints: a day very similar to an earlier one, planned tasks
          not found in your entries, a short set of your own sentences, a phrase worth a look. It
          never decides a grade, an approval or a deduction, and it never rewrites what you wrote.
          Names, emails and phone numbers are removed before any text is sent. On the test (beta)
          version, the text goes to Google Gemini; on SLU&apos;s own server, it stays on SLU
          hardware. You can see your own plan-coverage pointers, ask for a correction through Your
          data, and anyone can turn AI assist off for themselves under Account settings. Hints are
          deleted with the report.
        </p>
      </Section>
      <Section title="Cookies and storage">
        <p>
          IDSMS uses only what it needs to work: a sign-in session cookie, a cookie that remembers
          whether you collapsed the sidebar, and your light or dark theme saved in your browser.
          There are no advertising or tracking cookies, so there is no cookie banner.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          Records are kept for three years after the end of the semester, for academic records and
          audits, then reviewed by an administrator and deleted. Audit logs cannot be edited.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          You have the right to be informed, to access your data, to object, to have inaccurate data
          corrected, to have data erased or blocked when there is no longer a basis to keep it, to
          data portability, and to damages. Use <strong>Request my data</strong> on Account settings
          for a copy (answered within 15 days), correct your name there, and ask your coordinator
          for other corrections. You may also file a complaint with the National Privacy Commission
          (privacy.gov.ph).
        </p>
      </Section>
      <Section title="How we protect it">
        <p>
          Access is limited by role, every change is recorded in an audit log, passwords are stored
          only as hashes, accounts lock after repeated failed sign-ins, and connections are
          encrypted. Exports of personal data require you to confirm your password again.
        </p>
      </Section>
      <Section title="Changes to this notice">
        <p>
          When this notice changes, IDSMS shows it again at your next sign-in and asks you to agree
          before you continue.
        </p>
      </Section>
    </div>
  );
}

export function TermsBody() {
  return (
    <div className="space-y-6">
      <p className="text-[15px] leading-relaxed text-foreground/90">
        These terms cover everyone who uses IDSMS-CIS: student interns, faculty advisers, the
        department coordinator and system administrators. Using the system means you accept them.
      </p>
      <Section title="Your account">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your account is personal. Don&apos;t share your password or let someone else sign in as
            you.
          </li>
          <li>
            Sign out on shared or lab computers. Account settings lets you sign out of other
            devices.
          </li>
          <li>Tell your coordinator straight away if you think someone else used your account.</li>
        </ul>
      </Section>
      <Section title="Honest records">
        <ul className="list-disc space-y-1 pl-5">
          <li>Attendance, hours and reports must be true and your own work.</li>
          <li>
            Falsified hours or reports, or work copied from others, are handled under the SLU
            student handbook and the internship guidelines, and may lead to deductions or
            disciplinary action.
          </li>
          <li>
            Faculty and coordinators review, approve and return records in good faith and on time.
          </li>
        </ul>
      </Section>
      <Section title="Other people's data">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Don&apos;t put other people&apos;s personal information in reports beyond what your
            internship needs (no customer lists, passwords, or company secrets).
          </li>
          <li>
            Staff use interns&apos; records only to monitor their internship, and never copy,
            download or share them outside IDSMS-CIS except as the department requires.
          </li>
          <li>Follow your host company&apos;s confidentiality rules in everything you write.</li>
        </ul>
      </Section>
      <Section title="Acceptable use">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Don&apos;t try to reach records you aren&apos;t allowed to see, disrupt the system, or
            upload harmful files.
          </li>
          <li>
            AI assist, when turned on, only points a human to what was written. It never decides a
            grade, an approval or a penalty. Don&apos;t write instructions to the AI in your
            entries: it ignores them and your adviser is shown that it happened.
          </li>
          <li>
            Misuse can lead to your account being suspended and to action under SLU policy and
            Philippine law.
          </li>
        </ul>
      </Section>
      <Section title="The service">
        <p>
          SAMCIS runs IDSMS-CIS for its internship program and works to keep it available, but
          maintenance or outages can happen; deadlines affected by an outage are handled by the
          coordinator. These terms may change; when they do, you will be asked to accept them again
          at your next sign-in.
        </p>
      </Section>
    </div>
  );
}
