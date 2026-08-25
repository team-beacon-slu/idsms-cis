import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/cypress/"],
  // NFR-MNT-04: >=70% line coverage for service modules, >=90% for critical logic
  // (hour computation, checklist gating, RBAC). Phase 1 is the first module with
  // real logic behind it, so its critical files get a threshold now; everything
  // else stays unset until it has real logic too — an empty gate on stub files
  // would just be noise.
  coverageThreshold: {
    global: {},
    "./src/lib/services/userService.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
    "./src/lib/services/auditService.ts": {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    "./src/lib/auth/session.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
    "./src/lib/utils/defaultPassword.ts": {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};

export default createJestConfig(config);
