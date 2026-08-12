import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const [column, summary, largest, dependentViews, viewGrants, webhookTable, fieldCoverage] = await Promise.all([
    client.query(`
      select data_type, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'deals_cache'
        and column_name = 'value'
    `),
    client.query(`
      select source_system, status, count(*)::int as deals,
             round(sum(value) / 100, 2) as value_brl
      from public.deals_cache
      where sync_status = 'synced'
      group by source_system, status
      order by source_system, status
    `),
    client.query(`
      select deal_id, title, status, value / 100 as value_brl
      from public.deals_cache
      where source_system = 'ghl'
      order by value desc nulls last
      limit 10
    `),
    client.query(`
      select schemaname, viewname, definition
      from pg_views
      where schemaname = 'public'
        and definition ilike '%deals_cache%'
      order by viewname
    `),
    client.query(`
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'deals_by_period'
      order by grantee, privilege_type
    `),
    client.query(`select to_regclass('public.webhook_idempotency') as table_name`),
    client.query(`
      select
        count(*)::int as won_deals,
        count(closing_date)::int as with_closing_date,
        count(estado)::int as with_estado,
        count("quantidade-de-pares")::int as with_pairs,
        count(vendedor)::int as with_seller,
        count(designer)::int as with_designer,
        count(data_embarque)::int as with_shipping_date
      from public.deals_cache
      where source_system = 'ghl' and sync_status = 'synced' and status = 'won'
    `),
  ]);
  console.log(JSON.stringify({
    valueColumn: column.rows[0],
    summary: summary.rows,
    largestGhlDeals: largest.rows,
    webhookIdempotencyTable: webhookTable.rows[0]?.table_name || null,
    wonFieldCoverage: fieldCoverage.rows[0],
  }, null, 2));
} finally {
  await client.end();
}
