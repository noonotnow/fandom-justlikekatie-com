-- Application-owned data only. stripe-replit-sync owns the stripe schema.
CREATE TABLE IF NOT EXISTS public.fandom_billing_accounts (
  account_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fandom_billing_accounts_customer_idx
  ON public.fandom_billing_accounts (stripe_customer_id);