import { randomUUID } from "crypto";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { RequestInternal } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { decode as defaultDecode, encode as defaultEncode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/lib/services/userService";

const SESSION_MAX_AGE_SECONDS = 30 * 60; // FR-UM-06 idle timeout
const SESSION_UPDATE_AGE_SECONDS = 5 * 60;

function getIpFromRequest(req: Pick<RequestInternal, "headers">): string | null {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }
  return null;
}

// NextAuth v4's CredentialsProvider only supports the JWT session strategy out
// of the box — it throws if you pair it with `session.strategy: "database"`.
// The workaround (documented across several NextAuth GitHub discussions): flag
// the token during the credentials sign-in in the `jwt` callback, then in the
// `encode` override, intercept exactly that flagged token and manually create
// a real Session row via the adapter, returning its sessionToken as the
// "encoded" cookie value instead of an actual JWT. Every request after that is
// a normal database-session lookup — nothing else needs to know this happened.
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const ipAddress = getIpFromRequest(req);
        const result = await verifyCredentials(credentials.email, credentials.password, ipAddress);

        if (!result.ok) {
          // authorize() can only return null or throw — throwing the reason
          // string lets the login page read it back off the ?error= redirect
          // param to show the specific lockout/inactive/invalid message.
          throw new Error(result.reason);
        }

        return {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          isActive: result.user.isActive,
          mustResetPassword: result.user.mustResetPassword,
        };
      },
    }),
    // next-auth's own assertConfig (core/lib/assert.js) hard-rejects database
    // sessions when EVERY configured provider is type "credentials" — a
    // blanket rule that predates the encode/decode workaround above. This
    // provider exists solely to make that check pass; the app never links to
    // it (our sign-in page only ever calls signIn("credentials", ...)) and
    // the fake endpoints are never contacted because nothing initiates its flow.
    {
      id: "unused-oauth-placeholder",
      name: "unused-oauth-placeholder",
      type: "oauth",
      clientId: "unused",
      clientSecret: "unused",
      authorization: "https://example.invalid/oauth/authorize",
      token: "https://example.invalid/oauth/token",
      userinfo: "https://example.invalid/oauth/userinfo",
      profile() {
        // Never actually invoked — see comment above. Throwing keeps the
        // return type honest instead of casting away a real mismatch.
        throw new Error("unused-oauth-placeholder should never be reached");
      },
    },
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user) {
        token.credentials = true;
      }
      return token;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.email = user.email;
      session.user.role = user.role;
      session.user.isActive = user.isActive;
      session.user.mustResetPassword = user.mustResetPassword;
      return session;
    },
  },
  jwt: {
    async encode(params) {
      if (params.token?.credentials) {
        if (!params.token.sub) {
          throw new Error("No user id on token during credentials session creation");
        }

        const sessionToken = randomUUID();
        await prisma.session.create({
          data: {
            sessionToken,
            userId: params.token.sub,
            expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          },
        });

        return sessionToken;
      }

      return defaultEncode(params);
    },
    async decode(params) {
      return defaultDecode(params);
    },
  },
};
