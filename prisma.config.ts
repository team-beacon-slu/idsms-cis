import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (db pull, migrate diff, studio) uses the direct, non-pooled connection.
// `prisma generate` needs no database, so CI builds without these variables.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
