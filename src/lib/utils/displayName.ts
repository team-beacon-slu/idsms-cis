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

// Who someone is, in one place: a student's legal name, else the account's display name,
// else the email (staff created before names existed).
export function displayName(person: {
  email: string;
  fullName?: string | null;
  studentName?: string | null;
}): string {
  return person.studentName?.trim() || person.fullName?.trim() || person.email;
}

// Two letters for the avatar: first and last word of a name ("Ana M. Cruz" -> "AC"),
// or the start of an email's local part ("faculty.test@…" -> "FA").
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (nameOrEmail.includes("@") || words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
