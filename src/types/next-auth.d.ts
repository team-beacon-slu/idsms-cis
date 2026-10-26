import { Role } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      isActive: boolean;
      mustResetPassword: boolean;
      fullName: string | null;
      privacyConsentVersion: string | null;
      aiAssist: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    role: Role;
    isActive: boolean;
    mustResetPassword: boolean;
    fullName?: string | null;
    privacyConsentVersion?: string | null;
    aiAssist?: boolean;
  }
}
