import { execSync } from "node:child_process";
import "dotenv/config";
import { Client } from "pg";

function testDatabaseUrl() {
  const configured = process.env.TEST_DATABASE_URL;
  if (configured) return configured;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for integration tests");
  }
  const url = new URL(base);
  url.searchParams.set("schema", "anantha_test");
  return url.toString();
}

export default async function setup() {
  const databaseUrl = testDatabaseUrl();
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") || "public";
  url.searchParams.delete("schema");

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
