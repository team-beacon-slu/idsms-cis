import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 talks to Postgres through the `pg` driver. Two defaults differ from Prisma 6:
// - `pg` skips TLS unless asked, while Prisma 6 tried TLS first. Keep it encrypted, as
//   before; a local Postgres (the lab server) sets PGSSLMODE=disable.
// - `pg` has no connect timeout; the Supabase pooler can take seconds on a slow link.
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    // A new connection to the Supabase pooler costs ~460 ms; pg closes idle ones after
    // 10 s by default, so after any pause the next click paid that. Keep them 5 minutes.
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    // One long-running server (dev PC, lab PC). Lower it if the app ever runs as many
    // serverless instances, which would otherwise exhaust the pooler.
    max: Number(process.env.PG_POOL_MAX) || 10,
  });
  return new PrismaClient({ adapter });
}

// Next.js dev-mode hot-reload creates a fresh module scope per edit, which would
// otherwise open a new PrismaClient (and a new pooled connection) on every save.
// Caching on globalThis survives the reload; production never hits this path.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
