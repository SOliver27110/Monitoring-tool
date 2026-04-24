import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ExtractResult {
  text: string | null;
  status: 'success' | 'failed' | 'paywalled';
}

const FETCH_TIMEOUT_MS = 10_000;
const MIN_TEXT_CHARS = 300;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const DOMAIN_THROTTLE_MS = 2_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; DevCommsMonitor/1.0)';

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

export async function extract(url: string): Promise<ExtractResult> {
  const initialHost = hostOf(url);
  if (initialHost) {
    await throttle(initialHost);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { text: null, status: 'failed' };
    }

    // Reserve a throttle slot against the final publisher host so any
    // subsequent calls to the same publisher pace themselves.
    const finalHost = hostOf(response.url);
    if (finalHost && finalHost !== initialHost) {
      nextAllowedAt.set(finalHost, Date.now() + DOMAIN_THROTTLE_MS);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      return { text: null, status: 'failed' };
    }

    const html = await readBodyCapped(response);
    if (html === null) {
      return { text: null, status: 'failed' };
    }

    const dom = new JSDOM(html, { url: response.url });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.trim() ?? '';

    if (text.length < MIN_TEXT_CHARS) {
      return { text: null, status: 'paywalled' };
    }

    return { text, status: 'success' };
  } catch {
    return { text: null, status: 'failed' };
  } finally {
    clearTimeout(timeout);
  }
}
