import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { GoogleDecoder } from 'google-news-url-decoder';

export interface ExtractResult {
  text: string | null;
  status: 'success' | 'failed' | 'paywalled';
  publisher_url: string | null;
  error: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;
// Hard ceiling on the whole extract() call (unwrap + fetch + parse). One
// slow article must not pin a concurrency slot in scan/route.ts for the
// full 120s Vercel budget.
const TOTAL_TIMEOUT_MS = 25_000;
const MIN_TEXT_CHARS = 300;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const DOMAIN_THROTTLE_MS = 2_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; DevCommsMonitor/1.0)';

const GOOGLE_NEWS_HOSTS = new Set(['news.google.com', 'www.news.google.com']);

const decoder = new GoogleDecoder();

// Per-domain throttle. Holds the earliest timestamp we're allowed to issue
// a new request for that host. Module-scoped so it persists across calls
// within a single process; resets on cold start, which is acceptable for
// the manual-scan shakedown.
//
// Best-effort post-redirect: the first request to an unknown publisher
// host goes through unthrottled (we can't know the final host until the
// redirect resolves), but subsequent requests to the same publisher within
// DOMAIN_THROTTLE_MS will wait.
const nextAllowedAt = new Map<string, number>();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isGoogleNewsRedirect(url: string): boolean {
  const host = hostOf(url);
  return host !== null && GOOGLE_NEWS_HOSTS.has(host);
}

async function throttle(host: string): Promise<void> {
  const now = Date.now();
  const waitUntil = nextAllowedAt.get(host) ?? 0;
  if (waitUntil > now) {
    await new Promise<void>((resolve) => setTimeout(resolve, waitUntil - now));
  }
  // Reserve the next slot. Concurrent callers for the same host will see
  // this and queue up behind it.
  nextAllowedAt.set(host, Math.max(waitUntil, Date.now()) + DOMAIN_THROTTLE_MS);
}

async function readBodyCapped(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
}

// Resolve a Google News redirect URL to its underlying publisher URL.
// Throws on failure so the caller can surface the reason; non-Google URLs
// pass through unchanged so direct publisher feeds (Batch C) work without
// a separate code path.
export async function unwrapGoogleNewsUrl(url: string): Promise<string> {
  if (!isGoogleNewsRedirect(url)) return url;

  const result = await decoder.decode(url);
  if (result.status) return result.decoded_url;
  throw new Error(result.message);
}

async function extractFromPublisher(publisherUrl: string): Promise<ExtractResult> {
  const initialHost = hostOf(publisherUrl);
  if (initialHost) {
    await throttle(initialHost);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(publisherUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        text: null,
        status: 'failed',
        publisher_url: publisherUrl,
        error: `Publisher returned HTTP ${response.status}`,
      };
    }

    // Reserve a throttle slot against the final publisher host so any
    // subsequent calls to the same publisher pace themselves.
    const finalHost = hostOf(response.url);
    if (finalHost && finalHost !== initialHost) {
      nextAllowedAt.set(finalHost, Date.now() + DOMAIN_THROTTLE_MS);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      return {
        text: null,
        status: 'failed',
        publisher_url: publisherUrl,
        error: `Non-HTML content-type: ${contentType || 'unknown'}`,
      };
    }

    const html = await readBodyCapped(response);
    if (html === null) {
      return {
        text: null,
        status: 'failed',
        publisher_url: publisherUrl,
        error: `Body exceeded ${MAX_BODY_BYTES} bytes`,
      };
    }

    const { document } = parseHTML(html);
    const base = document.createElement('base');
    base.setAttribute('href', response.url);
    document.head?.prepend(base);
    const article = new Readability(document as unknown as Document).parse();
    const text = article?.textContent?.trim() ?? '';

    if (text.length < MIN_TEXT_CHARS) {
      return {
        text: null,
        status: 'paywalled',
        publisher_url: publisherUrl,
        error: null,
      };
    }

    return {
      text,
      status: 'success',
      publisher_url: publisherUrl,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Publisher fetch failed';
    return {
      text: null,
      status: 'failed',
      publisher_url: publisherUrl,
      error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function extract(url: string): Promise<ExtractResult> {
  const totalDeadline = new Promise<ExtractResult>((resolve) => {
    setTimeout(() => {
      resolve({
        text: null,
        status: 'failed',
        publisher_url: null,
        error: `Extract exceeded ${TOTAL_TIMEOUT_MS}ms total budget`,
      });
    }, TOTAL_TIMEOUT_MS);
  });

  const work = (async (): Promise<ExtractResult> => {
    let publisherUrl: string;
    try {
      publisherUrl = await unwrapGoogleNewsUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unwrap failed';
      console.error(`[articleExtractor] Google News unwrap failed for ${url}: ${msg}`);
      return {
        text: null,
        status: 'failed',
        publisher_url: null,
        error: `Google News unwrap failed: ${msg}`,
      };
    }

    return extractFromPublisher(publisherUrl);
  })();

  return Promise.race([work, totalDeadline]);
}
