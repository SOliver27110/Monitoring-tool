import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult } from '@/lib/types';

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

  return {
    summary: parsed.summary,
    sentiment: parsed.sentiment,
    alert_level: parsed.alert_level,
    notable_voices: Array.isArray(parsed.notable_voices) ? parsed.notable_voices : [],
    key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes : [],
    recommended_action: parsed.recommended_action,
  };
}
