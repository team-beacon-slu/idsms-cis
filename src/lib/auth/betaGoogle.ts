import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/utils/password";

// Beta only: "Sign in with Google" for SLU accounts, so testers can join without a
// coordinator import. Off unless BETA_GOOGLE_SIGNIN=true and the OAuth client is set;
// remove this file (and its two uses in authOptions) when the beta closes.
export const SLU_DOMAIN = "slu.edu.ph";

export const betaGoogleEnabled = () =>
  process.env.BETA_GOOGLE_SIGNIN === "true" &&
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET;

// SLU runs on Google Workspace: a verified address in the slu.edu.ph hosted domain is
// a real SLU account. Anything else (personal Gmail, unverified, other domains) is refused.
export function isAllowedGoogleProfile(profile: unknown): boolean {
  const p = (profile ?? {}) as { email?: unknown; email_verified?: unknown; hd?: unknown };
  return (
    p.email_verified === true &&
    p.hd === SLU_DOMAIN &&
    typeof p.email === "string" &&
    p.email.toLowerCase().endsWith(`@${SLU_DOMAIN}`)
  );
}

export function betaGoogleProvider() {
  return GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // Imported or staff accounts with the same SLU address sign in to their own record;
    // safe here because Google has verified the address inside SLU's own domain.
    allowDangerousEmailAccountLinking: true,
    authorization: { params: { hd: SLU_DOMAIN, prompt: "select_account" } },
  });
}

// The Prisma adapter's createUser would insert next-auth's default fields (name, image,
// emailVerified), which `users` doesn't have, and leave out the required role and
// password. A Google newcomer becomes a student intern with an unusable random password;
// /onboarding then asks for their student number and class group.
export function withBetaGoogleUsers(adapter: Adapter): Adapter {
  return {
    ...adapter,
    async createUser(data: Omit<AdapterUser, "id">) {
      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          fullName: data.name ?? null,
          hashedPassword: await hashPassword(randomBytes(32).toString("hex")),
          role: Role.STUDENT_INTERN,
          mustResetPassword: false,
        },
      });
      return { ...user, emailVerified: null } as unknown as AdapterUser;
    },
  };
}
