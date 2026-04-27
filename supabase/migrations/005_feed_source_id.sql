-- Batch C: record which feed source surfaced each analysis item.
--
-- scan/route.ts iterates over a registry of feed sources (Google News,
-- Bing News, Oxford Mail, Banbury Guardian) and tags every ingested row
-- with the source.id that produced it. Useful for debugging coverage
-- gaps ("we have nothing from Banbury Guardian for this project — is the
-- feed broken or are no items matching?") and for per-source quality
-- reporting later.
--
-- Free text rather than a foreign key: the registry lives in code
-- (lib/feedSources.ts), not the database. Avoids a DB write every time
-- we add or rename a source.
--
-- Nullable: rows ingested before this migration have no source recorded;
-- the application treats null as "unknown / pre-Batch-C".
--
-- Idempotent: safe to re-run.

ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS feed_source_id text;
