/**
 * Simple in-memory per-domain rate limiter.
 * Ensures a minimum delay between requests to the same domain.
 */

const DOMAIN_DELAY_MS = 750;
const domainTimestamps = new Map<string, number>();

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Wait if needed to respect rate limiting for a domain.
 * Ensures at least 750ms between requests to the same domain.
 */
export async function waitForDomain(url: string): Promise<void> {
  const domain = getDomain(url);
  const lastFetch = domainTimestamps.get(domain);
  const now = Date.now();

  if (lastFetch) {
    const elapsed = now - lastFetch;
    if (elapsed < DOMAIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, DOMAIN_DELAY_MS - elapsed));
    }
  }

  domainTimestamps.set(domain, Date.now());
}
