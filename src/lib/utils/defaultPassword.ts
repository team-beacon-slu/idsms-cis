import { createHmac } from "crypto";

// Excludes 0/O/1/I/L — characters students frequently misread when copying a
// printed credentials sheet by hand.
const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PASSWORD_LENGTH = 10;

// Deterministic on purpose: a coordinator can regenerate a lost credentials
// sheet from the student number alone, with no separate secret store to manage.
// FR-UM-03.
export function generateDefaultPassword(studentNumber: string): string {
  const pepper = process.env.STUDENT_DEFAULT_PASSWORD_PEPPER;
  if (!pepper) {
    throw new Error("STUDENT_DEFAULT_PASSWORD_PEPPER is not set");
  }

  const digest = createHmac("sha256", pepper).update(studentNumber).digest();

  let password = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += SAFE_ALPHABET[digest[i] % SAFE_ALPHABET.length];
  }
  return password;
}
