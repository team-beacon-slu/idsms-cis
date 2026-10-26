/** @jest-environment node */
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import type { Adapter } from "next-auth/adapters";
import {
  betaGoogleProvider,
  isAllowedGoogleProfile,
  withBetaGoogleUsers,
} from "@/lib/auth/betaGoogle";
import { authOptions } from "@/lib/auth/authOptions";

beforeEach(() => resetPrismaMock());

const slu = { email: "ana.cruz@slu.edu.ph", email_verified: true, hd: "slu.edu.ph" };

describe("isAllowedGoogleProfile", () => {
  it("accepts a verified SLU Workspace account", () => {
    expect(isAllowedGoogleProfile(slu)).toBe(true);
    expect(isAllowedGoogleProfile({ ...slu, email: "Ana.Cruz@SLU.edu.ph" })).toBe(true);
  });

  it.each([
    ["personal Gmail", { email: "ana@gmail.com", email_verified: true, hd: undefined }],
    ["unverified address", { ...slu, email_verified: false }],
    ["another Workspace domain", { ...slu, hd: "evil.com" }],
    ["look-alike domain", { ...slu, email: "ana@slu.edu.ph.evil.com" }],
    ["subdomain of SLU", { ...slu, email: "ana@mail.slu.edu.ph" }],
    ["no profile", undefined],
  ])("refuses a %s", (_, profile) => {
    expect(isAllowedGoogleProfile(profile)).toBe(false);
  });
});

describe("signIn callback", () => {
  const signIn = authOptions.callbacks!.signIn!;
  const google = { provider: "google", type: "oauth" } as never;

  it("leaves password sign-ins to verifyCredentials", async () => {
    await expect(signIn({ account: { provider: "credentials" } } as never)).resolves.toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses non-SLU Google accounts without touching the database", async () => {
    await expect(
      signIn({ account: google, profile: { email: "x@gmail.com", email_verified: true } } as never)
    ).resolves.toBe(false);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("lets a new SLU student in (the account is created next)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(signIn({ account: google, profile: slu } as never)).resolves.toBe(true);
  });

  it.each([
    ["deactivated", { isActive: false, deletedAt: null, lockedUntil: null }, false],
    ["deleted", { isActive: true, deletedAt: new Date(), lockedUntil: null }, false],
    [
      "locked",
      { isActive: true, deletedAt: null, lockedUntil: new Date(Date.now() + 60_000) },
      false,
    ],
    [
      "lock expired",
      { isActive: true, deletedAt: null, lockedUntil: new Date(Date.now() - 60_000) },
      true,
    ],
    ["active", { isActive: true, deletedAt: null, lockedUntil: null }, true],
  ])("an existing %s account -> %s", async (_, row, allowed) => {
    prismaMock.user.findUnique.mockResolvedValue(row as never);
    await expect(signIn({ account: google, profile: slu } as never)).resolves.toBe(allowed);
  });
});

describe("withBetaGoogleUsers", () => {
  it("creates Google newcomers as student interns with an unusable password", async () => {
    prismaMock.user.create.mockResolvedValue({ id: "u1", email: "ana.cruz@slu.edu.ph" } as never);
    const adapter = withBetaGoogleUsers({} as Adapter);
    await adapter.createUser!({
      email: "Ana.Cruz@slu.edu.ph",
      name: "Ana Cruz",
      emailVerified: null,
    } as never);
    const data = prismaMock.user.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      email: "ana.cruz@slu.edu.ph",
      fullName: "Ana Cruz",
      role: "STUDENT_INTERN",
      mustResetPassword: false,
    });
    expect(String(data.hashedPassword)).toMatch(/^\$2/); // a bcrypt hash of random bytes
  });
});

it("stores Google's address in lower case, the spelling every lookup uses", async () => {
  const provider = betaGoogleProvider();
  // next-auth keeps our options here and merges them over the defaults at runtime.
  const user = await provider.options!.profile!(
    { sub: "g1", name: "Ana", email: "Ana.Cruz@SLU.edu.ph", picture: "" } as never,
    {} as never
  );
  expect(user.email).toBe("ana.cruz@slu.edu.ph");
});
