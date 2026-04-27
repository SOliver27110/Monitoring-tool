import { describe, it, expect } from 'vitest';
import { banburyAffiliateFilter, type RawArticle } from './feedSources';

// Fixtures based on the shape of real Banbury Guardian RSS items observed
// during Phase 1 recon (probe results: real news mixed with affiliate
// "Recommended" content).

function fixture(partial: Partial<RawArticle>): RawArticle {
  return {
    title: '',
    description: null,
    content: null,
    url: 'https://www.banburyguardian.co.uk/news/example',
    publishedAt: new Date('2026-04-20').toISOString(),
    ...partial,
  };
}

describe('banburyAffiliateFilter', () => {
  it('keeps a normal local-news item with no categories', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Banbury councillor calls for housing reform',
          description: 'Cllr Jane Smith has raised concerns about local housing provision.',
        })
      )
    ).toBe(true);
  });

  it('keeps a news item categorised under News/Local', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Cherwell District Council approves Banbury road scheme',
          categories: ['News', 'Local'],
        })
      )
    ).toBe(true);
  });

  it('drops an affiliate item whose title carries the (aff) marker', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Best IPL hair removal devices: Keskine review (aff)',
          categories: ['Lifestyle'],
        })
      )
    ).toBe(false);
  });

  it('drops an affiliate item categorised Recommended even without (aff) in title', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Bosch pressure washer roundup',
          categories: ['Recommended'],
        })
      )
    ).toBe(false);
  });

  it('drops items where Recommended appears alongside other categories', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Top winter coats',
          categories: ['Shopping', 'Recommended Articles'],
        })
      )
    ).toBe(false);
  });

  it('matches the (aff) marker case-insensitively', () => {
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Some product review (AFF)',
        })
      )
    ).toBe(false);
  });

  it('keeps news items that mention "recommended" in title text only (not category)', () => {
    // Category-based exclusion only — title text containing the word
    // "recommended" is not a signal on its own.
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'Council recommended planning changes for Banbury',
          categories: ['News'],
        })
      )
    ).toBe(true);
  });

  it('does not treat (affordable) in title as the (aff) affiliate marker', () => {
    // Substring check is for the literal '(aff)' — '(affordable)' must
    // not match because the closing paren immediately after 'aff' is what
    // distinguishes the marker from English words starting with 'aff'.
    expect(
      banburyAffiliateFilter(
        fixture({
          title: 'New (affordable) housing scheme planned for north Banbury',
        })
      )
    ).toBe(true);
  });
});
