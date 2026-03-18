import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase, requireRole } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import type { ReportContent, SentimentTrend } from '@/lib/types';

const REPORT_SYSTEM_PROMPT = `You are a media monitoring report writer for a UK planning consultancy. Given the project details and this week's analysis items, produce a structured weekly report.

Return ONLY valid JSON with these fields:
- key_developments: string (2-3 sentence summary of the most important developments this week)
- items_requiring_action: string (specific recommended actions based on the items, or "None this week" if no urgent items)
- sources_reviewed: string[] (brief list of source descriptions from the items)

Be concise, factual, and specific to UK planning context.`;

function getWeekBounds(): { weekStart: Date; weekEnd: Date; lastWeekStart: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);

  return {
    weekStart: thisMonday,
    weekEnd: now,
    lastWeekStart: lastMonday,
  };
}

function calculateSentimentTrend(
  thisWeekItems: Array<{ sentiment: string | null }>,
  lastWeekItems: Array<{ sentiment: string | null }>
): SentimentTrend {
  if (lastWeekItems.length === 0) return 'stable';

  const thisWeekPct = thisWeekItems.length > 0
    ? (thisWeekItems.filter((i) => i.sentiment === 'Supportive').length / thisWeekItems.length) * 100
    : 0;

  const lastWeekPct = (lastWeekItems.filter((i) => i.sentiment === 'Supportive').length / lastWeekItems.length) * 100;

  const diff = thisWeekPct - lastWeekPct;
  if (diff > 10) return 'improving';
  if (diff < -10) return 'worsening';
  return 'stable';
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(['admin', 'project_lead']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = await ensureUserInSupabase();
  const body = await req.json();
  const projectId = body.project_id as string;

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }

  // Get project
  const { data: projectData, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, planning_reference, lpa, application_stage, alert_level')
    .eq('id', projectId)
    .single();

  if (projectError || !projectData) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectData;

  const { weekStart, weekEnd, lastWeekStart } = getWeekBounds();

  // Get this week's approved items
  const { data: thisWeekItems } = await supabaseAdmin
    .from('analysis_items')
    .select('id, sentiment, alert_level, summary, recommended_action, notable_voices, source_type')
    .eq('project_id', projectId)
    .eq('review_status', 'approved')
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString());

  // Get last week's approved items for trend
  const lastSunday = new Date(weekStart);
  lastSunday.setDate(weekStart.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);

  const { data: lastWeekItems } = await supabaseAdmin
    .from('analysis_items')
    .select('sentiment')
    .eq('project_id', projectId)
    .eq('review_status', 'approved')
    .gte('created_at', lastWeekStart.toISOString())
    .lte('created_at', lastSunday.toISOString());

  const items = thisWeekItems ?? [];
  const lastItems = lastWeekItems ?? [];
  const sentimentTrend = calculateSentimentTrend(items, lastItems);

  // Aggregate notable voices
  const allVoices: string[] = [];
  for (const item of items) {
    const voices = item.notable_voices as string[];
    if (Array.isArray(voices)) allVoices.push(...voices);
  }
  const uniqueVoices = [...new Set(allVoices)];

  // Determine alert level from most severe item
  let alertLevel: string = project.alert_level;
  if (items.some((i) => i.alert_level === 'Action Required')) alertLevel = 'red';
  else if (items.some((i) => i.alert_level === 'Watch') && alertLevel === 'green') alertLevel = 'yellow';

  // Generate AI report content
  let keyDevelopments = 'No items to analyse this week.';
  let itemsRequiringAction = 'None this week.';
  let sourcesReviewed: string[] = [];

  if (items.length > 0) {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('API key not configured');

      const client = new Anthropic({ apiKey });

      const itemSummaries = items.map((i, idx) =>
        `Item ${idx + 1}: [${i.sentiment}] [${i.alert_level}] ${i.summary} — Action: ${i.recommended_action}`
      ).join('\n');

      const userContent = `Project: ${project.client_name} — ${project.site_name}
Planning ref: ${project.planning_reference ?? 'N/A'}
LPA: ${project.lpa}
Stage: ${project.application_stage}

This week's ${items.length} analysis items:
${itemSummaries}`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: REPORT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      try {
        const parsed = JSON.parse(responseText) as {
          key_developments: string;
          items_requiring_action: string;
          sources_reviewed: string[];
        };
        keyDevelopments = parsed.key_developments;
        itemsRequiringAction = parsed.items_requiring_action;
        sourcesReviewed = Array.isArray(parsed.sources_reviewed) ? parsed.sources_reviewed : [];
      } catch {
        // Fallback: use concatenated summaries
        keyDevelopments = items.slice(0, 3).map((i) => i.summary).join(' ');
        itemsRequiringAction = items
          .filter((i) => i.alert_level === 'Action Required')
          .map((i) => i.recommended_action)
          .join('; ') || 'None this week.';
      }
    } catch {
      // AI unavailable — fallback to manual aggregation
      keyDevelopments = items.slice(0, 3).map((i) => i.summary).join(' ');
      itemsRequiringAction = items
        .filter((i) => i.alert_level === 'Action Required')
        .map((i) => i.recommended_action)
        .join('; ') || 'None this week.';
    }
  }

  if (sourcesReviewed.length === 0) {
    sourcesReviewed = items.map((i) =>
      i.source_type ? `${i.source_type.replace(/_/g, ' ')}` : 'Unknown source'
    );
  }

  const reportContent: ReportContent = {
    client_name: project.client_name,
    site_name: project.site_name,
    coverage_volume: items.length,
    sentiment_trend: sentimentTrend,
    alert_level: alertLevel as ReportContent['alert_level'],
    key_developments: keyDevelopments,
    notable_voices: uniqueVoices,
    items_requiring_action: itemsRequiringAction,
    sources_reviewed: sourcesReviewed,
  };

  const alertEmoji = alertLevel === 'red' ? '\uD83D\uDD34' : alertLevel === 'yellow' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';

  const reportText = `${project.client_name} \u2014 ${project.site_name}
Coverage volume this week: ${items.length}
Sentiment trend: ${sentimentTrend}
Alert level: ${alertEmoji}
Key developments: ${keyDevelopments}
Notable voices: ${uniqueVoices.length > 0 ? uniqueVoices.join(', ') : 'None identified this week'}
Items requiring action: ${itemsRequiringAction}
Sources reviewed: ${sourcesReviewed.join(', ')}`;

  // Save to database (immutable)
  const { data: report, error: saveError } = await supabaseAdmin
    .from('reports')
    .insert({
      project_id: projectId,
      report_content: reportContent as unknown as Record<string, unknown>,
      report_text: reportText,
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
      coverage_count: items.length,
      sentiment_trend: sentimentTrend,
      alert_level: alertLevel,
      generated_by: userId,
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json(report, { status: 201 });
}
