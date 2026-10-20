// "juan.delacruz@slu.edu.ph" → "Delacruz, Juan": the report name when the
// student hasn't entered a full name yet (they can correct it in Profile).
// The last name part is taken as the surname.
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const parts = local
    .split(/[._-]+/)
    .map((p) => p.replace(/\d+/g, ""))
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  if (parts.length === 0) return local;
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}
