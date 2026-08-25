import { PrismaClient } from "@prisma/client";

// Next.js dev-mode hot-reload creates a fresh module scope per edit, which would
// otherwise open a new PrismaClient (and a new pooled connection) on every save.
// Caching on globalThis survives the reload; production never hits this path.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
