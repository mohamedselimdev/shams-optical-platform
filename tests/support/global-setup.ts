import { execSync } from "node:child_process";
import pg from "pg";

/** Recreate the test schema and apply all migrations once per run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://shams:shams@localhost:5432/shams_test?schema=public";
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
