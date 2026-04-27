import { fetchRSS } from './rssFetcher';
import { searchBingNews } from './bingNewsFetcher';
import { searchGoogleNews } from './google-news-rss';
import { FEED_SOURCE_LABELS } from './feedSourceLabels';

export interface RawArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  publishedAt: string;
  // Optional: rss-parser exposes <category> tags as Item.categories.
  // Used by Banbury's affiliate filter; not all feeds populate it.
  categories?: string[];
}

interface BaseFeedSource {
  id: string;
  name: string;
  // Minimum delay between successive feed-fetch calls against the same
  // source within a single Vercel function instance. 0 = no source-level
  // pacing (rely on the inter-project delay in scan/route).
  rateLimitMs: number;
}

export interface QueryFeedSource extends BaseFeedSource {
  kind: 'query';
  fetch(query: string, limit: number): Promise<RawArticle[]>;
}

export interface BrowseFeedSource extends BaseFeedSource {
  kind: 'browse';
  fetch(): Promise<RawArticle[]>;
  // Pre-matcher predicate: returns true to keep, false to drop. Used to
  // strip affiliate items (Banbury Guardian) before they reach the
  // boolean matcher.
  filter?: (item: RawArticle) => boolean;
}

export type FeedSource = QueryFeedSource | BrowseFeedSource;

// Banbury Guardian publishes affiliate "Recommended" content alongside
// real local news. Two signals to drop, OR'd together:
//   - <category> contains 'recommended' (substring, case-insensitive)
//   - title contains the publisher's own '(aff)' marker
//
// The category list is intentionally narrow (just 'recommended'); broader
// categories like 'cars' or 'lifestyle' contain legitimate local news on
// the Banbury masthead.
//
// Exported so lib/feedSources.test.ts can exercise it against fixtures.
export function banburyAffiliateFilter(item: RawArticle): boolean {
  const cats = (item.categories ?? []).map((c) => c.toLowerCase());
  const isRecommendedCat = cats.some((c) => c.includes('recommended'));
  const hasAffMarker = item.title.toLowerCase().includes('(aff)');
  return !(isRecommendedCat || hasAffMarker);
}

// Order matters: direct publisher feeds run before query aggregators so
// cross-source dedup (canonicalised URL, in scan/route) resolves to the
// publisher source when the same article surfaces in both.
export const feedSources: FeedSource[] = [
  {
    id: 'oxford_mail',
    name: FEED_SOURCE_LABELS.oxford_mail,
    kind: 'browse',
    rateLimitMs: 1000,
    fetch: () => fetchRSS('https://www.oxfordmail.co.uk/news/rss/'),
  },
  {
    id: 'banbury_guardian',
    name: FEED_SOURCE_LABELS.banbury_guardian,
    kind: 'browse',
    rateLimitMs: 1000,
    fetch: () => fetchRSS('https://www.banburyguardian.co.uk/rss'),
    filter: banburyAffiliateFilter,
  },
  {
    id: 'google_news',
    name: FEED_SOURCE_LABELS.google_news,
    kind: 'query',
    // 0: existing inter-project delay in scan/route already paces Google,
    // and the URL decoder's batchexecute calls have their own pacing.
    rateLimitMs: 0,
    fetch: searchGoogleNews,
  },
  {
    id: 'bing_news',
    name: FEED_SOURCE_LABELS.bing_news,
    kind: 'query',
    rateLimitMs: 2000,
    fetch: searchBingNews,
  },
];

// Per-source caps applied in scan/route. Browse caps are post-filter +
// post-classify; query caps are per-call to the upstream service.
export const PER_SOURCE_LIMITS: Record<string, number> = {
  oxford_mail: 5,
  banbury_guardian: 5,
  google_news: 20,
  bing_news: 15,
};
