-- OzVisa: Create analyses table
-- Run this in your Supabase SQL editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  visa_type TEXT NOT NULL CHECK (visa_type IN ('417', '462')),
  payment_intent_id TEXT,
  stripe_session_id TEXT,
  stripe_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (stripe_status IN ('pending', 'paid', 'completed', 'analysis_failed')),
  analysis_result JSONB,
  language TEXT NOT NULL DEFAULT 'fr',
  -- Temporary storage for document processing (cleared after analysis)
  payslip_b64 TEXT,
  payslip_name TEXT,
  letter_b64 TEXT,
  letter_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analyses_updated_at
  BEFORE UPDATE ON analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analyses_stripe_session ON analyses(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_email ON analyses(email);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(stripe_status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);

-- Row Level Security
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Only service role can access (all operations go through server-side API)
CREATE POLICY "Service role only" ON analyses
  USING (auth.role() = 'service_role');
