export interface FeedSource {
  name: string;
  url: string;
  publisher: 'Reach' | 'Newsquest' | 'Iliffe' | 'Independent';
  verified: boolean;
}

const FEED_LIBRARY: Record<string, FeedSource> = {
  'cambridge-independent': {
    name: 'Cambridge Independent',
    url: 'https://www.cambridgeindependent.co.uk/_api/rss/cambridge_independent_news_feed.xml',
    publisher: 'Iliffe',
    verified: true,
  },
  'cambridge-news': {
    name: 'Cambridge News',
    url: 'https://www.cambridge-news.co.uk/rss.xml',
    publisher: 'Reach',
    verified: true,
  },
  'oxford-mail': {
    name: 'Oxford Mail',
    url: 'https://www.oxfordmail.co.uk/news/rss',
    publisher: 'Newsquest',
    verified: true,
  },
  'birmingham-mail': {
    name: 'Birmingham Live',
    url: 'https://www.birminghammail.co.uk/?service=rss',
    publisher: 'Reach',
    verified: true,
  },
  'gloucestershire-live': {
    name: 'Gloucestershire Live',
    url: 'https://www.gloucestershirelive.co.uk/?service=rss',
    publisher: 'Reach',
    verified: false,
  },
  'banbury-guardian': {
    name: 'Banbury Guardian',
    url: 'https://www.banburyguardian.co.uk/news/rss',
    publisher: 'Newsquest',
    verified: false,
  },
  'witney-gazette': {
    name: 'Witney Gazette',
    url: 'https://www.witneygazette.co.uk/news/rss',
    publisher: 'Newsquest',
    verified: false,
  },
  'henley-standard': {
    name: 'Henley Standard',
    url: 'https://www.henleystandard.co.uk/news/rss',
    publisher: 'Independent',
    verified: false,
  },
  'worcester-news': {
    name: 'Worcester News',
    url: 'https://www.worcesternews.co.uk/news/rss',
    publisher: 'Newsquest',
    verified: false,
  },
  'bedfordshire-live': {
    name: 'Bedfordshire Live',
    url: 'https://www.bedfordshirelive.co.uk/?service=rss',
    publisher: 'Reach',
    verified: false,
  },
  'bedford-independent': {
    name: 'Bedford Independent',
    url: 'https://www.bedfordindependent.co.uk/feed',
    publisher: 'Independent',
    verified: false,
  },
};

const LPA_MAPPINGS: [string, string[]][] = [
  // Cambridgeshire
  ['cambridge city', ['cambridge-news', 'cambridge-independent']],
  ['south cambridgeshire', ['cambridge-news', 'cambridge-independent']],
  ['east cambridgeshire', ['cambridge-news', 'cambridge-independent']],
  ['huntingdonshire', ['cambridge-news']],
  ['cambridgeshire', ['cambridge-news', 'cambridge-independent']],
  // Oxfordshire
  ['oxford city', ['oxford-mail']],
  ['vale of white horse', ['oxford-mail']],
  ['south oxfordshire', ['oxford-mail', 'henley-standard']],
  ['cherwell', ['oxford-mail', 'banbury-guardian']],
  ['west oxfordshire', ['oxford-mail', 'witney-gazette']],
  ['oxfordshire', ['oxford-mail']],
  // Gloucestershire
  ['cheltenham', ['gloucestershire-live']],
  ['gloucester city', ['gloucestershire-live']],
  ['tewkesbury', ['gloucestershire-live']],
  ['cotswold', ['gloucestershire-live']],
  ['gloucestershire', ['gloucestershire-live']],
  // Bedfordshire
  ['central bedfordshire', ['bedfordshire-live']],
  ['bedford borough', ['bedfordshire-live', 'bedford-independent']],
  ['bedfordshire', ['bedfordshire-live']],
  // West Midlands
  ['birmingham', ['birmingham-mail']],
  ['solihull', ['birmingham-mail']],
  ['sandwell', ['birmingham-mail']],
  ['bromsgrove', ['birmingham-mail', 'worcester-news']],
];

export function getFeedsForLpa(lpa: string): FeedSource[] {
  const normalised = lpa.toLowerCase();

  const feedIds = new Set<string>();
  for (const [keyword, ids] of LPA_MAPPINGS) {
    if (normalised.includes(keyword)) {
      for (const id of ids) feedIds.add(id);
    }
  }

  return Array.from(feedIds)
    .map((id) => FEED_LIBRARY[id])
    .filter((f): f is FeedSource => f !== undefined);
}
