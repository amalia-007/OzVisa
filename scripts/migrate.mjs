/**
 * OzVisa migration runner
 * Tries (in order):
 *   1. Supabase Management API with SUPABASE_ACCESS_TOKEN env var
 *   2. Direct PostgreSQL via pg with DATABASE_URL env var
 *   3. Direct PostgreSQL via pg auto-built URL from project ref + DB_PASSWORD env var
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<pat> node scripts/migrate.mjs
 *   DATABASE_URL=postgresql://postgres:<pass>@db.snumadczqmlfagturswr.supabase.co:5432/postgres node scripts/migrate.mjs
 *   DB_PASSWORD=<pass> node scripts/migrate.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));

// Parse .env.local
const env = { ...process.env };
try {
  for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
  }
} catch { /* no .env.local, use process.env only */ }

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"]?.replace(/\/$/, "");
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
const ACCESS_TOKEN = env["SUPABASE_ACCESS_TOKEN"]; // Supabase personal access token
const DATABASE_URL = env["DATABASE_URL"];
const DB_PASSWORD = env["DB_PASSWORD"];

const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

console.log("Project ref:", projectRef);
console.log("SUPABASE_ACCESS_TOKEN set:", !!ACCESS_TOKEN);
console.log("DATABASE_URL set:", !!DATABASE_URL);
console.log("DB_PASSWORD set:", !!DB_PASSWORD);
console.log("");

// ── Check if table exists ──────────────────────────────────────────────────
async function tableExists() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/analyses?limit=0`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  return res.ok;
}

// ── SQL statements ─────────────────────────────────────────────────────────
const OPTION_A = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS analyses (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT        NOT NULL,
  visa_type          TEXT        NOT NULL CHECK (visa_type IN ('417', '462')),
  payment_intent_id  TEXT,
  stripe_session_id  TEXT,
  stripe_status      TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (stripe_status IN ('pending', 'paid', 'completed', 'analysis_failed')),
  analysis_result    JSONB,
  language           TEXT        NOT NULL DEFAULT 'fr',
  payslip_b64        TEXT,
  payslip_name       TEXT,
  letter_b64         TEXT,
  letter_name        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER analyses_updated_at
  BEFORE UPDATE ON analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_analyses_stripe_session ON analyses(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_email          ON analyses(email);
CREATE INDEX IF NOT EXISTS idx_analyses_status         ON analyses(stripe_status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at     ON analyses(created_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON analyses;
CREATE POLICY "Service role only" ON analyses
  USING (auth.role() = 'service_role');
`;

const OPTION_B = `
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS payslip_b64       TEXT,
  ADD COLUMN IF NOT EXISTS payslip_name      TEXT,
  ADD COLUMN IF NOT EXISTS letter_b64        TEXT,
  ADD COLUMN IF NOT EXISTS letter_name       TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS analysis_result   JSONB,
  ADD COLUMN IF NOT EXISTS language          TEXT NOT NULL DEFAULT 'fr';

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON analyses;
CREATE POLICY "Service role only" ON analyses
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_analyses_stripe_session ON analyses(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_email          ON analyses(email);
CREATE INDEX IF NOT EXISTS idx_analyses_status         ON analyses(stripe_status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at     ON analyses(created_at DESC);
`;

// ── Run via Management API ─────────────────────────────────────────────────
async function runViaManagementApi(sql) {
  const token = ACCESS_TOKEN;
  if (!token) {
    console.log("No SUPABASE_ACCESS_TOKEN — skipping Management API.");
    return false;
  }
  console.log("Trying Supabase Management API...");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log("Status:", res.status, "| Response:", JSON.stringify(json));
  if (res.ok) { console.log("✅ Migration applied via Management API."); return true; }
  console.log("❌ Management API failed.");
  return false;
}

// ── Run via direct pg connection ───────────────────────────────────────────
async function runViaPg(sql) {
  let dbUrl = DATABASE_URL;
  if (!dbUrl && DB_PASSWORD && projectRef) {
    dbUrl = `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`;
    console.log("Built DATABASE_URL from DB_PASSWORD.");
  }
  if (!dbUrl) {
    console.log("No DATABASE_URL or DB_PASSWORD — skipping direct pg connection.");
    return false;
  }
  console.log("Trying direct PostgreSQL connection...");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL.");
    // Split and run each statement separately
    const statements = sql.split(/;\s*\n/).filter(s => s.trim());
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      try {
        await client.query(stmt);
        console.log("  OK:", stmt.trim().split("\n")[0].substring(0, 60));
      } catch (err) {
        // Ignore "already exists" errors for IF NOT EXISTS / OR REPLACE constructs
        if (err.code === "42710" || err.code === "42P07") {
          console.log("  SKIP (already exists):", stmt.trim().split("\n")[0].substring(0, 60));
        } else {
          console.error("  ERROR:", err.message, "| code:", err.code);
          throw err;
        }
      }
    }
    console.log("✅ Migration applied via direct pg connection.");
    return true;
  } catch (err) {
    console.error("❌ pg connection failed:", err.message);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log("Checking if 'analyses' table exists...");
const exists = await tableExists();
console.log("Table exists:", exists);

const sql = exists ? OPTION_B : OPTION_A;
const label = exists ? "Option B (ALTER TABLE)" : "Option A (CREATE TABLE)";
console.log(`\nWill apply: ${label}\n`);

let success = await runViaManagementApi(sql);

if (!success) {
  console.log("");
  success = await runViaPg(sql);
}

if (!success) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Could not apply migration automatically.

Provide ONE of these and re-run:

A) Supabase Personal Access Token (easiest):
   Dashboard → your avatar (top-right) → Account → Access Tokens → Generate new token
   SUPABASE_ACCESS_TOKEN=<token> node scripts/migrate.mjs

B) Database password:
   Dashboard → Project Settings → Database → Connection string (copy the password)
   DB_PASSWORD=<password> node scripts/migrate.mjs

C) Full connection string:
   DATABASE_URL=postgresql://postgres:<password>@db.${projectRef}.supabase.co:5432/postgres node scripts/migrate.mjs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  process.exit(1);
}
