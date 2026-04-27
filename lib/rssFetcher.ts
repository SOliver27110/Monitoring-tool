import Parser from 'rss-parser';
import type { RawArticle } from './feedSources';

const parser = new Parser();

// Generic RSS fetcher used by browse-archetype feed sources (Oxford Mail,
// Banbury Guardian). Errors propagate — the scan loop's per-source try/catch
// surfaces them in errors[] rather than swallowing.
export async function fetchRSS(url: string): Promise<RawArticle[]> {
  const feed = await parser.parseURL(url);
  return (feed.items ?? []).map((item) => {
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
}
