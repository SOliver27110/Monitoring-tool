// Canonicalise URLs for cross-source dedup. The same article surfaced by
// Google News, BBC, and Oxford Mail will have different URLs (tracking
// params, host casing, fragments). Exact-string-match dedup at scan time
// fails across sources; canonicalising before dedup fixes it without
// false positives.
//
// Pragmatic, not ambitious: lowercase host, drop www., strip a known list
// of tracking params, drop fragment, normalise trailing slash. Don't try
// to map cross-domain mirrors (bbc.co.uk ↔ bbc.com), don't change scheme.
// Invalid URLs pass through unchanged so dedup degrades to exact-match
// rather than throwing.

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'igsh',
  '_ga',
  '_gl',
  'cmp',
  'cmpid',
  'ito',
  'ref',
  'ref_src',
  'referrer',
]);

export function canonicaliseUrl(input: string | null): string | null {
  if (!input) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  const filtered = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
    filtered.append(key, value);
  }

  const pathname =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;

  const search = filtered.toString();
  return `${url.protocol}//${host}${pathname}${search ? `?${search}` : ''}`;
}
