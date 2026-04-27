// Shared between server-side scan/route and 'use client' QueueItem badge.
// Deps-free on purpose — no rss-parser, no fetchers — so client bundles
// stay clean.

export const FEED_SOURCE_LABELS = {
  google_news: 'Google News',
  bing_news: 'Bing News',
  oxford_mail: 'Oxford Mail',
  banbury_guardian: 'Banbury Guardian',
} as const;

export type FeedSourceId = keyof typeof FEED_SOURCE_LABELS;
