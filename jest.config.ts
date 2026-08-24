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
  // (hour computation, checklist gating, RBAC). Thresholds intentionally left
  // unset here — turn them on per-module once real logic exists; an empty
  // threshold gate on stub files would just be noise this early.
};

export default createJestConfig(config);
