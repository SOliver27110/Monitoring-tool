import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, Sentiment, ItemAlertLevel } from '@/lib/types';

const SYSTEM_PROMPT = `You are a media monitoring analyst for a UK planning consultancy. Analyse the following content and return a JSON object with these fields: summary (2-3 sentences), sentiment (Supportive / Neutral / Opposed / Mixed), alert_level (Routine / Watch / Action Required), notable_voices (array of any elected members, journalists, parish councils, amenity groups mentioned), key_themes (array), recommended_action (1-2 sentences). Apply Action Required for: organised opposition, elected members publicly opposing, factual errors in media, viral content, committee call-ins.

Return ONLY valid JSON, no markdown fences or additional text.`;

const MAX_INPUT_CHARS = 12000;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

const SENTIMENT_ALIASES: Record<string, Sentiment> = {
  supportive: 'Supportive',
  positive: 'Supportive',
  favourable: 'Supportive',
  favorable: 'Supportive',
  neutral: 'Neutral',
  balanced: 'Neutral',
  factual: 'Neutral',
  opposed: 'Opposed',
  negative: 'Opposed',
  critical: 'Opposed',
  unfavourable: 'Opposed',
  unfavorable: 'Opposed',
  mixed: 'Mixed',
};

const ALERT_ALIASES: Record<string, ItemAlertLevel> = {
  routine: 'Routine',
  low: 'Routine',
  normal: 'Routine',
  watch: 'Watch',
  medium: 'Watch',
  monitor: 'Watch',
  'action required': 'Action Required',
  high: 'Action Required',
  urgent: 'Action Required',
};

function normaliseSentiment(raw: unknown): Sentiment {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const match = SENTIMENT_ALIASES[key];
  if (match) return match;
  throw new Error(`Unrecognised sentiment from model: ${JSON.stringify(raw)}`);
}

function normaliseAlertLevel(raw: unknown): ItemAlertLevel {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const match = ALERT_ALIASES[key];
  if (match) return match;
  throw new Error(`Unrecognised alert_level from model: ${JSON.stringify(raw)}`);
}

function extractJson(raw: string): string {
  // Strip common markdown fence variants: ```json ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // Fall back to the first top-level { ... } block.
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw.trim();
}

export async function analyseContent(text: string): Promise<AnalysisResult> {
  const client = getClient();
  const truncated = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS)
    : text;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
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

  const jsonText = extractJson(responseText);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    const preview = responseText.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Analysis failed — model did not return valid JSON. Got: ${preview}`);
  }

  if (!parsed.summary || !parsed.recommended_action) {
    throw new Error('Analysis failed — incomplete response (missing summary or recommended_action).');
  }

  return {
    summary: String(parsed.summary),
    sentiment: normaliseSentiment(parsed.sentiment),
    alert_level: normaliseAlertLevel(parsed.alert_level),
    notable_voices: Array.isArray(parsed.notable_voices) ? (parsed.notable_voices as string[]) : [],
    key_themes: Array.isArray(parsed.key_themes) ? (parsed.key_themes as string[]) : [],
    recommended_action: String(parsed.recommended_action),
  };
}
