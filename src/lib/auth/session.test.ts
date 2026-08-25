import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import {
  getCurrentSessionToken,
  getCurrentUser,
  requireRole,
  requireUserApi,
  requireUserPage,
} from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/errors";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/auth/authOptions", () => ({ authOptions: {} }));

const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockedRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;

function sessionUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "a@b.com",
    role: Role.STUDENT_INTERN,
    isActive: true,
    mustResetPassword: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the session user when present", async () => {
    mockedGetServerSession.mockResolvedValue({ user: sessionUser() } as never);
    expect(await getCurrentUser()).toEqual(sessionUser());
  });
});

describe("requireUserPage", () => {
  it("redirects to /login when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    mockedRedirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await expect(requireUserPage()).rejects.toThrow("REDIRECT");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects with an inactive-account error when the account is deactivated", async () => {
    mockedGetServerSession.mockResolvedValue({ user: sessionUser({ isActive: false }) } as never);
    mockedRedirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await expect(requireUserPage()).rejects.toThrow("REDIRECT");
    expect(mockedRedirect).toHaveBeenCalledWith("/login?error=ACCOUNT_INACTIVE");
  });

  it("returns the user when active, without redirecting", async () => {
    mockedGetServerSession.mockResolvedValue({ user: sessionUser() } as never);

    const user = await requireUserPage();

    expect(user).toEqual(sessionUser());
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});

describe("requireUserApi", () => {
  it("throws UnauthorizedError when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);
    await expect(requireUserApi()).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when the account is inactive", async () => {
    mockedGetServerSession.mockResolvedValue({ user: sessionUser({ isActive: false }) } as never);
    await expect(requireUserApi()).rejects.toThrow(UnauthorizedError);
  });

  it("returns the user when active", async () => {
    mockedGetServerSession.mockResolvedValue({ user: sessionUser() } as never);
    await expect(requireUserApi()).resolves.toEqual(sessionUser());
  });
});

describe("requireRole", () => {
  it("throws UnauthorizedError when the role is not in the allowed list", () => {
    expect(() => requireRole({ role: Role.STUDENT_INTERN }, [Role.SUPER_ADMIN])).toThrow(
      UnauthorizedError
    );
  });

  it("does not throw when the role is allowed", () => {
    expect(() => requireRole({ role: Role.SUPER_ADMIN }, [Role.SUPER_ADMIN])).not.toThrow();
  });
});

describe("getCurrentSessionToken", () => {
  it("returns the cookie value when present", () => {
    mockedCookies.mockReturnValue({ get: () => ({ value: "abc123" }) } as never);
    expect(getCurrentSessionToken()).toBe("abc123");
  });

  it("returns null when the cookie is missing", () => {
    mockedCookies.mockReturnValue({ get: () => undefined } as never);
    expect(getCurrentSessionToken()).toBeNull();
  });
});
