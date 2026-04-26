/**
 * Extract structured metadata from HTML and map to CitationData.
 * Sources used (in priority order per source):
 *   1. JSON-LD (Article / NewsArticle / ScholarlyArticle / WebPage / Book)
 *   2. Highwire Press citation_* tags (academic — strongest signal for journals)
 *   3. Open Graph (og:*)
 *   4. Twitter Cards
 *   5. Dublin Core (dc.*)
 *   6. Generic <meta name="..."> and fallback to <title>, <h1>
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Author, CitationData, SourceType } from '../shared/types.js';
import { emptyCitationData } from '../shared/citation-engine.js';

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
          if (/^newsarticle$/.test(tl)) result.newsArticle ||= node;
          if (/^(article|blogposting|scholarlyarticle|techarticle|report)$/.test(tl)) {
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
  // Heuristic for organisations: contains words like "Inc", "Ltd", "University",
  // "Department", "Bureau", "Institute", or has 4+ words
  const orgRegex =
    /\b(inc\.?|ltd\.?|llc|university|department|bureau|institute|association|society|foundation|federation|ministry|agency|corp\.?|company|group|news|press|times|herald|gazette|tribune|post)\b/i;
  if (orgRegex.test(s)) return { family: s, given: '', isOrganisation: true };

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

/** Pull authors from various sources */
function extractAuthors($: CheerioAPI, jsonld: ReturnType<typeof parseJsonLd>): Author[] {
  const seen = new Set<string>();
  const out: Author[] = [];
  const add = (raw: string): void => {
    const cleaned = raw.trim();
    if (!cleaned || cleaned.length < 2) return;
    if (cleaned.startsWith('http')) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(splitName(cleaned));
  };

  // 1. citation_author (highest priority for academic content)
  metaContentAll($, 'meta[name="citation_author"]').forEach(add);

  // 2. JSON-LD article author
  const node = jsonld.newsArticle || jsonld.article || jsonld.book;
  if (node?.author) {
    const list = Array.isArray(node.author) ? node.author : [node.author];
    for (const a of list) {
      if (typeof a === 'string') add(a);
      else if (a && typeof a === 'object' && a.name) add(a.name);
    }
  }

  // 3. article:author (Open Graph)
  metaContentAll($, 'meta[property="article:author"]').forEach((a) => {
    if (!a.startsWith('http')) add(a);
  });

  // 4. classic meta author
  if (out.length === 0) {
    const a = metaContent($, [
      'meta[name="author"]',
      'meta[name="dc.creator"]',
      'meta[name="DC.creator"]',
      'meta[name="parsely-author"]',
      'meta[name="sailthru.author"]',
    ]);
    if (a) {
      // Some sites stuff multiple authors into one tag, separated by ", " or " and "
      a.split(/,\s*| and /i).forEach(add);
    }
  }

  return out;
}

/** Parse a date-like string into year/month/day (English month names) */
function splitDate(raw: string): { year: string; month: string; day: string } {
  if (!raw) return { year: '', month: '', day: '' };
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
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
  baseUrl: string
): SourceType {
  // Strong signals first
  if (
    metaContent($, ['meta[name="citation_journal_title"]', 'meta[name="prism.publicationName"]'])
  )
    return 'journal';
  if (metaContent($, ['meta[name="citation_doi"]'])) return 'journal';
  if (jsonld.newsArticle) return 'newspaper-online';
  if (jsonld.article) {
    const types = ([] as string[]).concat(jsonld.article['@type'] || []);
    if (types.some((t) => /report/i.test(t))) return 'report';
    if (types.some((t) => /scholarly|techarticle/i.test(t))) return 'journal';
    if (types.some((t) => /blogposting/i.test(t))) return 'blog-post';
  }
  if (jsonld.book) return 'book';

  // Hostname-based heuristics
  try {
    const host = new URL(baseUrl).hostname;
    if (/twitter\.com|x\.com/.test(host)) return 'social-twitter';
    if (/facebook\.com/.test(host)) return 'social-facebook';
    if (/instagram\.com/.test(host)) return 'social-instagram';
    if (/medium\.com|substack\.com|wordpress\.com|blogspot\./.test(host)) return 'blog-post';
    if (/(news|times|guardian|herald|post|tribune|nytimes|bbc|cnn|reuters|smh|theage)/i.test(host))
      return 'newspaper-online';
  } catch {
    /* ignore */
  }

  // og:type
  const og = metaContent($, ['meta[property="og:type"]']);
  if (/article/i.test(og)) return 'newspaper-online';
  if (/book/i.test(og)) return 'book';

  // PDF reports
  if (/\.pdf(\?|$)/i.test(baseUrl)) return 'report';

  return 'webpage';
}

/* ---------- main extractor ---------- */

export function extractMetadata(html: string, baseUrl: string): ExtractionResult {
  const $ = cheerio.load(html);
  const jsonld = parseJsonLd($);
  const data = emptyCitationData() as Partial<CitationData>;

  // Title
  data.title = pickFirst(
    metaContent($, ['meta[property="og:title"]']),
    metaContent($, ['meta[name="twitter:title"]']),
    metaContent($, ['meta[name="citation_title"]']),
    jsonld.newsArticle?.headline,
    jsonld.article?.headline,
    metaContent($, ['meta[name="dc.title"]', 'meta[name="DC.title"]']),
    $('title').first().text(),
    $('h1').first().text()
  ).replace(/\s+/g, ' ');

  // Site name / publisher
  let host = '';
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  data.siteName = pickFirst(
    metaContent($, ['meta[property="og:site_name"]']),
    jsonld.website?.name,
    metaContent($, ['meta[name="application-name"]']),
    host
  );

  // For news, publisher = newspaper masthead (often == site name)
  data.publisher = pickFirst(
    metaContent($, ['meta[name="citation_publisher"]']),
    typeof jsonld.newsArticle?.publisher === 'object' ? jsonld.newsArticle?.publisher?.name : '',
    typeof jsonld.article?.publisher === 'object' ? jsonld.article?.publisher?.name : '',
    data.siteName
  );

  // Date
  const dateRaw = pickFirst(
    metaContent($, ['meta[property="article:published_time"]']),
    metaContent($, ['meta[name="article:published_time"]']),
    metaContent($, ['meta[name="citation_publication_date"]']),
    metaContent($, ['meta[name="citation_date"]']),
    jsonld.newsArticle?.datePublished,
    jsonld.article?.datePublished,
    metaContent($, [
      'meta[name="datePublished"]',
      'meta[name="date"]',
      'meta[name="dc.date"]',
      'meta[name="DC.date"]',
      'meta[name="DC.date.issued"]',
      'meta[name="parsely-pub-date"]',
    ]),
    $('time[datetime]').first().attr('datetime')
  );
  if (dateRaw) {
    const { year, month, day } = splitDate(dateRaw);
    data.year = year;
    data.month = month;
    data.day = day;
  }

  // Authors
  data.authors = extractAuthors($, jsonld);
  if (!data.authors.length) data.authors = [{ family: '', given: '' }];

  // URL & canonical
  data.url = pickFirst(
    metaContent($, ['meta[property="og:url"]']),
    $('link[rel="canonical"]').attr('href'),
    baseUrl
  );
  if (data.url) data.url = abs(data.url, baseUrl);

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

  // Today's date as default access date
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  data.accessDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  const guessedType = guessType($, jsonld, baseUrl);

  return { data, guessedType };
}
