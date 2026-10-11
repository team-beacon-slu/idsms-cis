// Notification links are followed on click; only same-site relative paths
// are allowed, so stored data can never send a user to another origin
// ("//host" is protocol-relative and would leave the site).
export function safeInternalPath(link: unknown): string | null {
  if (typeof link !== "string") return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  return link;
}
