import { describe, it, expect } from 'vitest';
import { canonicaliseUrl } from './urlCanonicalise';

describe('canonicaliseUrl', () => {
  it('strips utm_* tracking params', () => {
    expect(
      canonicaliseUrl('https://example.com/article?utm_source=feed&utm_medium=rss&utm_campaign=x')
    ).toBe('https://example.com/article');
  });

  it('strips fbclid and gclid', () => {
    expect(canonicaliseUrl('https://example.com/article?fbclid=abc&gclid=def')).toBe(
      'https://example.com/article'
    );
  });

  it('preserves non-tracking query params', () => {
    expect(canonicaliseUrl('https://example.com/?p=12345')).toBe('https://example.com/?p=12345');
  });

  it('preserves a mix of tracking and non-tracking params', () => {
    expect(
      canonicaliseUrl('https://example.com/article?id=42&utm_source=feed&page=2')
    ).toBe('https://example.com/article?id=42&page=2');
  });

  it('lowercases the host', () => {
    expect(canonicaliseUrl('https://Example.COM/path')).toBe('https://example.com/path');
  });

  it('drops www. prefix', () => {
    expect(canonicaliseUrl('https://www.bbc.co.uk/news/foo')).toBe('https://bbc.co.uk/news/foo');
  });

  it('removes the URL fragment', () => {
    expect(canonicaliseUrl('https://example.com/article#section')).toBe(
      'https://example.com/article'
    );
  });

  it('strips trailing slash on non-root paths', () => {
    expect(canonicaliseUrl('https://example.com/news/')).toBe('https://example.com/news');
  });

  it('preserves the bare root slash', () => {
    expect(canonicaliseUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves http vs https scheme', () => {
    expect(canonicaliseUrl('http://example.com/article')).toBe('http://example.com/article');
    expect(canonicaliseUrl('https://example.com/article')).toBe('https://example.com/article');
  });

  it('matches tracking params case-insensitively', () => {
    expect(canonicaliseUrl('https://example.com/article?UTM_SOURCE=feed&FBclid=abc')).toBe(
      'https://example.com/article'
    );
  });

  it('returns invalid input unchanged (degrades to exact-match dedup)', () => {
    expect(canonicaliseUrl('not a url')).toBe('not a url');
    expect(canonicaliseUrl('http://[')).toBe('http://[');
  });

  it('passes through null and empty string unchanged', () => {
    expect(canonicaliseUrl(null)).toBeNull();
    expect(canonicaliseUrl('')).toBe('');
  });

  it('canonicalises a realistic Google-News-redirected BBC URL', () => {
    expect(
      canonicaliseUrl(
        'https://www.bbc.com/news/uk-england-oxfordshire-12345?utm_source=feed&fbclid=abc#main'
      )
    ).toBe('https://bbc.com/news/uk-england-oxfordshire-12345');
  });

  it('canonicalises a Guardian URL with CMP tracking', () => {
    expect(
      canonicaliseUrl('https://www.theguardian.com/uk-news/2026/foo?CMP=share_btn&ito=email_share')
    ).toBe('https://theguardian.com/uk-news/2026/foo');
  });
});
