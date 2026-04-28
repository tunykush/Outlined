import type { Author, CitationData, SourceType } from '../shared/types.js';
import { emptyCitationData } from '../shared/citation-engine.js';

export type ReferenceIdentifier =
  | { kind: 'doi'; value: string; fromUrl: boolean }
  | { kind: 'pmid'; value: string; fromUrl: boolean };

export interface LookupResult {
  data: Partial<CitationData>;
  guessedType: SourceType;
}

interface CrossrefDate {
  'date-parts'?: number[][];
}

interface CrossrefPerson {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefWork {
  type?: string;
  title?: string[];
  subtitle?: string[];
  author?: CrossrefPerson[];
  editor?: CrossrefPerson[];
  issued?: CrossrefDate;
  published?: CrossrefDate;
  'published-print'?: CrossrefDate;
  'published-online'?: CrossrefDate;
  created?: CrossrefDate;
  'container-title'?: string[];
  publisher?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  ISBN?: string[];
  'article-number'?: string;
}

interface OpenAlexWork {
  doi?: string;
  title?: string;
  display_name?: string;
  type?: string;
  type_crossref?: string;
  publication_year?: number;
  publication_date?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
      host_organization_name?: string;
    };
  };
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  ids?: {
    doi?: string;
  };
}

interface PubMedAuthor {
  name?: string;
}

interface PubMedArticleId {
  idtype?: string;
  value?: string;
}

interface PubMedSummary {
  uid?: string;
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  epubdate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  authors?: PubMedAuthor[];
  articleids?: PubMedArticleId[];
  elocationid?: string;
}

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

function clean(s: unknown): string {
  return String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function first(items?: string[]): string {
  return clean(items?.find((item) => clean(item)));
}

function stripTrailingDoiPunctuation(value: string): string {
  return value.replace(/[.,;)\]}]+$/g, '');
}

export function canonicalDoi(raw: string): string {
  const s = decodeURIComponent(clean(raw))
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return stripTrailingDoiPunctuation(s).replace(/\s+/g, '');
}

export function doiUrl(doi: string): string {
  const bare = canonicalDoi(doi);
  return bare ? `https://doi.org/${bare}` : '';
}

export function parseReferenceIdentifier(raw: string): ReferenceIdentifier | null {
  const input = clean(raw);
  if (!input) return null;

  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (/^(?:dx\.)?doi\.org$/i.test(host)) {
      const doi = canonicalDoi(u.pathname.replace(/^\/+/, ''));
      if (doi) return { kind: 'doi', value: doi, fromUrl: true };
    }
    if (host === 'pubmed.ncbi.nlm.nih.gov') {
      const pmid = u.pathname.match(/\/(\d{1,9})(?:\/|$)/)?.[1];
      if (pmid) return { kind: 'pmid', value: pmid, fromUrl: true };
    }
    if (host === 'ncbi.nlm.nih.gov' || host.endsWith('.ncbi.nlm.nih.gov')) {
      const pmid = u.pathname.match(/\/pubmed\/(\d{1,9})(?:\/|$)/i)?.[1];
      if (pmid) return { kind: 'pmid', value: pmid, fromUrl: true };
    }
  } catch {
    /* not a URL; try bare identifiers below */
  }

  const doiMatch = input.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  if (doiMatch) return { kind: 'doi', value: canonicalDoi(doiMatch[1]), fromUrl: false };

  const pmidMatch = input.match(/^(?:pmid:\s*)?(\d{6,9})$/i);
  if (pmidMatch) return { kind: 'pmid', value: pmidMatch[1], fromUrl: false };

  return null;
}

function splitName(raw: string): Author {
  const s = clean(raw);
  if (!s) return { family: '', given: '' };
  if (s.includes(',')) {
    const [family, given] = s.split(',', 2).map(clean);
    return { family, given };
  }
  const orgRe = /\b(university|department|institute|association|society|foundation|agency|group|committee|organisation|organization|collaboration|consortium)\b/i;
  if (orgRe.test(s) || s.split(/\s+/).length >= 6) return { family: s, given: '', isOrganisation: true };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { family: parts[0], given: '' };
  const family = parts.pop() || '';
  return { family, given: parts.join(' ') };
}

function pubMedAuthor(raw: string): Author {
  const s = clean(raw);
  const m = s.match(/^(.+?)\s+([A-Z]{1,6})$/);
  if (m) return { family: m[1], given: m[2].split('').join('. ') + '.' };
  return splitName(s);
}

function crossrefPeople(people?: CrossrefPerson[]): Author[] {
  return (people || [])
    .map((person) => {
      const literal = clean(person.name);
      if (literal) return splitName(literal);
      return { family: clean(person.family), given: clean(person.given) };
    })
    .filter((a) => a.family || a.given);
}

function dateFromParts(date?: CrossrefDate): { year: string; month: string; day: string } {
  const parts = date?.['date-parts']?.[0] || [];
  const [year, month, day] = parts;
  return {
    year: year ? String(year) : '',
    month: month ? MONTHS[month - 1] || '' : '',
    day: day ? String(day) : '',
  };
}

function parseDate(raw: string): { year: string; month: string; day: string } {
  const s = clean(raw).replace(/,/g, '');
  if (!s) return { year: '', month: '', day: '' };

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return { year: m[1], month: MONTH_LOOKUP[m[2].toLowerCase()] || '', day: String(Number(m[3])) };

  m = s.match(/^(\d{4})\s+([A-Za-z]+)(?:\s+(\d{1,2}))?/);
  if (m) return { year: m[1], month: MONTH_LOOKUP[m[2].toLowerCase()] || '', day: m[3] ? String(Number(m[3])) : '' };

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})?\s*(\d{4})$/);
  if (m) return { year: m[3], month: MONTH_LOOKUP[m[1].toLowerCase()] || '', day: m[2] ? String(Number(m[2])) : '' };

  m = s.match(/\b(19|20)\d{2}\b/);
  return { year: m?.[0] || '', month: '', day: '' };
}

function applyDate(data: Partial<CitationData>, date: { year: string; month: string; day: string }): void {
  if (date.year) data.year = date.year;
  if (date.month) data.month = date.month;
  if (date.day) data.day = date.day;
}

function sourceFromCrossrefType(type: string, hasJournal: boolean): SourceType {
  const t = clean(type).toLowerCase();
  if (t === 'book-chapter' || t === 'book-section' || t === 'reference-entry') return 'book-chapter';
  if (t.includes('book')) return 'book';
  if (t.includes('report') || t.includes('standard')) return 'report';
  if (t === 'journal-article' || t === 'journal-issue' || hasJournal) return 'journal';
  if (t.includes('posted-content')) return 'journal';
  return 'webpage';
}

function sourceFromOpenAlex(work: OpenAlexWork, hasJournal: boolean): SourceType {
  const t = clean(work.type_crossref || work.type).toLowerCase();
  if (t.includes('book-chapter') || t.includes('book-section')) return 'book-chapter';
  if (t.includes('book')) return 'book';
  if (t.includes('report') || t.includes('dataset')) return 'report';
  if (t.includes('journal-article') || t === 'article' || hasJournal) return 'journal';
  return 'webpage';
}

export function crossrefWorkToExtraction(work: CrossrefWork): LookupResult {
  const data = emptyCitationData() as Partial<CitationData>;
  data.title = [first(work.title), first(work.subtitle)].filter(Boolean).join(': ');
  data.authors = crossrefPeople(work.author);
  data.editors = crossrefPeople(work.editor);
  data.doi = canonicalDoi(work.DOI || '');
  data.url = data.doi ? doiUrl(data.doi) : clean(work.URL);
  data.journal = first(work['container-title']);
  data.volume = clean(work.volume);
  data.issue = clean(work.issue);
  data.pages = clean(work.page);
  data.articleNumber = clean(work['article-number']);
  data.publisher = clean(work.publisher);

  const guessedType = sourceFromCrossrefType(work.type || '', Boolean(data.journal));
  if (guessedType === 'book-chapter') data.bookTitle = data.journal || first(work['container-title']);
  if (guessedType === 'book' || guessedType === 'book-chapter' || guessedType === 'report') data.siteName = data.publisher || '';

  applyDate(data, dateFromParts(work['published-print'] || work['published-online'] || work.published || work.issued || work.created));
  return { data, guessedType };
}

export function openAlexWorkToExtraction(work: OpenAlexWork): LookupResult {
  const data = emptyCitationData() as Partial<CitationData>;
  const source = work.primary_location?.source;
  data.title = clean(work.title || work.display_name);
  data.authors = (work.authorships || [])
    .map((a) => splitName(a.author?.display_name || ''))
    .filter((a) => a.family || a.given);
  data.doi = canonicalDoi(work.doi || work.ids?.doi || '');
  data.url = data.doi ? doiUrl(data.doi) : clean(work.primary_location?.landing_page_url);
  data.journal = clean(source?.display_name);
  data.publisher = clean(source?.host_organization_name);
  data.volume = clean(work.biblio?.volume);
  data.issue = clean(work.biblio?.issue);
  const firstPage = clean(work.biblio?.first_page);
  const lastPage = clean(work.biblio?.last_page);
  data.pages = firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage;

  const guessedType = sourceFromOpenAlex(work, Boolean(data.journal));
  if (guessedType === 'book-chapter') data.bookTitle = data.journal;
  if (work.publication_date) applyDate(data, parseDate(work.publication_date));
  else if (work.publication_year) data.year = String(work.publication_year);
  return { data, guessedType };
}

export function pubMedSummaryToExtraction(summary: PubMedSummary): LookupResult {
  const data = emptyCitationData() as Partial<CitationData>;
  data.title = clean(summary.title).replace(/\.$/, '');
  data.authors = (summary.authors || [])
    .map((a) => pubMedAuthor(a.name || ''))
    .filter((a) => a.family || a.given);
  data.journal = clean(summary.fulljournalname || summary.source);
  data.publisher = 'PubMed';
  data.volume = clean(summary.volume);
  data.issue = clean(summary.issue);
  data.pages = clean(summary.pages);
  const doi = (summary.articleids || []).find((id) => /doi/i.test(id.idtype || ''))?.value || summary.elocationid || '';
  data.doi = canonicalDoi(doi);
  data.url = data.doi ? doiUrl(data.doi) : summary.uid ? `https://pubmed.ncbi.nlm.nih.gov/${summary.uid}/` : '';
  applyDate(data, parseDate(summary.pubdate || summary.epubdate || ''));
  return { data, guessedType: 'journal' };
}

async function fetchJson<T>(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupDoi(doi: string): Promise<LookupResult | null> {
  const bare = canonicalDoi(doi);
  if (!bare) return null;

  const crossref = await fetchJson<{ message?: CrossrefWork }>(
    `https://api.crossref.org/works/${encodeURIComponent(bare)}`,
    10000,
    { 'User-Agent': 'Outlined Citation Metadata/1.0 (mailto:no-reply@example.com)' }
  );
  if (crossref?.message) return crossrefWorkToExtraction(crossref.message);

  const openAlex = await fetchJson<OpenAlexWork>(
    `https://api.openalex.org/works/doi:${encodeURIComponent(bare)}`,
    10000
  );
  if (openAlex) return openAlexWorkToExtraction(openAlex);

  return null;
}

async function lookupPmid(pmid: string): Promise<LookupResult | null> {
  const id = clean(pmid);
  if (!/^\d{1,9}$/.test(id)) return null;
  const pubmed = await fetchJson<{ result?: Record<string, PubMedSummary | string[]> }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(id)}&retmode=json`,
    10000
  );
  const summary = pubmed?.result?.[id];
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) return pubMedSummaryToExtraction(summary);
  return null;
}

export async function lookupReferenceIdentifier(identifier: ReferenceIdentifier): Promise<LookupResult | null> {
  return identifier.kind === 'doi' ? lookupDoi(identifier.value) : lookupPmid(identifier.value);
}
