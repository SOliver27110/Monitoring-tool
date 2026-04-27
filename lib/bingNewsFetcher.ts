import Parser from 'rss-parser';
import type { RawArticle } from './feedSources';

const parser = new Parser();

// Bing News RSS query feed. No URL decoder — whatever URL Bing returns
// goes straight to articleExtractor.extract(); the existing
// fetch({ redirect: 'follow' }) chain follows HTTP redirects. JS-redirect
// interstitials end up extraction_status='failed' and the worker analyses
// the RSS snippet (existing fallback path).
export async function searchBingNews(
  query: string,
  limit: number
): Promise<RawArticle[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const feed = await parser.parseURL(url);
  return (feed.items ?? []).slice(0, limit).map((item) => {
    const snippet = item.contentSnippet || item.content || null;
    return {
      title: item.title ?? '',
      description: snippet ? snippet.slice(0, 500) : null,
      content: snippet ? snippet.slice(0, 500) : null,
      url: item.link ?? '',
      publishedAt: item.pubDate ?? new Date().toISOString(),
    };
  });
}
