import Parser from 'rss-parser';

export interface NewsApiArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  source: { id: string | null; name: string };
  author: string | null;
  publishedAt: string;
}

const parser = new Parser();

/**
 * Search Google News RSS for articles matching a query string.
 * Returns up to `pageSize` articles.
 */
export async function searchArticles(
  query: string,
  pageSize = 20
): Promise<NewsApiArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;

  try {
    const feed = await parser.parseURL(url);

    const articles: NewsApiArticle[] = (feed.items ?? [])
      .slice(0, pageSize)
      .map((item) => {
        const snippet = item.contentSnippet || item.content || null;

        return {
          title: item.title ?? '',
          description: snippet ? snippet.slice(0, 500) : null,
          content: snippet ? snippet.slice(0, 500) : null,
          url: item.link ?? '',
          source: {
            id: null,
            name: (item as Record<string, unknown>).source
              ? String(
                  ((item as Record<string, unknown>).source as Record<string, unknown>)?.name ??
                    'Google News'
                )
              : 'Google News',
          },
          author: null,
          publishedAt: item.pubDate ?? new Date().toISOString(),
        };
      });

    return articles;
  } catch (err) {
    console.error(`[Google News RSS] Failed to fetch feed for query "${query}":`, err);
    return [];
  }
}
