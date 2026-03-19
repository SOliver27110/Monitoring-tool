import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';

const rssParser = new Parser();

const SYSTEM_PROMPT = `You are an expert on UK local media, news outlets, and planning information sources. Given a Local Planning Authority (LPA) area and optional project details, suggest RSS feeds and Google News search queries that would be useful for monitoring local planning news coverage.

For each suggestion provide:
- name: A short descriptive name
- url: The actual RSS feed URL or Google News search query
- feed_type: One of "google_news", "local_news", "planning_press", "council"

CRITICAL RULES FOR RSS URLs:
- ONLY suggest RSS feed URLs you are HIGHLY confident actually exist and are currently active
- Stick to well-known, major outlets where RSS is standard (BBC, major regional newspaper groups like Reach plc / Newsquest / JPI Media)
- BBC local RSS feeds follow the pattern: https://feeds.bbci.co.uk/news/england/[region]/rss.xml
- Do NOT guess or construct RSS URLs — if you are not sure an RSS feed exists, use a google_news search query instead
- It is far better to suggest a google_news search than a broken RSS URL
- For council feeds: most UK councils do NOT have public RSS feeds for planning. Use a google_news query scoped to the council name instead

For google_news type: provide a search query string (not a URL). These are always safe.

For planning_press: national trade outlets like Planning Resource, The Planner. Only include if you know their RSS URL.

Always include at least 3-4 Google News searches tailored to the project and area.
Suggest 6-10 feeds total. Prefer more google_news queries over uncertain RSS URLs.

Return ONLY a valid JSON array of objects with fields: name, url, feed_type. No markdown fences or extra text.`;

/**
 * Validate an RSS URL by attempting to fetch and parse it.
 * Returns true if it returns valid RSS/Atom XML with at least one item.
 */
async function validateRssUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DevComms-MediaMonitor/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) return false;

    const text = await response.text();

    // Quick check: does it look like XML/RSS?
    if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<channel')) {
      return false;
    }

    // Full parse to confirm it's valid
    const feed = await rssParser.parseString(text);
    return (feed.items?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export interface FeedSuggestion {
  name: string;
  url: string;
  feed_type: string;
  verified: boolean | null; // null = not applicable (google_news), true = validated, false = failed
}

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

Suggest RSS feeds and search queries for monitoring planning-related media coverage in this area.`;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const rawSuggestions = JSON.parse(responseText) as Array<{
      name: string;
      url: string;
      feed_type: string;
    }>;

    if (!Array.isArray(rawSuggestions)) {
      throw new Error('Invalid response format');
    }

    const validTypes = ['google_news', 'local_news', 'planning_press', 'council'];
    const cleaned = rawSuggestions.filter(
      (s) => s.name && s.url && validTypes.includes(s.feed_type)
    );

    // Validate RSS URLs in parallel (skip google_news — those are always valid)
    const results: FeedSuggestion[] = await Promise.all(
      cleaned.map(async (s) => {
        if (s.feed_type === 'google_news') {
          return { ...s, verified: null };
        }

        const isValid = await validateRssUrl(s.url);
        return { ...s, verified: isValid };
      })
    );

    // Sort: verified first, then google_news, then unverified last
    results.sort((a, b) => {
      const order = (v: boolean | null) => (v === true ? 0 : v === null ? 1 : 2);
      return order(a.verified) - order(b.verified);
    });

    return NextResponse.json(results);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Failed to generate suggestions';
    return NextResponse.json({ error: errMessage }, { status: 502 });
  }
}
