import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/testUtils/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/.claude/",
    "<rootDir>/node_modules/",
    "<rootDir>/cypress/",
  ],
  // Build output contains package.json files that collide in the module map.
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/.claude/"],
  // Every core as a worker saturated the machine: a worker could miss Jest's
  // shutdown deadline ("failed to exit gracefully"; no open handles found), and the
  // run took twice as long. Half the cores is faster and quiet.
  maxWorkers: "50%",
  // NFR-MNT-04: >=70% line coverage for service modules, >=90% for critical logic
  // (hour computation, checklist gating, RBAC). Phase 1 is the first module with
  // real logic behind it, so its critical files get a threshold now; everything
  // else stays unset until it has real logic too — an empty gate on stub files
  // would just be noise.
  coverageThreshold: {
    global: {},
    "./src/lib/services/accounts/userService.ts": {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    "./src/lib/services/accounts/auditService.ts": {
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
    // Phase 2 critical logic: FR-CK-04's approval gate and FR-WP-06's
    // submit-lock/letter-queuing get the same 90% bar as Phase 1's
    // RBAC/session-security modules. companyService is mostly CRUD plus one
    // transition table, lower inherent risk, so it gets Phase 1's 70% bar.
    "./src/lib/services/predeployment/checklistService.ts": {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    "./src/lib/services/predeployment/workPlanService.ts": {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    "./src/lib/storage.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
    "./src/lib/services/predeployment/companyService.ts": {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
    // Phase 3 stub services: coverage on framework-exercise (RBAC, validation wiring,
    // smoke-test surface) only, not stub-body logic (TODO by design).
    "./src/lib/services/attendance/attendanceService.ts": {
      statements: 40,
      branches: 30,
      functions: 40,
      lines: 40,
    },
    "./src/lib/services/reports/weeklyReportService.ts": {
      statements: 40,
      branches: 30,
      functions: 40,
      lines: 40,
    },
    "./src/lib/services/reports/monthlyReportService.ts": {
      statements: 50,
      branches: 30,
      functions: 50,
      lines: 50,
    },
    "./src/lib/services/calendar/calendarService.ts": {
      statements: 40,
      branches: 30,
      functions: 40,
      lines: 40,
    },
  },
};

export default createJestConfig(config);
