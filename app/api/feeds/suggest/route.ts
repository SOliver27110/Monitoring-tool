import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an expert on UK local media, news outlets, and planning information sources. Given a Local Planning Authority (LPA) area and optional project details, suggest RSS feeds and Google News search queries that would be useful for monitoring local planning news coverage.

For each suggestion provide:
- name: A short descriptive name
- url: The actual RSS feed URL or Google News search query
- feed_type: One of "google_news", "local_news", "planning_press", "council"

Guidelines:
- For google_news: provide a search query string (not a URL)
- For local_news: provide actual RSS feed URLs for regional/local newspapers covering that area. Only suggest feeds you are confident exist. Common patterns: /rss, /feed, /rss.xml
- For planning_press: include national planning trade outlets like Planning Resource, Planning Portal, The Planner if relevant
- For council: suggest the council's planning page RSS if likely to exist, or a Google News query scoped to the council name + planning
- Always include at least 2-3 Google News searches tailored to the project
- Be realistic — don't invent URLs. If you're unsure about a specific RSS URL, use a Google News search instead
- Suggest 5-10 feeds total

Return ONLY a valid JSON array of objects with fields: name, url, feed_type. No markdown fences or extra text.`;

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

    const suggestions = JSON.parse(responseText) as Array<{
      name: string;
      url: string;
      feed_type: string;
    }>;

    if (!Array.isArray(suggestions)) {
      throw new Error('Invalid response format');
    }

    // Validate feed_type values
    const validTypes = ['google_news', 'local_news', 'planning_press', 'council'];
    const cleaned = suggestions
      .filter((s) => s.name && s.url && validTypes.includes(s.feed_type))
      .map((s) => ({
        name: s.name,
        url: s.url,
        feed_type: s.feed_type,
      }));

    return NextResponse.json(cleaned);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate suggestions';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
