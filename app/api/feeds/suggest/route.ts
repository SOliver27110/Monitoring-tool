import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import { buildProjectQuery, buildAreaIntelligenceQuery } from '@/lib/google-news-query';

const rssParser = new Parser();

// ─── Curated RSS feeds ───────────────────────────────────────────────
// We maintain known-good URLs here rather than asking the LLM to guess them.

interface CuratedFeed {
  name: string;
  url: string;
  feed_type: 'local_news' | 'planning_press' | 'council';
  /** Lowercase keywords that match this feed to an LPA / region */
  keywords: string[];
}

const NATIONAL_PLANNING_FEEDS: CuratedFeed[] = [
  {
    name: 'Planning Resource',
    url: 'https://www.planningresource.co.uk/article-list/rss',
    feed_type: 'planning_press',
    keywords: [],
  },
  {
    name: 'The Planner (RTPI)',
    url: 'https://www.theplanner.co.uk/feed',
    feed_type: 'planning_press',
    keywords: [],
  },
];

const BBC_REGIONAL_FEEDS: CuratedFeed[] = [
  { name: 'BBC Beds, Bucks & Herts', url: 'https://feeds.bbci.co.uk/news/england/beds_bucks_and_herts/rss.xml', feed_type: 'local_news', keywords: ['bedfordshire', 'bedford', 'luton', 'central bedfordshire', 'buckinghamshire', 'hertfordshire', 'stevenage', 'watford', 'st albans', 'dacorum', 'aylesbury', 'milton keynes', 'dunstable', 'leighton buzzard', 'barton-le-clay'] },
  { name: 'BBC Berkshire', url: 'https://feeds.bbci.co.uk/news/england/berkshire/rss.xml', feed_type: 'local_news', keywords: ['berkshire', 'reading', 'slough', 'windsor', 'maidenhead', 'bracknell', 'wokingham', 'west berkshire', 'newbury'] },
  { name: 'BBC Birmingham & Black Country', url: 'https://feeds.bbci.co.uk/news/england/birmingham_and_black_country/rss.xml', feed_type: 'local_news', keywords: ['birmingham', 'sandwell', 'dudley', 'wolverhampton', 'walsall', 'black country'] },
  { name: 'BBC Bristol', url: 'https://feeds.bbci.co.uk/news/england/bristol/rss.xml', feed_type: 'local_news', keywords: ['bristol', 'south gloucestershire', 'north somerset'] },
  { name: 'BBC Cambridgeshire', url: 'https://feeds.bbci.co.uk/news/england/cambridgeshire/rss.xml', feed_type: 'local_news', keywords: ['cambridgeshire', 'cambridge', 'peterborough', 'huntingdonshire', 'fenland', 'east cambridgeshire', 'south cambridgeshire'] },
  { name: 'BBC Cornwall', url: 'https://feeds.bbci.co.uk/news/england/cornwall/rss.xml', feed_type: 'local_news', keywords: ['cornwall', 'truro', 'falmouth', 'newquay', 'penzance', 'isles of scilly'] },
  { name: 'BBC Coventry & Warwickshire', url: 'https://feeds.bbci.co.uk/news/england/coventry_and_warwickshire/rss.xml', feed_type: 'local_news', keywords: ['coventry', 'warwickshire', 'warwick', 'rugby', 'stratford-upon-avon', 'nuneaton'] },
  { name: 'BBC Cumbria', url: 'https://feeds.bbci.co.uk/news/england/cumbria/rss.xml', feed_type: 'local_news', keywords: ['cumbria', 'carlisle', 'barrow', 'kendal', 'penrith', 'workington', 'lake district', 'westmorland'] },
  { name: 'BBC Derby', url: 'https://feeds.bbci.co.uk/news/england/derbyshire/rss.xml', feed_type: 'local_news', keywords: ['derbyshire', 'derby', 'chesterfield', 'high peak', 'amber valley', 'erewash'] },
  { name: 'BBC Devon', url: 'https://feeds.bbci.co.uk/news/england/devon/rss.xml', feed_type: 'local_news', keywords: ['devon', 'exeter', 'plymouth', 'torbay', 'torquay', 'barnstaple', 'north devon', 'south hams', 'teignbridge'] },
  { name: 'BBC Dorset', url: 'https://feeds.bbci.co.uk/news/england/dorset/rss.xml', feed_type: 'local_news', keywords: ['dorset', 'bournemouth', 'poole', 'christchurch', 'weymouth', 'dorchester', 'bcp council'] },
  { name: 'BBC Essex', url: 'https://feeds.bbci.co.uk/news/england/essex/rss.xml', feed_type: 'local_news', keywords: ['essex', 'chelmsford', 'colchester', 'southend', 'basildon', 'braintree', 'brentwood', 'epping', 'harlow', 'thurrock', 'tendring', 'maldon', 'uttlesford', 'rochford', 'castle point'] },
  { name: 'BBC Gloucestershire', url: 'https://feeds.bbci.co.uk/news/england/gloucestershire/rss.xml', feed_type: 'local_news', keywords: ['gloucestershire', 'gloucester', 'cheltenham', 'stroud', 'cotswold', 'tewkesbury', 'forest of dean'] },
  { name: 'BBC Hampshire & Isle of Wight', url: 'https://feeds.bbci.co.uk/news/england/hampshire/rss.xml', feed_type: 'local_news', keywords: ['hampshire', 'southampton', 'portsmouth', 'winchester', 'basingstoke', 'eastleigh', 'fareham', 'gosport', 'havant', 'isle of wight', 'new forest', 'hart', 'rushmoor', 'test valley'] },
  { name: 'BBC Hereford & Worcester', url: 'https://feeds.bbci.co.uk/news/england/hereford_and_worcester/rss.xml', feed_type: 'local_news', keywords: ['herefordshire', 'worcestershire', 'worcester', 'hereford', 'malvern', 'redditch', 'bromsgrove', 'wychavon', 'wyre forest'] },
  { name: 'BBC Humberside', url: 'https://feeds.bbci.co.uk/news/england/humber/rss.xml', feed_type: 'local_news', keywords: ['hull', 'east riding', 'north lincolnshire', 'north east lincolnshire', 'humberside', 'grimsby', 'scunthorpe', 'beverley'] },
  { name: 'BBC Kent', url: 'https://feeds.bbci.co.uk/news/england/kent/rss.xml', feed_type: 'local_news', keywords: ['kent', 'canterbury', 'maidstone', 'medway', 'thanet', 'dover', 'folkestone', 'ashford', 'tunbridge wells', 'dartford', 'gravesham', 'sevenoaks', 'tonbridge', 'swale'] },
  { name: 'BBC Lancashire', url: 'https://feeds.bbci.co.uk/news/england/lancashire/rss.xml', feed_type: 'local_news', keywords: ['lancashire', 'lancaster', 'preston', 'blackpool', 'blackburn', 'burnley', 'chorley', 'fylde', 'hyndburn', 'pendle', 'ribble valley', 'rossendale', 'south ribble', 'west lancashire', 'wyre'] },
  { name: 'BBC Leeds & West Yorkshire', url: 'https://feeds.bbci.co.uk/news/england/leeds_and_west_yorkshire/rss.xml', feed_type: 'local_news', keywords: ['leeds', 'west yorkshire', 'bradford', 'calderdale', 'halifax', 'kirklees', 'huddersfield', 'wakefield'] },
  { name: 'BBC Leicestershire', url: 'https://feeds.bbci.co.uk/news/england/leicestershire/rss.xml', feed_type: 'local_news', keywords: ['leicestershire', 'leicester', 'charnwood', 'hinckley', 'harborough', 'melton', 'blaby', 'oadby'] },
  { name: 'BBC Lincolnshire', url: 'https://feeds.bbci.co.uk/news/england/lincolnshire/rss.xml', feed_type: 'local_news', keywords: ['lincolnshire', 'lincoln', 'boston', 'south kesteven', 'north kesteven', 'east lindsey', 'south holland', 'west lindsey'] },
  { name: 'BBC London', url: 'https://feeds.bbci.co.uk/news/england/london/rss.xml', feed_type: 'local_news', keywords: ['london', 'westminster', 'camden', 'islington', 'hackney', 'tower hamlets', 'southwark', 'lambeth', 'wandsworth', 'hammersmith', 'kensington', 'chelsea', 'greenwich', 'lewisham', 'newham', 'barking', 'havering', 'redbridge', 'waltham forest', 'haringey', 'enfield', 'barnet', 'brent', 'ealing', 'hounslow', 'richmond', 'kingston', 'merton', 'sutton', 'croydon', 'bromley', 'bexley', 'hillingdon', 'harrow', 'city of london'] },
  { name: 'BBC Manchester', url: 'https://feeds.bbci.co.uk/news/england/manchester/rss.xml', feed_type: 'local_news', keywords: ['manchester', 'salford', 'trafford', 'stockport', 'tameside', 'oldham', 'rochdale', 'bury', 'bolton', 'wigan', 'greater manchester'] },
  { name: 'BBC Merseyside', url: 'https://feeds.bbci.co.uk/news/england/merseyside/rss.xml', feed_type: 'local_news', keywords: ['merseyside', 'liverpool', 'sefton', 'knowsley', 'st helens', 'wirral'] },
  { name: 'BBC Norfolk', url: 'https://feeds.bbci.co.uk/news/england/norfolk/rss.xml', feed_type: 'local_news', keywords: ['norfolk', 'norwich', 'great yarmouth', 'kings lynn', 'breckland', 'broadland', 'north norfolk', 'south norfolk'] },
  { name: 'BBC North Yorkshire', url: 'https://feeds.bbci.co.uk/news/england/north_yorkshire/rss.xml', feed_type: 'local_news', keywords: ['north yorkshire', 'york', 'harrogate', 'scarborough', 'selby', 'craven', 'hambleton', 'richmondshire', 'ryedale'] },
  { name: 'BBC Northampton', url: 'https://feeds.bbci.co.uk/news/england/northamptonshire/rss.xml', feed_type: 'local_news', keywords: ['northamptonshire', 'northampton', 'kettering', 'corby', 'wellingborough', 'daventry', 'east northamptonshire', 'south northamptonshire', 'west northamptonshire', 'north northamptonshire'] },
  { name: 'BBC Nottinghamshire', url: 'https://feeds.bbci.co.uk/news/england/nottinghamshire/rss.xml', feed_type: 'local_news', keywords: ['nottinghamshire', 'nottingham', 'mansfield', 'ashfield', 'bassetlaw', 'broxtowe', 'gedling', 'newark', 'rushcliffe'] },
  { name: 'BBC Oxfordshire', url: 'https://feeds.bbci.co.uk/news/england/oxfordshire/rss.xml', feed_type: 'local_news', keywords: ['oxfordshire', 'oxford', 'cherwell', 'south oxfordshire', 'vale of white horse', 'west oxfordshire'] },
  { name: 'BBC Sheffield & South Yorkshire', url: 'https://feeds.bbci.co.uk/news/england/south_yorkshire/rss.xml', feed_type: 'local_news', keywords: ['sheffield', 'south yorkshire', 'doncaster', 'barnsley', 'rotherham'] },
  { name: 'BBC Shropshire', url: 'https://feeds.bbci.co.uk/news/england/shropshire/rss.xml', feed_type: 'local_news', keywords: ['shropshire', 'shrewsbury', 'telford'] },
  { name: 'BBC Somerset', url: 'https://feeds.bbci.co.uk/news/england/somerset/rss.xml', feed_type: 'local_news', keywords: ['somerset', 'taunton', 'bath', 'north east somerset', 'mendip', 'sedgemoor', 'south somerset', 'bath and north east somerset'] },
  { name: 'BBC Staffordshire', url: 'https://feeds.bbci.co.uk/news/england/stoke_and_staffordshire/rss.xml', feed_type: 'local_news', keywords: ['staffordshire', 'stoke-on-trent', 'stafford', 'cannock', 'lichfield', 'tamworth', 'east staffordshire', 'south staffordshire', 'staffordshire moorlands', 'newcastle-under-lyme'] },
  { name: 'BBC Suffolk', url: 'https://feeds.bbci.co.uk/news/england/suffolk/rss.xml', feed_type: 'local_news', keywords: ['suffolk', 'ipswich', 'bury st edmunds', 'lowestoft', 'east suffolk', 'west suffolk', 'babergh', 'mid suffolk'] },
  { name: 'BBC Surrey', url: 'https://feeds.bbci.co.uk/news/england/surrey/rss.xml', feed_type: 'local_news', keywords: ['surrey', 'guildford', 'woking', 'reigate', 'banstead', 'epsom', 'elmbridge', 'mole valley', 'runnymede', 'spelthorne', 'surrey heath', 'tandridge', 'waverley'] },
  { name: 'BBC Sussex', url: 'https://feeds.bbci.co.uk/news/england/sussex/rss.xml', feed_type: 'local_news', keywords: ['sussex', 'brighton', 'hove', 'east sussex', 'west sussex', 'worthing', 'crawley', 'eastbourne', 'hastings', 'horsham', 'chichester', 'lewes', 'mid sussex', 'adur', 'arun', 'wealden', 'rother'] },
  { name: 'BBC Tees', url: 'https://feeds.bbci.co.uk/news/england/tees/rss.xml', feed_type: 'local_news', keywords: ['teesside', 'middlesbrough', 'stockton', 'darlington', 'hartlepool', 'redcar'] },
  { name: 'BBC Tyne & Wear', url: 'https://feeds.bbci.co.uk/news/england/tyne_and_wear/rss.xml', feed_type: 'local_news', keywords: ['tyne and wear', 'newcastle', 'sunderland', 'gateshead', 'south tyneside', 'north tyneside', 'northumberland', 'county durham', 'durham'] },
  { name: 'BBC Wiltshire', url: 'https://feeds.bbci.co.uk/news/england/wiltshire/rss.xml', feed_type: 'local_news', keywords: ['wiltshire', 'swindon', 'salisbury', 'chippenham', 'trowbridge'] },
  { name: 'BBC York & North Yorkshire', url: 'https://feeds.bbci.co.uk/news/england/york_and_north_yorkshire/rss.xml', feed_type: 'local_news', keywords: ['york', 'north yorkshire'] },
];

/**
 * Match curated BBC feeds to an LPA string (case-insensitive substring match).
 */
function matchRegionalFeeds(lpa: string): CuratedFeed[] {
  const lpaLower = lpa.toLowerCase();
  return BBC_REGIONAL_FEEDS.filter((feed) =>
    feed.keywords.some((kw) => lpaLower.includes(kw) || kw.includes(lpaLower))
  );
}

// ─── Sonnet prompt (Google News queries only) ────────────────────────

const SYSTEM_PROMPT = `You are an expert on UK local planning and media. Given a Local Planning Authority (LPA) area and optional project details, suggest Google News search queries that would be useful for monitoring planning-related media coverage.

For each suggestion provide:
- name: A short descriptive name for the search
- url: The Google News search query string (NOT a URL — just the search terms)
- feed_type: Always "google_news"

Guidelines:
- Suggest 5-7 Google News search queries
- Include queries scoped to the LPA/council name + planning keywords
- Include queries for the specific site/client/developer if provided
- Include queries for the town or village name + development/planning
- Include at least one query scoped to the council website using site: operator if relevant
- Make queries specific enough to return relevant results but not so narrow they miss coverage

Return ONLY a valid JSON array of objects with fields: name, url, feed_type. No markdown fences or extra text.`;

// ─── RSS validation ──────────────────────────────────────────────────

async function validateRssUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DevComms-MediaMonitor/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) return false;

    const text = await response.text();

    if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<channel')) {
      return false;
    }

    const feed = await rssParser.parseString(text);
    return (feed.items?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Types ───────────────────────────────────────────────────────────

export interface FeedSuggestion {
  name: string;
  url: string;
  feed_type: string;
  verified: boolean | null; // null = google_news (always valid), true = RSS verified, false = RSS failed
}

// ─── Route handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const body = await req.json();
  const { lpa, client_name, site_name, planning_reference } = body;

  if (!lpa) {
    return NextResponse.json({ error: 'LPA is required' }, { status: 400 });
  }

  const userPrompt = `Local Planning Authority: ${lpa}
${client_name ? `Client: ${client_name}` : ''}
${site_name ? `Site: ${site_name}` : ''}
${planning_reference ? `Planning Reference: ${planning_reference}` : ''}

Suggest Google News search queries for monitoring planning-related media coverage in this area.`;

  try {
    // 1. Look up curated RSS feeds for this region
    const regionalFeeds = matchRegionalFeeds(lpa);
    const curatedFeeds: CuratedFeed[] = [...NATIONAL_PLANNING_FEEDS, ...regionalFeeds];

    // 2. Ask Sonnet for Google News queries only (no URLs to hallucinate)
    const client = new Anthropic({ apiKey });

    const [message, ...validationResults] = await Promise.all([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      // 3. Validate curated RSS feeds in parallel
      ...curatedFeeds.map(async (feed): Promise<FeedSuggestion> => {
        const isValid = await validateRssUrl(feed.url);
        return {
          name: feed.name,
          url: feed.url,
          feed_type: feed.feed_type,
          verified: isValid,
        };
      }),
    ]);

    // 4. Parse Sonnet's Google News suggestions
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    let googleNewsSuggestions: FeedSuggestion[] = [];
    try {
      const parsed = JSON.parse(responseText) as Array<{
        name: string;
        url: string;
        feed_type: string;
      }>;

      if (Array.isArray(parsed)) {
        googleNewsSuggestions = parsed
          .filter((s) => s.name && s.url && s.feed_type === 'google_news')
          .map((s) => ({
            name: s.name,
            url: s.url,
            feed_type: 'google_news' as const,
            verified: null,
          }));
      }
    } catch {
      // If Sonnet's response is malformed, proceed with just curated feeds
    }

    // 5. Generate deterministic Google News queries from project fields
    const deterministicSuggestions: FeedSuggestion[] = [];

    const projectQuery = buildProjectQuery({
      planning_reference: planning_reference ?? '',
      site_name: site_name ?? '',
      client_name: client_name ?? '',
      exclusion_terms: '',
    });
    if (projectQuery) {
      deterministicSuggestions.push({
        name: `Project Search: ${site_name || planning_reference || 'Project'}`,
        url: projectQuery,
        feed_type: 'google_news',
        verified: null,
      });
    }

    const areaQuery = buildAreaIntelligenceQuery({
      site_name: site_name ?? '',
      lpa: lpa ?? '',
    });
    if (areaQuery) {
      deterministicSuggestions.push({
        name: `Area Intelligence: ${site_name || lpa}`,
        url: areaQuery,
        feed_type: 'google_news',
        verified: null,
      });
    }

    // 6. Combine: verified RSS first, then deterministic queries, then LLM suggestions, then unverified RSS
    const rssResults = validationResults as FeedSuggestion[];
    const allResults = [...rssResults, ...deterministicSuggestions, ...googleNewsSuggestions];

    allResults.sort((a, b) => {
      const order = (v: boolean | null) => (v === true ? 0 : v === null ? 1 : 2);
      return order(a.verified) - order(b.verified);
    });

    return NextResponse.json(allResults);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Failed to generate suggestions';
    return NextResponse.json({ error: errMessage }, { status: 502 });
  }
}
