import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

export type { Prisma } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter, log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

const globalForPrisma = globalThis as unknown as { __shamsPrisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.__shamsPrisma ?? createClient();
if (env.NODE_ENV !== "production") globalForPrisma.__shamsPrisma = db;

export type Db = typeof db;
/** Interactive transaction client. */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
