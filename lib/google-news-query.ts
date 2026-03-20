/**
 * Google News RSS query builder.
 * Constructs search queries using Google's full search syntax for
 * project-specific and area intelligence monitoring.
 */

const SITE_NAME_PREFIXES = new Set([
  'land', 'north', 'south', 'east', 'west', 'site', 'former',
  'proposed', 'rear', 'adjacent', 'the', 'at', 'off', 'of', 'near',
]);

const AREA_INTEL_KEYWORDS = [
  'planning', 'development', 'homes', 'housing', 'application',
  'construction', 'council', 'residents', 'objection',
];

interface ProjectQueryFields {
  planning_reference: string;
  site_name: string;
  client_name: string;
  exclusion_terms: string;
}

interface AreaIntelFields {
  site_name: string;
  lpa: string;
}

/**
 * Extract the most distinctive place name from a site name by
 * dropping common prefixes like "Land", "North", "Site", etc.
 * Takes the last 2-3 remaining words.
 */
export function extractPlaceName(siteName: string): string | null {
  if (!siteName) return null;

  const words = siteName.trim().split(/\s+/);
  // Drop leading prefix words
  let start = 0;
  while (start < words.length && SITE_NAME_PREFIXES.has(words[start].toLowerCase())) {
    start++;
  }

  const remaining = words.slice(start);
  if (remaining.length === 0) return null;

  // Take last 2-3 words for the place name
  const count = Math.min(remaining.length, 3);
  const placeName = remaining.slice(-count).join(' ');

  // Only return if it's different from the full site name
  if (placeName.toLowerCase() === siteName.trim().toLowerCase()) return null;

  return placeName;
}

/**
 * Build a project-specific Google News search query.
 *
 * Combines planning reference, site name, extracted place name, and
 * client name (ANDed with place name) using OR operators. Appends
 * exclusion terms and a 7-day time filter.
 */
export function buildProjectQuery(project: ProjectQueryFields): string {
  const orTerms: string[] = [];

  if (project.planning_reference.trim()) {
    orTerms.push(`"${project.planning_reference.trim()}"`);
  }

  if (project.site_name.trim()) {
    orTerms.push(`"${project.site_name.trim()}"`);
  }

  const placeName = extractPlaceName(project.site_name);
  if (placeName) {
    orTerms.push(`"${placeName}"`);
  }

  // Client name combined with place name (AND, not standalone OR)
  if (project.client_name.trim() && placeName) {
    orTerms.push(`"${project.client_name.trim()}" "${placeName}"`);
  }

  if (orTerms.length === 0) return '';

  let query = orTerms.join(' OR ');

  // Exclusion terms
  if (project.exclusion_terms.trim()) {
    const exclusions = project.exclusion_terms
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => `-${t}`)
      .join(' ');
    if (exclusions) {
      query += ` ${exclusions}`;
    }
  }

  query += ' when:7d';

  return query;
}

/**
 * Build an area intelligence Google News search query.
 *
 * Searches for the location combined with planning-related keywords
 * to catch broader area coverage.
 */
export function buildAreaIntelligenceQuery(project: AreaIntelFields): string {
  const placeName = extractPlaceName(project.site_name) ?? project.lpa;
  if (!placeName) return '';

  const keywordsGroup = AREA_INTEL_KEYWORDS.join(' OR ');
  return `"${placeName}" (${keywordsGroup}) when:7d`;
}

/**
 * Build a full Google News RSS URL from a search query.
 */
export function buildGoogleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
}
