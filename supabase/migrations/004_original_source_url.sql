-- Batch B follow-up: preserve the pre-unwrap Google News redirect URL.
--
-- scan/route.ts now unwraps news.google.com/rss/articles/... URLs to the
-- underlying publisher URL via google-news-url-decoder before storing
-- source_url. Keeping the original wrapped URL on the row makes it possible
-- to debug "why was this article ingested?" against the search query that
-- surfaced it.
--
-- For non-Google direct feeds (Batch C onwards), original_source_url will
-- equal source_url.
--
-- Idempotent: safe to re-run. Follows the pattern from migrations 002 and 003.

ALTER TABLE analysis_items ADD COLUMN IF NOT EXISTS original_source_url text;
