import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });

const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const required = {
  common: ["CRON_SECRET", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "DASHBOARD_SECRET"],
  deals: ["GHL_PRIVATE_INTEGRATION_TOKEN", "GHL_LOCATION_ID"],
  designers: ["GOOGLE_SHEETS_CLIENT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY"],
  tiny: ["TINY_CLIENT_ID", "TINY_CLIENT_SECRET"],
};

const missing = Object.fromEntries(
  Object.entries(required).map(([group, names]) => [
    group,
    names.filter((name) => !process.env[name]),
  ]),
);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const database = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await database.connect();

try {
  const [ghl, designer, tiny] = await Promise.all([
    database.query(`
      select count(*)::int as deals, max(last_synced_at) as last_synced_at
      from public.deals_cache
      where source_system = 'ghl' and sync_status = 'synced'
    `),
    database.query(`
      select status, started_at, completed_at, total_records, error_message
      from public.designer_mockups_sync_log
      order by started_at desc
      limit 1
    `),
    database.query(`
      select exists(
        select 1 from public.system_config
        where key = 'tiny_refresh_token' and coalesce(value, '') <> ''
      ) as refresh_token_persisted
    `),
  ]);

  const report = {
    validVercelConfig: Array.isArray(vercel.crons),
    scheduledCrons: vercel.crons,
    missingEnvironmentVariables: missing,
    ghlCache: ghl.rows[0],
    latestDesignerSync: designer.rows[0] || null,
    tiny: {
      authMode:
        process.env.TINY_CLIENT_ID && process.env.TINY_CLIENT_SECRET
          ? "v3-oauth"
          : process.env.TINY_TOKEN
            ? "v2-token"
            : "none",
      refreshTokenPersisted: tiny.rows[0]?.refresh_token_persisted || false,
    },
  };
  console.log(JSON.stringify(report, null, 2));

  const hasMissing = Object.values(missing).some((names) => names.length > 0);
  const designerFailed = designer.rows[0]?.status === "failed";
  if (hasMissing || designerFailed || !report.tiny.refreshTokenPersisted) {
    process.exitCode = 1;
  }
} finally {
  await database.end();
}
