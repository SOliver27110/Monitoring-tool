import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult } from '@/lib/types';

const CLASSIFICATION_SYSTEM_PROMPT = `You are a media monitoring analyst for a UK planning consultancy. Analyse the following content and return a JSON object with these fields:
- summary (2-3 sentences)
- sentiment (Supportive / Neutral / Opposed / Mixed)
- alert_level (Routine / Watch / Action Required)
- notable_voices (array of any elected members, journalists, parish councils, amenity groups mentioned)
- key_themes (array)
- recommended_action (1-2 sentences)
- confidence_score (integer 0-100 — how confident you are in the classification accuracy. Use lower scores when: the article is ambiguous, content is very short, sentiment is unclear, or relevance to planning is borderline)

Apply Action Required for: organised opposition, elected members publicly opposing, factual errors in media, viral content, committee call-ins.

Return ONLY valid JSON, no markdown fences or additional text.`;

const REPORT_SYSTEM_PROMPT = `You are a media monitoring report writer for a UK planning consultancy. Given the project details and this week's analysis items, produce a structured weekly report.

Return ONLY valid JSON with these fields:
- key_developments: string (2-3 sentence summary of the most important developments this week)
- items_requiring_action: string (specific recommended actions based on the items, or "None this week" if no urgent items)
- sources_reviewed: string[] (brief list of source descriptions from the items)

Be concise, factual, and specific to UK planning context.`;

const MAX_INPUT_CHARS = 12000;
const NEEDS_REVIEW_THRESHOLD = 50;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

/**
 * Classify and analyse content using Haiku (fast, cheap).
 * Returns analysis with a confidence score.
 * Items with confidence < 50 are flagged as needs_review.
 */
export async function analyseContent(text: string): Promise<AnalysisResult> {
  const client = getClient();
  const truncated = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS)
    : text;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: truncated,
      },
    ],
  });

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(responseText) as AnalysisResult;
  } catch {
    throw new Error('Analysis failed — please try again.');
  }

  if (
    !parsed.summary ||
    !parsed.sentiment ||
    !parsed.alert_level ||
    !parsed.recommended_action
  ) {
    throw new Error('Analysis failed — incomplete response. Please try again.');
  }

  const confidenceScore = typeof parsed.confidence_score === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.confidence_score)))
    : 50; // default to threshold if not provided

  return {
    summary: parsed.summary,
    sentiment: parsed.sentiment,
    alert_level: parsed.alert_level,
    notable_voices: Array.isArray(parsed.notable_voices) ? parsed.notable_voices : [],
    key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes : [],
    recommended_action: parsed.recommended_action,
    confidence_score: confidenceScore,
  };
}

/**
 * Generate report content using Sonnet (higher quality for client-facing output).
 */
export async function generateReportContent(
  userContent: string
): Promise<{
  key_developments: string;
  items_requiring_action: string;
  sources_reviewed: string[];
}> {
  const client = getClient();

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

  const parsed = JSON.parse(responseText) as {
    key_developments: string;
    items_requiring_action: string;
    sources_reviewed: string[];
  };

  return {
    key_developments: parsed.key_developments,
    items_requiring_action: parsed.items_requiring_action,
    sources_reviewed: Array.isArray(parsed.sources_reviewed) ? parsed.sources_reviewed : [],
  };
}

export { NEEDS_REVIEW_THRESHOLD };
