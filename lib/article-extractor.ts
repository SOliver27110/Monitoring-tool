import { extract } from '@extractus/article-extractor';

export interface ExtractedArticle {
  text: string;
  author: string | null;
  image_url: string | null;
  word_count: number;
  has_full_text: boolean;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract full article text from a URL using @extractus/article-extractor.
 * Falls back to the RSS excerpt on any failure.
 *
 * @param url - The article URL to extract text from
 * @param fallbackExcerpt - RSS excerpt to use if extraction fails
 * @returns Extracted article data
 */
export async function extractArticleText(
  url: string,
  fallbackExcerpt: string | null
): Promise<ExtractedArticle> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const result = await extract(url, {}, { signal: controller.signal });
    clearTimeout(timeout);

    if (!result || !result.content) {
      return makeFallback(fallbackExcerpt);
    }

    const text = stripHtml(result.content);

    if (!text) {
      return makeFallback(fallbackExcerpt);
    }

    return {
      text,
      author: result.author ?? null,
      image_url: result.image ?? null,
      word_count: text.split(/\s+/).length,
      has_full_text: true,
    };
  } catch {
    return makeFallback(fallbackExcerpt);
  }
}

function makeFallback(excerpt: string | null): ExtractedArticle {
  const text = excerpt ?? '';
  return {
    text,
    author: null,
    image_url: null,
    word_count: text ? text.split(/\s+/).length : 0,
    has_full_text: false,
  };
}
