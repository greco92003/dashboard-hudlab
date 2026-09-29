// Roda SQL no Postgres do Supabase pelo DATABASE_URL do .env.local.
//   node --env-file=.env.local scripts/run-sql.mjs --file caminho.sql
//   node --env-file=.env.local scripts/run-sql.mjs "select count(*) from public.ai_seller_runs"
// Com --file, o arquivo inteiro roda numa transação (tudo ou nada).
import { readFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const sql = fileIndex >= 0 ? readFileSync(args[fileIndex + 1], "utf8") : args.join(" ");
if (!sql.trim()) {
  console.error("Informe o SQL ou --file <arquivo>.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurado (use --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  if (fileIndex >= 0) await client.query("begin");
  const result = await client.query(sql);
  if (fileIndex >= 0) await client.query("commit");
  const last = Array.isArray(result) ? result.at(-1) : result;
  if (last?.rows?.length) console.table(last.rows);
  else console.log("ok");
} catch (error) {
  if (fileIndex >= 0) await client.query("rollback");
  console.error("ERRO:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
