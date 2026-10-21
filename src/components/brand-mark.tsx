// The IDSMS-CIS mark from the thesis (Figure 11): a submitted document with a
// validated check. Redrawn on a 24px grid so it stays crisp from 16px (favicon) up:
// fewer, thicker lines, and a surface ring around the badge so it reads at small sizes.
// Colours are the logo's own: navy #1f4e79 (document) and green #2f6b4f (check).
export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="3" y="1.5" width="14" height="19" rx="2.5" fill="#1f4e79" />
      <path
        d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4.5"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17.5" cy="17.5" r="5.5" fill="#2f6b4f" stroke="#fff" strokeWidth="1.5" />
      <path
        d="m15.2 17.6 1.6 1.6 3.1-3.3"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
