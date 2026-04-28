/**
 * Extract structured metadata from HTML and map to CitationData.
 * Sources used (in priority order per source):
 *   1. JSON-LD (Article / NewsArticle / ScholarlyArticle / WebPage / Book)
 *   2. Highwire Press citation_* tags (academic — strongest signal for journals)
 *   3. Open Graph (og:*)
 *   4. Twitter Cards
 *   5. Dublin Core (dc.*)
 *   6. Generic <meta name="..."> and fallback to <h1>, <title>, visible dates
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Author, CitationData, CitationStyle, SourceType } from '../shared/types.js';
import { emptyCitationData } from '../shared/citation-engine.js';
import { knownSiteNameForHost } from '../shared/site-names.js';

interface ExtractionResult {
  data: Partial<CitationData>;
  guessedType: SourceType;
}

/* ---------- helpers ---------- */

function metaContent($: CheerioAPI, selectors: string[]): string {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const c = el.attr('content') || el.attr('value') || el.text();
      if (c && c.trim()) return c.trim();
    }
  }
  return '';
}

function metaContentAll($: CheerioAPI, selector: string): string[] {
  const out: string[] = [];
  $(selector).each((_, el) => {
    const c = $(el).attr('content');
    if (c && c.trim()) out.push(c.trim());
  });
  return out;
}

function pickFirst(...values: Array<string | undefined | null>): string {
  for (const v of values) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface JsonLdAuthor {
  '@type'?: string;
  name?: string;
}
interface JsonLdNode {
  '@type'?: string | string[];
  '@graph'?: JsonLdNode[];
  name?: string;
  headline?: string;
  description?: string;
  author?: JsonLdAuthor | JsonLdAuthor[] | string | string[];
  datePublished?: string;
  dateCreated?: string;
  dateModified?: string;
  publisher?: { name?: string } | string;
  isPartOf?: { name?: string } | string;
  mainEntityOfPage?: string | { '@id'?: string };
  url?: string;
  // Journal-specific
  isPartOfPeriodical?: { name?: string };
  volumeNumber?: string;
  issueNumber?: string;
  pageStart?: string;
  pageEnd?: string;
}

function parseJsonLd($: CheerioAPI): {
  article: JsonLdNode | null;
  product: JsonLdNode | null;
  organization: JsonLdNode | null;
  website: JsonLdNode | null;
  newsArticle: JsonLdNode | null;
  book: JsonLdNode | null;
} {
  const result = {
    article: null as JsonLdNode | null,
    product: null as JsonLdNode | null,
    organization: null as JsonLdNode | null,
    website: null as JsonLdNode | null,
    newsArticle: null as JsonLdNode | null,
    book: null as JsonLdNode | null,
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    if (!text) return;
    try {
      const parsed: unknown = JSON.parse(text);
      const visit = (node: JsonLdNode): void => {
        if (!node || typeof node !== 'object') return;
        const types = ([] as string[]).concat(node['@type'] || []);
        for (const t of types) {
          const tl = String(t).toLowerCase();
          if (/newsarticle$/.test(tl)) result.newsArticle ||= node;
          if (/^(article|blogposting|scholarlyarticle|techarticle|report)$/.test(tl) || /article$/i.test(tl)) {
            result.article ||= node;
          }
          if (tl === 'webpage' && !result.article) result.article ||= node;
          if (tl === 'product') result.product ||= node;
          if (tl === 'organization') result.organization ||= node;
          if (tl === 'website') result.website ||= node;
          if (tl === 'book') result.book ||= node;
        }
        if (node['@graph']) for (const g of node['@graph']) visit(g);
      };
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of arr) visit(obj as JsonLdNode);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return result;
}

/** Split a "First Last" or "Last, First" name string into Author */
function splitName(raw: string): Author {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { family: '', given: '' };
  if (s.includes(',')) {
    const [fam, giv] = s.split(',', 2).map((x) => x.trim());
    return { family: fam, given: giv || '' };
  }
  // Heuristic for organisations.
  const orgRegex =
    /\b(inc\.?|ltd\.?|llc|university|department|bureau|institute|association|society|foundation|federation|ministry|agency|corp\.?|company|group|news|press|times|herald|gazette|tribune|post|wiki|library|museum|gallery|bbc|vnexpress|fandom)\b/i;
  if (orgRegex.test(s) || s.split(/\s+/).length >= 5) return { family: s, given: '', isOrganisation: true };

  const parts = s.split(' ');
  if (parts.length === 1) return { family: parts[0], given: '' };
  const family = parts.pop()!;
  return { family, given: parts.join(' ') };
}

/** Resolve a possibly-relative URL to absolute */
function abs(maybeRelative: string, base: string): string {
  if (!maybeRelative) return '';
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return '';
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isWikiLikeHost(host: string): boolean {
  return /(^|\.)fandom\.com$|(^|\.)wikipedia\.org$|(^|\.)wiktionary\.org$|(^|\.)wikiquote\.org$/i.test(host);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanTitle(rawTitle: string, siteName: string, baseUrl: string): string {
  let title = rawTitle.replace(/\s+/g, ' ').trim();
  if (!title) return '';
  const host = hostnameOf(baseUrl);

  // Fandom/Wiki pages often expose titles like "Pretender | TYPE-MOON Wiki | Fandom".
  // APA needs the entry/page title only, not the container/site suffix.
  if (isWikiLikeHost(host) && title.includes('|')) {
    return title.split('|')[0].trim();
  }

  const site = siteName.trim();
  if (site) {
    title = title.replace(new RegExp(`\\s*[|–—-]\\s*${escapeRegExp(site)}\\s*$`, 'i'), '').trim();
  }
  title = title.replace(/\s*[|–—-]\s*Fandom\s*$/i, '').trim();
  // Second pass: strip any remaining " | suffix" left after site-name regex didn't match
  if (title.includes('|')) title = title.split('|')[0].trim();
  return title;
}

function cleanCanonicalUrl(rawUrl: string, baseUrl: string): string {
  const u = abs(rawUrl, baseUrl);
  if (!u) return '';
  try {
    const parsed = new URL(u);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|srsltid$|mc_cid$|mc_eid$)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return u;
  }
}

function visibleDateText($: CheerioAPI): string {
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:Cập\s*nhật\s*lần\s*cuối|Cập\s*nhật|Ngày\s*đăng|Đăng\s*ngày|Xuất\s*bản|Published|Updated|Last\s*updated)\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:19|20)\d{2})/i,
    /(?:Cập\s*nhật\s*lần\s*cuối|Cập\s*nhật|Ngày\s*đăng|Đăng\s*ngày|Xuất\s*bản|Published|Updated|Last\s*updated)\s*:?\s*((?:19|20)\d{2}[\/-]\d{1,2}[\/-]\d{1,2})/i,
    /(?:Published|Updated|Last\s*updated|Date)\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+(?:19|20)\d{2})/i,
    /(?:Published|Updated|Last\s*updated|Date)\s*:?\s*(\d{1,2}\s+[A-Z][a-z]+\s+(?:19|20)\d{2})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }

  // Article pages often place a date directly under the byline, e.g. "July-August 2020".
  const shortBlockSelector = 'time,h2,h3,h4,h5,h6,p,span,div';
  const monthRange = /\b([A-Z][a-z]+(?:\s*[-–]\s*[A-Z][a-z]+)?\s+(?:19|20)\d{2})\b/;
  const monthDayYear = /\b([A-Z][a-z]+\s+\d{1,2},?\s+(?:19|20)\d{2})\b/;
  const dayMonthYear = /\b(\d{1,2}\s+[A-Z][a-z]+\s+(?:19|20)\d{2})\b/;
  for (const el of $(shortBlockSelector).toArray()) {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!t || t.length > 140) continue;
    const m = t.match(monthDayYear) || t.match(dayMonthYear) || t.match(monthRange);
    if (m?.[1]) return m[1];
  }
  return '';
}

/* ─────────────────────────────────────────────────────────────────
   LAYER 1: Readability.js — article-body parsing
   Extracts byline and siteName from the article content itself,
   not just meta tags. Mozilla's algorithm handles hundreds of CMS
   patterns that simple CSS-class scanning misses.
   ───────────────────────────────────────────────────────────────── */

interface ReadabilityMeta {
  byline: string;   // e.g. "By Sarah Johnson, Senior Reporter"
  siteName: string; // e.g. "Forbes"
  title: string;    // cleaned article title (no site suffix)
}

async function readabilityExtract(html: string, url: string): Promise<ReadabilityMeta> {
  try {
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return {
      byline: article?.byline || '',
      siteName: article?.siteName || '',
      title: article?.title || '',
    };
  } catch {
    return { byline: '', siteName: '', title: '' };
  }
}

/* ─────────────────────────────────────────────────────────────────
   LAYER 2: compromise NER — last-resort author extraction
   Only runs when every other method (meta tags, JSON-LD, DOM scan,
   Readability byline) has returned nothing. compromise identifies
   PERSON and ORGANIZATION entities from free-form text, which lets
   us handle bylines like "Sarah Johnson covers tech for Bloomberg"
   where the name isn't delimited by "By", commas, or semicolons.
   ───────────────────────────────────────────────────────────────── */

async function nerAuthors(text: string): Promise<Author[]> {
  if (!text.trim()) return [];
  try {
    const nlpModule = await import('compromise');
    const nlp = nlpModule.default;
    const doc = nlp(text);

    // Try recognised person names first — highest confidence
    const people = (doc.people().out('array') as string[])
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 3 && !shouldIgnoreAuthor(s));

    if (people.length > 0) {
      return people.map((name: string) => splitName(name));
    }

    // Fall back to org entities (e.g. "Haig Partners", "Handle")
    const orgs = (doc.organizations().out('array') as string[])
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 2 && !shouldIgnoreAuthor(s));

    return orgs.map((name: string) => ({ family: name, given: '', isOrganisation: true as const }));
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────────
   LAYER 3: itemprop / pubdate <time> scanning
   Prioritises time elements that explicitly declare publication date
   via schema.org microdata, which is more reliable than the first
   time[datetime] element (which may be a comment timestamp).
   ───────────────────────────────────────────────────────────────── */

function extractTimeElements($: CheerioAPI): string {
  return (
    $('time[itemprop="datePublished"]').first().attr('datetime') ||
    $('[itemprop="datePublished"]').first().attr('content') ||
    $('[itemprop="datePublished"]').first().attr('datetime') ||
    $('time[pubdate]').first().attr('datetime') ||
    ''
  );
}

function shouldIgnoreAuthor(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^https?:/i.test(s)) return true;
  if (/contributors?\s+to/i.test(s)) return true;
  if (/^(in|from|at)\s+/i.test(s)) return true;
  if (/^(wiki|fandom|admin|administrator|staff|editorial team)$/i.test(s)) return true;
  if (/^by\s*$/i.test(s)) return true;
  return false;
}

function cleanBylineName(raw: string): string {
  return raw
    .replace(/\bby\b\s*/i, '')
    .replace(/\b(written|posted|published)\s+by\b\s*/i, '')
    .replace(/\b(APR|PhD|Ph\.D\.?|MBA|MA|MSc|Dr\.?|Prof\.?|Professor)\b\.?/gi, '')
    .replace(/\s*,\s*(?:in|from|at)\s+[^,;|]+(?:,\s*[^,;|]+)?/gi, '')
    .replace(/\s*,\s*(and\b)/gi, ' $1')
    .replace(/\s*,\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAuthorList(raw: string): string[] {
  const normalised = cleanBylineName(raw)
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+with\s+/gi, ' and ');
  return normalised
    .split(/\s+(?:and)\s+|\s*;\s*|\s*\|\s*|\n+/i)
    .map(cleanBylineName)
    .filter(Boolean);
}

function splitMetadataAuthors(raw: string): string[] {
  const s = cleanBylineName(raw);
  if (!s) return [];
  if (raw.includes('|')) {
    return raw
      .split('|')
      .map(cleanBylineName)
      .filter((part) => part && !shouldIgnoreAuthor(part) && !/^(california|australia|united states|uk|u\.k\.)$/i.test(part));
  }
  return splitAuthorList(s);
}

function extractVisibleBylineAuthors($: CheerioAPI): Author[] {
  const candidates: string[] = [];

  $('[class*="author" i], [class*="byline" i], [rel="author"], [itemprop="author"], a[href*="/author" i], a[href*="/authors" i]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t && t.length <= 180) candidates.push(t);
  });

  // PRSA-style pages expose the byline as a heading: "By Heather Bermudez, APR and Aileen Izquierdo".
  $('h2,h3,h4,h5,h6,p,span,div').each((_, el) => {
    const t = $(el).clone().children('script,style,nav,footer,header').remove().end().text().replace(/\s+/g, ' ').trim();
    if (/^by\s+/i.test(t) && t.length <= 220) candidates.push(t);
  });

  const seen = new Set<string>();
  const out: Author[] = [];
  for (const candidate of candidates) {
    const cleanedCandidate = candidate.replace(/\s+and\s+\d{4}.*$/i, '').trim();
    for (const name of splitAuthorList(cleanedCandidate)) {
      if (shouldIgnoreAuthor(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(splitName(name));
    }
    if (out.length) break;
  }
  return out;
}

function inferSiteNameFromTitle(rawTitle: string): string {
  const bits = rawTitle.split(/\s*[|–—]\s*/).map((x) => x.trim()).filter(Boolean);
  if (bits.length >= 2) {
    const last = bits[bits.length - 1];
    // Compound names like "Dealership Buy-Sell Advisors - Haig Partners" → take last segment after " - "
    const subBits = last.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
    return subBits[subBits.length - 1] || last;
  }
  return '';
}

/** Pull authors from various sources, in descending reliability order.
 *
 *  Priority chain:
 *  1. citation_author meta (academic gold standard)
 *  2. JSON-LD author field
 *  3. article:author / meta[name="author"] / dc.creator
 *  4. Readability byline  (Readability.js found the author line in article body)
 *  5. DOM byline CSS scan ([class*="author"], "By …" paragraphs)
 *  6. compromise NER     (last resort — entity recognition on byline text)
 */
async function extractAuthors(
  $: CheerioAPI,
  jsonld: ReturnType<typeof parseJsonLd>,
  readabilityByline = '',
): Promise<Author[]> {
  const seen = new Set<string>();
  const out: Author[] = [];
  const add = (raw: string, isOrganisation = false): void => {
    const cleaned = cleanBylineName(raw.trim());
    if (!cleaned || cleaned.length < 2) return;
    if (shouldIgnoreAuthor(cleaned)) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const author = splitName(cleaned);
    if (isOrganisation) author.isOrganisation = true;
    out.push(author);
  };
  const addMany = (raw: string): void => {
    const names = splitMetadataAuthors(raw);
    if (names.length) names.forEach((name) => add(name));
    else add(raw);
  };

  // 1. citation_author (highest priority for academic content)
  metaContentAll($, 'meta[name="citation_author"]').forEach((value) => add(value));

  // 1b. News/CMS-specific author meta. BBC, VnExpress, and other news sites
  // often put cleaner machine-readable bylines here than in visible DOM text.
  const metaAuthor = metaContent($, [
    'meta[property="cXenseParse:author"]',
    'meta[name="cXenseParse:author"]',
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="parsely-author"]',
    'meta[name="sailthru.author"]',
    'meta[name="dc.creator"]',
    'meta[name="DC.creator"]',
  ]);
  if (metaAuthor) addMany(metaAuthor);

  // 2. JSON-LD article author
  const node = jsonld.newsArticle || jsonld.article || jsonld.book;
  if (node?.author) {
    const list = Array.isArray(node.author) ? node.author : [node.author];
    for (const a of list) {
      if (typeof a === 'string') add(a);
      else if (a && typeof a === 'object' && a.name) {
        const types = ([] as string[]).concat(a['@type'] || []);
        add(a.name, types.some((t) => /organization/i.test(t)));
      }
    }
  }

  // 3. article:author (Open Graph)
  metaContentAll($, 'meta[property="article:author"]').forEach((value) => add(value));

  // 4. classic meta author
  if (out.length === 0) {
    const a = metaContent($, [
      'meta[name="dc.creator"]',
      'meta[name="DC.creator"]',
    ]);
    if (a) {
      if (/[;|\n]/.test(a)) a.split(/\s*(?:;|\||\n)\s*/).forEach((value) => add(value));
      else add(a);
    }
  }

  // 5. Readability byline — Mozilla's algorithm extracts the author line from
  //    article body content, catching cases where meta tags are absent but the
  //    page has a visible "By Sarah Johnson" line near the headline.
  if (out.length === 0 && readabilityByline) {
    const names = splitAuthorList(cleanBylineName(readabilityByline))
      .filter((n) => !shouldIgnoreAuthor(n));
    for (const name of names) {
      const key = name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(splitName(name)); }
    }
  }

  // 6. DOM byline CSS scan (existing heuristic)
  if (out.length === 0) {
    out.push(...extractVisibleBylineAuthors($));
  }

  // 7. compromise NER — last resort when all heuristics fail.
  //    Recognises PERSON and ORGANIZATION entities from free-form byline text.
  //    e.g. "Sarah Johnson covers tech for Bloomberg" → Author: Sarah Johnson
  if (out.length === 0 && readabilityByline) {
    out.push(...await nerAuthors(readabilityByline));
  }

  return out;
}

/** Parse a date-like string into year/month/day (English month names) */
function splitDate(raw: string): { year: string; month: string; day: string } {
  if (!raw) return { year: '', month: '', day: '' };
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim())) {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Sydney',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).formatToParts(dt);
        return {
          year: parts.find((p) => p.type === 'year')?.value || '',
          month: parts.find((p) => p.type === 'month')?.value || '',
          day: parts.find((p) => p.type === 'day')?.value || '',
        };
      } catch {
        /* fall through */
      }
    }
  }

  const numeric = raw.trim().match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})/);
  if (numeric) {
    let day = Number(numeric[1]);
    let month = Number(numeric[2]);
    let year = Number(numeric[3]);
    // yyyy-mm-dd
    if (String(numeric[1]).length === 4) {
      year = Number(numeric[1]);
      month = Number(numeric[2]);
      day = Number(numeric[3]);
    }
    // dd/mm/yyyy is common on Vietnamese/Australian sites.
    if (year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year: String(year), month: months[month - 1], day: String(day) };
    }
  }

  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return {
      year: String(d.getFullYear()),
      month: months[d.getMonth()],
      day: String(d.getDate()),
    };
  }
  const yMatch = raw.match(/\b(19|20)\d{2}\b/);
  return { year: yMatch ? yMatch[0] : '', month: '', day: '' };
}

/** Guess the source type from the metadata signals */
function guessType(
  $: CheerioAPI,
  jsonld: ReturnType<typeof parseJsonLd>,
  baseUrl: string,
  style?: CitationStyle
): SourceType {
  const host = hostnameOf(baseUrl);
  const isHarvard = style === 'harvard';

  // A direct PDF URL should not be swallowed by og:type=article from the
  // lightweight PDF fallback shell.
  if (/\.pdf(?:\?|$)/i.test(baseUrl)) return 'webpage-document';

  // Strong signals first
  if (metaContent($, ['meta[name="citation_journal_title"]', 'meta[name="prism.publicationName"]'])) {
    return 'journal';
  }
  if (metaContent($, ['meta[name="citation_doi"]'])) {
    if (isHarvard) {
      const bookTitle = metaContent($, ['meta[name="citation_book_title"]']);
      const isbn = metaContent($, ['meta[name="citation_isbn"]']);
      if (bookTitle) return 'book-chapter';
      if (isbn) return 'book';
    }
    return 'journal';
  }
  if (jsonld.newsArticle) return isHarvard ? 'webpage' : 'newspaper-online';
  if (jsonld.article) {
    const types = ([] as string[]).concat(jsonld.article['@type'] || []);
    if (types.some((t) => /report/i.test(t))) return 'report';
    if (types.some((t) => /scholarly|techarticle/i.test(t))) return 'journal';
    if (types.some((t) => /blogposting/i.test(t))) return 'blog-post';
  }
  if (jsonld.book) return 'book';

  // Hostname-based heuristics
  if (isWikiLikeHost(host)) return 'wiki-entry';
  if (/youtube\.com|youtu\.be/.test(host)) return 'youtube-video';
  if (/twitter\.com|x\.com/.test(host)) return 'social-twitter';
  if (/facebook\.com/.test(host)) return 'social-facebook';
  if (/instagram\.com/.test(host)) return 'social-instagram';
  if (/tiktok\.com/.test(host)) return 'social-tiktok';
  if (/medium\.com|substack\.com|wordpress\.com|blogspot\./.test(host)) return 'blog-post';
  if (/(news|times|guardian|herald|post|tribune|nytimes|bbc|cnn|reuters|smh|theage)/i.test(host)) {
    return isHarvard ? 'webpage' : 'newspaper-online';
  }

  // og:type=article is common for normal website articles; do not force it to newspaper.
  const og = metaContent($, ['meta[property="og:type"]']);
  if (/book/i.test(og)) return 'book';
  if (/video/i.test(og)) return 'streaming-video';
  if (/article/i.test(og)) return 'webpage';

  return 'webpage';
}

/* ---------- main extractor ---------- */

export async function extractMetadata(html: string, baseUrl: string, style?: CitationStyle): Promise<ExtractionResult> {
  const $ = cheerio.load(html);
  const jsonld = parseJsonLd($);
  // Readability runs in parallel with Cheerio — it parses the article body to
  // extract a cleaned title, byline, and site name that meta tags often omit.
  const rdbl = await readabilityExtract(html, baseUrl);
  const data = emptyCitationData() as Partial<CitationData>;

  // Title — Readability gives a cleaner title than og:title on many sites
  // (strips " | Site Name" suffixes automatically), but we still prefer
  // og:title first since it's the canonical machine-readable signal.
  const rawTitle = pickFirst(
    metaContent($, ['meta[property="og:title"]']),
    metaContent($, ['meta[name="twitter:title"]']),
    metaContent($, ['meta[name="citation_title"]']),
    jsonld.newsArticle?.headline,
    jsonld.article?.headline,
    metaContent($, ['meta[name="dc.title"]', 'meta[name="DC.title"]']),
    rdbl.title,
    $('h1').first().text(),
    $('title').first().text()
  ).replace(/\s+/g, ' ');

  // Site name — Readability's siteName fills the gap when og:site_name is absent
  const host = hostnameOf(baseUrl);
  data.siteName = pickFirst(
    metaContent($, ['meta[property="og:site_name"]']),
    jsonld.website?.name,
    metaContent($, ['meta[name="application-name"]']),
    rdbl.siteName,
    knownSiteNameForHost(host),
    inferSiteNameFromTitle(rawTitle),
    host
  );
  if (/^prsa\.org$/i.test(host)) data.siteName = 'PRSA';

  // Fandom pages sometimes expose site_name as "Fandom" even though the actual
  // reference-work title is the middle segment, e.g. "TYPE-MOON Wiki".
  if (isWikiLikeHost(host) && rawTitle.includes('|')) {
    const bits = rawTitle.split('|').map((x) => x.trim()).filter(Boolean);
    const wikiName = bits.find((x) => /wiki/i.test(x) && !/^fandom$/i.test(x));
    if (wikiName) data.siteName = wikiName;
  }

  data.title = cleanTitle(rawTitle, data.siteName || '', baseUrl);

  // For news, publisher = newspaper masthead (often == site name)
  data.publisher = pickFirst(
    metaContent($, ['meta[name="citation_publisher"]']),
    typeof jsonld.newsArticle?.publisher === 'object' ? jsonld.newsArticle?.publisher?.name : '',
    typeof jsonld.article?.publisher === 'object' ? jsonld.article?.publisher?.name : '',
    data.siteName
  );
  if (/^vnexpress\.net$/i.test(host)) {
    data.siteName = 'VnExpress';
    data.publisher = 'VnExpress';
  }

  // Date: reliable publication date signals only — never fall back to modification date.
  // Priority: explicit meta > JSON-LD datePublished > schema.org microdata <time> >
  //           generic meta[name="date"] > first time[datetime] > visible body text.
  const dateRaw = pickFirst(
    metaContent($, ['meta[property="article:published_time"]']),
    metaContent($, ['meta[name="article:published_time"]']),
    metaContent($, ['meta[name="citation_publication_date"]']),
    metaContent($, ['meta[name="citation_date"]']),
    jsonld.newsArticle?.datePublished,
    jsonld.article?.datePublished,
    // schema.org microdata <time itemprop="datePublished"> is more reliable than
    // the first time[datetime] (which might be a comment timestamp)
    extractTimeElements($),
    metaContent($, [
      'meta[name="cXenseParse:publishtime"]',
      'meta[property="cXenseParse:publishtime"]',
      'meta[itemprop="pubdate"]',
      'meta[name="pubdate"]',
      'meta[itemprop="datePublished"]',
      'meta[name="dateCreated"]',
      'meta[name="datePublished"]',
      'meta[name="date"]',
      'meta[name="dc.date"]',
      'meta[name="DC.date"]',
      'meta[name="DC.date.issued"]',
      'meta[name="parsely-pub-date"]',
    ]),
    $('time[datetime]').first().attr('datetime'),
    visibleDateText($)
  );
  if (dateRaw) {
    const { year, month, day } = splitDate(dateRaw);
    data.year = year;
    data.month = month;
    data.day = day;
  }

  // Authors — pass Readability byline so NER fallback has article-body text to work with
  data.authors = await extractAuthors($, jsonld, rdbl.byline);

  // URL & canonical
  data.url = pickFirst(
    metaContent($, ['meta[property="og:url"]']),
    $('link[rel="canonical"]').attr('href'),
    baseUrl
  );
  if (data.url) data.url = cleanCanonicalUrl(data.url, baseUrl);

  // Journal-specific (citation_* tags are gold)
  data.journal = metaContent($, [
    'meta[name="citation_journal_title"]',
    'meta[name="prism.publicationName"]',
  ]);
  data.volume = metaContent($, ['meta[name="citation_volume"]', 'meta[name="prism.volume"]']);
  data.issue = metaContent($, ['meta[name="citation_issue"]', 'meta[name="prism.number"]']);
  const firstPage = metaContent($, ['meta[name="citation_firstpage"]', 'meta[name="prism.startingPage"]']);
  const lastPage = metaContent($, ['meta[name="citation_lastpage"]', 'meta[name="prism.endingPage"]']);
  data.pages = firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage;
  data.doi = metaContent($, [
    'meta[name="citation_doi"]',
    'meta[name="prism.doi"]',
    'meta[name="dc.identifier.doi"]',
  ])
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  data.articleNumber = metaContent($, [
    'meta[name="citation_article_number"]',
    'meta[name="citation_arxiv_id"]',
    'meta[name="prism.articleIdentifier"]',
  ]);

  // Platform defaults for social/video pages.
  if (/youtube\.com|youtu\.be/.test(host)) data.platform = 'YouTube';
  else if (/tiktok\.com/.test(host)) data.platform = 'TikTok';
  else if (/instagram\.com/.test(host)) data.platform = 'Instagram';
  else if (/twitter\.com|x\.com/.test(host)) data.platform = 'X';
  else if (/facebook\.com/.test(host)) data.platform = 'Facebook';

  // Today's date as default access date
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  data.accessDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  const guessedType = guessType($, jsonld, baseUrl, style);

  return { data, guessedType };
}
