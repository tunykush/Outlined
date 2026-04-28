/**
 * Shared citation-data normalisation pass.
 *
 * This layer sits before APA 7th / RMIT Harvard formatting. It repairs safe,
 * objective metadata issues only: whitespace, URL tracking parameters, DOI shape,
 * English month names, author de-duplication, generic website names, and AI-tool
 * creator defaults. It deliberately does not invent missing scholarly metadata.
 */

import type { Author, CitationData, CitationStyle, SourceType } from '../types.js';
import { emptyCitationData } from '../citation-engine.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_LOOKUP: Record<string, string> = Object.fromEntries(
  MONTHS.flatMap((m, i) => [
    [m.toLowerCase(), m],
    [m.slice(0, 3).toLowerCase(), m],
    [String(i + 1), m],
    [String(i + 1).padStart(2, '0'), m],
  ])
);

const SPECIAL_SITES: Record<string, string> = {
  'prsa.org': 'PRSA',
  'npr.org': 'National Public Radio',
  'reuters.com': 'Reuters',
  'fortune.com': 'Fortune',
  'forbes.com': 'Forbes',
  'counterpointresearch.com': 'Counterpoint',
  'erm.com': 'ERM',
  'openai.com': 'OpenAI',
  'chatgpt.com': 'ChatGPT',
  'bbc.com': 'BBC News',
  'bbc.co.uk': 'BBC News',
  'vnexpress.net': 'VnExpress',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
};

function clean(s: unknown): string {
  return String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function has(s: unknown): boolean {
  return clean(s).length > 0;
}

function normaliseMonth(month: string): string {
  const m = clean(month).replace(/\.$/, '');
  if (!m) return '';
  return MONTH_LOOKUP[m.toLowerCase()] || m;
}

function normaliseDay(day: string): string {
  const d = clean(day).replace(/(st|nd|rd|th)$/i, '');
  return /^\d+$/.test(d) ? String(Number(d)) : d;
}

export function parseDateParts(raw: string): { year: string; month: string; day: string } {
  const s = clean(raw).replace(/,/g, '');
  if (!s) return { year: '', month: '', day: '' };

  let m = s.match(/^(\d{4}[a-z]?)[-/](\d{1,2})[-/](\d{1,2})$/i);
  if (m) return { year: m[1], month: normaliseMonth(m[2]), day: normaliseDay(m[3]) };

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}[a-z]?)$/i);
  if (m) return { year: m[3], month: normaliseMonth(m[2]), day: normaliseDay(m[1]) };

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}[a-z]?)$/i);
  if (m) return { year: m[3], month: normaliseMonth(m[2]), day: normaliseDay(m[1]) };

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}[a-z]?)$/i);
  if (m) return { year: m[3], month: normaliseMonth(m[1]), day: normaliseDay(m[2]) };

  // Month-only or issue-range dates, e.g. "July-August 2020". Keep year only
  // because RMIT Harvard examples usually cite this as (2020).
  m = s.match(/\b(\d{4}[a-z]?)\b/i);
  if (m) return { year: m[1], month: '', day: '' };

  return { year: '', month: '', day: '' };
}

export function dayMonthYear(raw: string): string {
  const p = parseDateParts(raw);
  if (!p.year && !p.month && !p.day) return clean(raw);
  if (p.day && p.month && p.year) return `${p.day} ${p.month} ${p.year}`;
  if (p.month && p.year) return `${p.month} ${p.year}`;
  return p.year;
}

export function monthDayYear(raw: string): string {
  const p = parseDateParts(raw);
  if (!p.year && !p.month && !p.day) return clean(raw);
  if (p.month && p.day && p.year) return `${p.month} ${p.day}, ${p.year}`;
  if (p.month && p.year) return `${p.month} ${p.year}`;
  return p.year;
}

function normaliseDoi(raw: string): string {
  return clean(raw)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/\s+/g, '');
}

function normaliseUrl(raw: string): string {
  const s = clean(raw).replace(/\.$/, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    for (const key of Array.from(u.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|srsltid$|mc_cid$|mc_eid$)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return s;
  }
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

function titleFromDomain(host: string): string {
  if (!host) return '';
  if (SPECIAL_SITES[host]) return SPECIAL_SITES[host];
  const first = host.split('.')[0] || '';
  if (!first || first === 'www') return '';
  return first
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isGenericSiteName(s: string): boolean {
  const v = clean(s).toLowerCase();
  // Treat bare domain strings (e.g. "brandlife.io") as generic so they get replaced
  // with a readable title from titleFromDomain rather than rendering as raw domain text.
  return !v || v === 'www' || v === 'website' || /^www\./.test(v) || /\.[a-z]{2,}(\.[a-z]{2,})?$/.test(v);
}

/**
 * Strip compound site names like "Dealership Buy-Sell Advisors - Haig Partners"
 * down to the real brand. Strategy: split on " - " and find the segment whose
 * slug matches the page hostname (e.g. "haigpartners" ↔ "Haig Partners"). If no
 * hostname match, take the last segment which is usually the brand.
 */
function cleanCompoundSiteName(siteName: string, url: string): string {
  if (!siteName.includes(' - ')) return siteName;
  const segments = siteName.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return siteName;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0].toLowerCase();
    const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const matched = segments.find((s) => slug(s) === host || host.startsWith(slug(s)) || slug(s).startsWith(host));
    if (matched) return matched;
  } catch { /* ignore malformed URL */ }
  // Fallback: last segment (descriptor - Brand pattern)
  return segments[segments.length - 1];
}

function splitName(raw: string): Author {
  const s = clean(raw);
  if (!s) return { family: '', given: '' };
  const orgRe = /\b(inc\.?|ltd\.?|llc|university|department|bureau|institute|association|society|foundation|federation|ministry|agency|corp\.?|company|group|news|press|library|government|organisation|organization|council|committee|hospital|college|school|gallery|museum|rmit|who|unicef|openai|anthropic|google|microsoft)\b/i;
  if (orgRe.test(s) || s.split(/\s+/).length >= 5) return { family: s, given: '', isOrganisation: true };
  if (s.includes(',')) {
    const [family, given] = s.split(',', 2).map(clean);
    return { family, given };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { family: parts[0], given: '' };
  const family = parts.pop() || '';
  return { family, given: parts.join(' ') };
}

function normaliseAuthor(a: Author): Author {
  const family = clean(a?.family);
  const given = clean(a?.given);
  if (!family && !given) return { family: '', given: '' };
  const joined = family && !given ? family : '';
  const parsed = joined && /\s/.test(joined) && !a.isOrganisation ? splitName(joined) : null;
  const out = parsed || { family, given, isOrganisation: Boolean(a?.isOrganisation) };
  if (/^(openai|anthropic|google|microsoft|rmit)$/i.test(out.family)) out.isOrganisation = true;
  return out;
}

function dedupeAuthors(authors: Author[] = []): Author[] {
  const seen = new Set<string>();
  const out: Author[] = [];
  for (const raw of authors) {
    const a = normaliseAuthor(raw);
    if (!has(a.family) && !has(a.given)) continue;
    const key = `${a.family}|${a.given}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.length ? out : [{ family: '', given: '' }];
}

function inferAiCreator(tool: string): string {
  const t = clean(tool).toLowerCase();
  if (/claude|anthropic/.test(t)) return 'Anthropic';
  if (/gemini|google/.test(t)) return 'Google';
  if (/copilot|microsoft|bing/.test(t)) return 'Microsoft';
  if (/chatgpt|openai|gpt/.test(t)) return 'OpenAI';
  return 'OpenAI';
}

function normaliseReportNumber(s: string): string {
  const v = clean(s);
  if (!v) return '';
  return /^\(.+\)$/.test(v) ? v.slice(1, -1) : v;
}

export function normalizeCitationData(style: CitationStyle, source: SourceType, input: CitationData): CitationData {
  const base = emptyCitationData();
  const d: CitationData = { ...base, ...input };

  for (const key of Object.keys(d) as Array<keyof CitationData>) {
    const value = d[key];
    if (typeof value === 'string') (d as unknown as Record<string, unknown>)[key] = clean(value);
  }

  d.authors = dedupeAuthors(input.authors || []);
  d.editors = dedupeAuthors(input.editors || []).filter((a) => has(a.family) || has(a.given));
  if (!d.editors.length) d.editors = [{ family: '', given: '' }];

  d.url = normaliseUrl(d.url);
  d.doi = normaliseDoi(d.doi);
  d.month = normaliseMonth(d.month);
  d.day = normaliseDay(d.day);
  d.accessDate = dayMonthYear(d.accessDate);
  d.reportNumber = normaliseReportNumber(d.reportNumber);

  // If year field contains a full date, split it safely.
  if (d.year && !/^\d{4}[a-z]?$/i.test(d.year) && d.year !== 'n.d.') {
    const p = parseDateParts(d.year);
    if (p.year) {
      d.year = p.year;
      d.month ||= p.month;
      d.day ||= p.day;
    }
  }

  const host = hostname(d.url);
  const keepIeeeContainerNames = style === 'ieee';
  if ((!keepIeeeContainerNames || !has(d.siteName) || Boolean(SPECIAL_SITES[host])) && isGenericSiteName(d.siteName) && host) d.siteName = titleFromDomain(host);
  if ((!keepIeeeContainerNames || !has(d.publisher) || Boolean(SPECIAL_SITES[host])) && isGenericSiteName(d.publisher) && host) d.publisher = titleFromDomain(host);
  if (!d.siteName && host) d.siteName = titleFromDomain(host);
  // Strip compound site names like "Advisors - Haig Partners" → "Haig Partners"
  // This catches og:site_name values that contain category prefixes before the brand.
  if (d.siteName) d.siteName = cleanCompoundSiteName(d.siteName, d.url);
  if (d.publisher) d.publisher = cleanCompoundSiteName(d.publisher, d.url);

  // DOI beats URL for journal articles in both uploaded style guides.
  if (source === 'journal' && d.doi) d.url = d.url && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(d.url) ? '' : d.url;

  // APA and Harvard AI references use the tool/company creator as author when available.
  if (source === 'ai-chat' && !d.authors.some((a) => has(a.family) || has(a.given))) {
    d.authors = [{ family: inferAiCreator(d.toolName || d.publisher || d.platform || d.title), given: '', isOrganisation: true }];
  }

  // APA uses platform/tool as the source name; Harvard usually cites the tool as title if no title supplied.
  if (source === 'ai-chat') {
    if (!d.toolName) d.toolName = /openai/i.test(d.authors[0]?.family || '') ? 'ChatGPT' : clean(d.platform || 'AI tool');
    if (!d.title && style === 'apa7') d.title = 'Untitled AI output';
  }

  if (source === 'youtube-video' && !d.platform) d.platform = 'YouTube';
  if (source === 'social-twitter' && !d.platform) d.platform = 'X';
  if (source === 'social-instagram' && !d.platform) d.platform = 'Instagram';
  if (source === 'social-facebook' && !d.platform) d.platform = 'Facebook';
  if (source === 'social-tiktok' && !d.platform) d.platform = 'TikTok';

  return d;
}
