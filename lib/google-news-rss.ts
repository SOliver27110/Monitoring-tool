import Parser from 'rss-parser';
import type { RawArticle } from './feedSources';

const parser = new Parser();

// Google News RSS query feed. Internal try/catch returns [] on failure so
// a Google outage doesn't poison a multi-source scan — registry's other
// sources still run. Per-source error reporting is the caller's job (the
// scan-route try/catch around source.fetch()).
export async function searchGoogleNews(
  query: string,
  limit: number
): Promise<RawArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;

  try {
    const feed = await parser.parseURL(url);

    return (feed.items ?? [])
      .slice(0, limit)
      .map((item) => {
        const snippet = item.contentSnippet || item.content || null;
        return {
          title: item.title ?? '',
          description: snippet ? snippet.slice(0, 500) : null,
          content: snippet ? snippet.slice(0, 500) : null,
          url: item.link ?? '',
          publishedAt: item.pubDate ?? new Date().toISOString(),
          categories: item.categories ?? [],
        };
      });
  } catch (err) {
    console.error(`[Google News RSS] Failed to fetch feed for query "${query}":`, err);
    return [];
  }
}
