// The beta deployment's notice (NEXT_PUBLIC_BETA_NOTICE=true): what testers should know
// before they type anything. Remove with the rest of the beta switches at rollout.
const ON = process.env.NEXT_PUBLIC_BETA_NOTICE === "true";
const FEEDBACK = process.env.NEXT_PUBLIC_BETA_FEEDBACK_URL;

export function BetaNotice({ className = "" }: { className?: string }) {
  if (!ON) return null;
  return (
    <p role="note" className={`rounded-xl glass px-4 py-2 text-sm text-foreground ${className}`}>
      <strong className="font-semibold">Beta test.</strong> Everything you enter is deleted when the
      beta ends. We do not record your screen or track your clicks (the app keeps only its usual
      security log); the feedback you choose to send helps us improve IDSMS before the full rollout.
      {FEEDBACK && (
        <>
          {" "}
          <a
            href={FEEDBACK}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 hover:text-primary"
          >
            Send feedback
          </a>
        </>
      )}
    </p>
  );
}
