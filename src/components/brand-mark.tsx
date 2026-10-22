// The BEACON mark: a lighthouse in the thesis logo's navy (#1f4e79) with its green
// (#2f6b4f) as the light. The tower's two white bands echo the document lines of the
// Figure 11 mark. Drawn on a 32px grid; BrandTile is the version for 16-32px (favicon,
// phone bar), where the beams would be too thin to read.
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d="M16 8.8 3 5v7.6zM16 8.8 29 5v7.6z" fill="#cfe3d8" />
      <path d="M10.2 6.4 16 1.8l5.8 4.6z" fill="#1f4e79" />
      <rect x="12" y="6.4" width="8" height="5" rx="1" fill="#2f6b4f" />
      <rect x="10" y="11.4" width="12" height="2.2" rx=".7" fill="#1f4e79" />
      <path d="M11.6 13.6h8.8l2.3 14.6H9.3z" fill="#1f4e79" />
      <path d="M10.95 17.9h10.1l.3 2.2H10.65zM10.25 22.7h11.5l.3 2.2H9.95z" fill="#fff" />
      <rect x="6" y="28.2" width="20" height="2.4" rx="1.2" fill="#1f4e79" />
    </svg>
  );
}

export function BrandTile({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1f4e79" />
      <path d="M10.6 8.6 16 4.4l5.4 4.2z" fill="#fff" />
      <rect x="12.3" y="8.6" width="7.4" height="4.6" rx=".9" fill="#5fbf8f" />
      <rect x="10.6" y="13.2" width="10.8" height="2" rx=".6" fill="#fff" />
      <path d="M12.1 15.2h7.8l1.9 11.4H10.2z" fill="#fff" />
      <path d="M11.5 19.2h9l.25 1.9h-9.5z" fill="#1f4e79" />
    </svg>
  );
}
