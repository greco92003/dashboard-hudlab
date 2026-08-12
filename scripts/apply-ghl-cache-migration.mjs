import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const migrationFiles = [
  "20260811110000_unify_deals_cache_for_ghl.sql",
  "20260811113000_fix_deals_cache_audit_jsonb.sql",
];
const sql = (
  await Promise.all(
    migrationFiles.map((file) =>
      readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
    ),
  )
).join("\n");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("GHL deals_cache migration applied successfully");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
