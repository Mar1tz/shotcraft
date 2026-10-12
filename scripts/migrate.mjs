// Apply supabase/migrations/*.sql to the Supabase database, in order, once each.
//
//   node scripts/migrate.mjs
//
// Reads SUPABASE_DB_URL from .env.local. Each file runs in one transaction;
// applied files are recorded in public._migrations so re-running is safe.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

process.loadEnvFile?.(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL missing from .env.local");

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");

try {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._migrations enable row level security`;   // invisible to the API
  const done = new Set((await sql`select name from public._migrations`).map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) { console.log(`  skip  ${file}`); continue; }
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${file})`;
    });
    console.log(`  apply ${file}`);
  }
  console.log("Database is up to date.");
} finally {
  await sql.end();
}
