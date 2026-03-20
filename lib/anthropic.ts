import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, KeyEntities, MatchConfidence } from '@/lib/types';

const DEFAULT_KEY_ENTITIES: KeyEntities = {
  councillors: [],
  journalists: [],
  opposition_groups: [],
  supporters: [],
  organisations: [],
};

const CLASSIFICATION_SYSTEM_PROMPT = `You are a media monitoring analyst for a UK planning and communications consultancy. You analyse news articles about planning applications and development projects.

For each article, return a JSON object with the following fields. Be precise and factual — do not invent names or organisations. If a field has no relevant data, use an empty array or null as appropriate.

- summary: A two-sentence summary focused on what this means for the project and client.
- sentiment: How the article portrays the development project. "Supportive" if positive about the development, "Opposed" if negative/critical, "Neutral" if factual reporting without clear stance, "Mixed" if it presents both sides.
- alert_level: "Routine" for standard coverage needing no response. "Watch" if it involves elected members, journalists, or local groups and may need monitoring. "Action Required" if there are factual errors, organised opposition forming, viral social media activity, committee call-in, or elected members publicly opposing.
- notable_voices: Array of any elected members, journalists, parish councils, amenity groups mentioned.
- key_themes: Array of general themes.
- recommended_action: 1-2 sentences on what the communications team should do.
- confidence_score: Integer 0-100 — how confident you are in the classification accuracy. Use lower scores when the article is ambiguous, content is very short, sentiment is unclear, or relevance to planning is borderline.
- key_entities: An object with five arrays:
  - councillors: Named councillors or elected members (e.g. "Cllr Jane Smith")
  - journalists: Named journalists with publication (e.g. "John Reporter, Cambridge Independent")
  - opposition_groups: Named opposition or campaign groups (e.g. "Cherry Hinton Action Group")
  - supporters: Named individuals or groups supporting the development
  - organisations: Named organisations such as councils, government bodies, developers (e.g. "South Cambridgeshire District Council")
  Only include names actually stated in the article.
- is_new_information: true if this article contains genuinely new information — a new committee date, a new objection group, a new councillor statement, a new decision. false if it rehashes previously reported information.
- new_information_detail: If is_new_information is true, one sentence describing what is new. null otherwise.
- match_confidence: "definite" if the article is clearly about this specific project. "likely" if it probably is but could be about something else nearby. "tangential" if it's about the broader area or a related topic but not this specific project.
- planning_stage_mentioned: What stage of the planning process does this article relate to, if identifiable. One of: "application", "consultation", "committee", "decision", "appeal", "construction", "other", or null.
- themes: Which planning-relevant themes are present. Only use from this list: traffic, affordable housing, green belt, heritage, flooding, infrastructure, environment, biodiversity, density, design, community facilities, noise, air quality, employment, school places, NHS capacity, brownfield, agricultural land, economic benefit, construction disruption.

Return ONLY the JSON object. No markdown formatting, no explanation, no preamble.`;

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

export interface ProjectContext {
  site_name: string;
  planning_reference: string;
  client_name: string;
}

/**
 * Classify and analyse content using Haiku (fast, cheap).
 * Returns analysis with a confidence score.
 * Items with confidence < 50 are flagged as needs_review.
 */
export async function analyseContent(
  text: string,
  projectContext?: ProjectContext
): Promise<AnalysisResult> {
  const client = getClient();
  const truncated = text.length > MAX_INPUT_CHARS
    ? text.slice(0, MAX_INPUT_CHARS)
    : text;

  // Prepend project context so the model can assess match_confidence
  let userContent = truncated;
  if (projectContext) {
    userContent = `Project context: Site: ${projectContext.site_name}, Ref: ${projectContext.planning_reference}, Client: ${projectContext.client_name}\n\nArticle to analyse:\n${truncated}`;
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Strip markdown fences if model wraps response in ```json ... ```
  const cleaned = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    console.error('[analyseContent] Failed to parse response:', responseText.slice(0, 500));
    throw new Error('Analysis returned invalid JSON — please try again.');
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
    : 50;

  // Parse key_entities with safe defaults
  const rawEntities = (parsed.key_entities && typeof parsed.key_entities === 'object')
    ? parsed.key_entities as Record<string, unknown>
    : {};
  const keyEntities: KeyEntities = {
    councillors: Array.isArray(rawEntities.councillors) ? rawEntities.councillors as string[] : [],
    journalists: Array.isArray(rawEntities.journalists) ? rawEntities.journalists as string[] : [],
    opposition_groups: Array.isArray(rawEntities.opposition_groups) ? rawEntities.opposition_groups as string[] : [],
    supporters: Array.isArray(rawEntities.supporters) ? rawEntities.supporters as string[] : [],
    organisations: Array.isArray(rawEntities.organisations) ? rawEntities.organisations as string[] : [],
  };

  const validConfidences = new Set<MatchConfidence>(['definite', 'likely', 'tangential']);
  const rawConfidence = parsed.match_confidence as string;

  return {
    summary: parsed.summary as string,
    sentiment: parsed.sentiment as AnalysisResult['sentiment'],
    alert_level: parsed.alert_level as AnalysisResult['alert_level'],
    notable_voices: Array.isArray(parsed.notable_voices) ? parsed.notable_voices as string[] : [],
    key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes as string[] : [],
    recommended_action: parsed.recommended_action as string,
    confidence_score: confidenceScore,
    key_entities: keyEntities,
    is_new_information: parsed.is_new_information === true,
    new_information_detail: typeof parsed.new_information_detail === 'string' ? parsed.new_information_detail : null,
    match_confidence: validConfidences.has(rawConfidence as MatchConfidence) ? rawConfidence as MatchConfidence : 'likely',
    planning_stage_mentioned: typeof parsed.planning_stage_mentioned === 'string' ? parsed.planning_stage_mentioned : null,
    themes: Array.isArray(parsed.themes) ? parsed.themes as string[] : [],
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

  const cleanedReport = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  const parsed = JSON.parse(cleanedReport) as {
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
