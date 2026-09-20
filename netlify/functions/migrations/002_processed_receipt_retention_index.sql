-- postgres-migrations disable-transaction
--
-- CREATE INDEX CONCURRENTLY can leave an invalid index behind if interrupted.
-- Dropping first makes this migration safe to retry: an invalid prior build
-- cannot cause IF NOT EXISTS to silently skip the replacement.
CREATE TABLE IF NOT EXISTS public.fandom_billing_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT,
  event_created BIGINT NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'processing',
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fandom_billing_events
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP INDEX CONCURRENTLY IF EXISTS public.fandom_billing_events_processed_retention_idx;

CREATE INDEX CONCURRENTLY fandom_billing_events_processed_retention_idx
  ON public.fandom_billing_events (processed_at, stripe_event_id)
  WHERE state = 'processed';

-- Deployment verification:
-- SELECT indexrelid::regclass, indisvalid, indisready
-- FROM pg_index
-- WHERE indexrelid = 'public.fandom_billing_events_processed_retention_idx'::regclass;
-- Both flags must be true before the migration is considered complete.