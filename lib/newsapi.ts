export interface NewsApiArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  source: { id: string | null; name: string };
  author: string | null;
  publishedAt: string;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

/**
 * Search NewsAPI for articles matching a query string.
 * Returns up to `pageSize` articles from the last 7 days.
 */
export async function searchArticles(
  query: string,
  pageSize = 20
): Promise<NewsApiArticle[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    throw new Error('NEWSAPI_KEY is not configured');
  }

  // NewsAPI free tier only allows 7 days back
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().split('T')[0];

  const params = new URLSearchParams({
    q: query,
    from: fromStr,
    sortBy: 'publishedAt',
    pageSize: String(pageSize),
    language: 'en',
    apiKey,
  });

  const res = await fetch(
    `https://newsapi.org/v2/everything?${params.toString()}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `NewsAPI error ${res.status}: ${(err as Record<string, string>).message ?? res.statusText}`
    );
  }

  const data = (await res.json()) as NewsApiResponse;
  return data.articles ?? [];
}
