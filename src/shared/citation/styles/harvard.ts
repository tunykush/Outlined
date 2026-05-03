/**
 * RMIT Harvard formatter.
 * Built against the uploaded RMIT Harvard Style Guide PDF.
 * It intentionally does not try to support generic Harvard variants.
 */

import type { Author, CitationData, CitationOutput, SourceType } from '../../types.js';

const VI_NAME_RE = /[ắằẳẵặấầẩẫậẻẽẹềếểễệịỉĩọỏồốổỗộờớởỡợụủũừứửữựỳỷỹỵđ]/i;

/** Strip Vietnamese (and other) diacritics → plain ASCII for citation output. */
// eslint-disable-next-line no-misleading-character-class
const COMBINING_RE = /[̀-ͯ]/g;
function asciiName(s: string): string {
  return s.normalize('NFD').replace(COMBINING_RE, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

const esc = (s: string = ''): string =>
  String(s).replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));

const ital = (s: string): string => `<i>${s}</i>`;
const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '');
const clean = (s: string = ''): string => String(s).replace(/\s+/g, ' ').trim();
const has = (s: string | undefined | null): boolean => clean(s || '').length > 0;
const endFullStop = (s: string): string => /[.!?]$/.test(stripHtml(s).trim()) ? s.trim() : `${s.trim()}.`;
const joinNonEmpty = (parts: string[], sep = ', '): string => parts.filter((p) => has(stripHtml(p))).join(sep);
const noFinalPeriodAfterUrl = (s: string): string => s.trim().replace(/(https?:\/\/\S+)\.$/i, '$1');
const LQ = '‘';
const RQ = '’';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_LOOKUP: Record<string, string> = Object.fromEntries(
  MONTHS.flatMap((m, i) => [[m.toLowerCase(), m], [m.slice(0, 3).toLowerCase(), m], [String(i + 1), m], [String(i + 1).padStart(2, '0'), m]])
);

function initialsNoStops(given: string): string {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/\./g, '').split('-').filter(Boolean).map((p) => p[0]?.toUpperCase() || '').join(''))
    .join('');
}

function smartSingleQuotes(raw: string): string {
  return clean(raw)
    .replace(/(^|[\s([{])'/g, `$1${LQ}`)
    .replace(/'/g, RQ);
}

function quotedTitle(raw: string, fallback: string): string {
  return `${LQ}${esc(smartSingleQuotes(raw) || fallback)}${RQ}`;
}

function validPeople(authors: Author[] = []): Author[] {
  return authors.filter((a) => has(a.family) || has(a.given));
}

function personHarvard(a: Author): string {
  if (a.isOrganisation) return clean(a.family);
  const fam = clean(a.family).normalize('NFC');
  const givenClean = clean(a.given).normalize('NFC');
  // Vietnamese names: use full given name (not initials) and strip diacritics to plain ASCII.
  const isVietnamese = VI_NAME_RE.test(fam) || VI_NAME_RE.test(givenClean);
  if (isVietnamese) {
    const famAscii = asciiName(fam);
    const givenAscii = asciiName(givenClean);
    return givenAscii ? `${famAscii} ${givenAscii}` : famAscii;
  }
  const ini = initialsNoStops(givenClean);
  return ini ? `${fam} ${ini}` : fam;
}

function authorsHarvard(authors: Author[] = []): string {
  const list = validPeople(authors).map(personHarvard).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function referenceAuthorsHarvard(d: CitationData): string {
  const override = clean((d as CitationData & { referenceAuthorText?: string }).referenceAuthorText || '');
  return override || authorsHarvard(d.authors);
}

function parsePeople(raw: string): Author[] {
  const s = clean(raw);
  if (!s) return [];
  return s
    .split(/\s*(?:;|\||\n)\s*/)
    .map((name) => {
      const n = clean(name);
      if (!n) return { family: '', given: '' };
      if (n.includes(',')) {
        const [family, given] = n.split(',', 2).map(clean);
        return { family, given };
      }
      const parts = n.split(/\s+/);
      if (parts.length === 1) return { family: parts[0], given: '' };
      const family = parts.shift() || '';
      const initials = parts.join(' ');
      return { family, given: initials };
    })
    .filter((a) => has(a.family) || has(a.given));
}

function peopleTextHarvard(authors: Author[] = [], raw = ''): string {
  const list = [...validPeople(authors), ...parsePeople(raw)];
  return authorsHarvard(list);
}

function inTextAuthor(authors: Author[] = []): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  const name = (a: Author) => clean(a.family || a.given);
  if (list.length === 1) return name(list[0]);
  if (list.length === 2) return `${name(list[0])} and ${name(list[1])}`;
  return `${name(list[0])} et al.`;
}

function yearOnly(d: CitationData): string {
  return clean(d.year) || 'n.d.';
}

function normaliseMonth(month: string): string {
  const m = clean(month).replace(/\.$/, '');
  if (!m) return '';
  return MONTH_LOOKUP[m.toLowerCase()] || m;
}

function normaliseDay(day: string): string {
  return clean(day).replace(/(st|nd|rd|th)$/i, '');
}

function parseLooseDate(raw: string): { day: string; month: string; year: string } {
  const s = clean(raw).replace(/,/g, '');
  if (!s) return { day: '', month: '', year: '' };

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { day: String(Number(m[3])), month: normaliseMonth(m[2]), year: m[1] };

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return { day: String(Number(m[1])), month: normaliseMonth(m[2]), year: m[3] };

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}[a-z]?)$/i);
  if (m) return { day: normaliseDay(m[1]), month: normaliseMonth(m[2]), year: m[3] };

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}[a-z]?)$/i);
  if (m) return { day: normaliseDay(m[2]), month: normaliseMonth(m[1]), year: m[3] };

  m = s.match(/^(\d{4}[a-z]?)$/i);
  if (m) return { day: '', month: '', year: m[1] };

  return { day: '', month: '', year: '' };
}

function dayMonthYear(day: string, month: string, year: string): string {
  const y = clean(year) || 'n.d.';
  const m = normaliseMonth(month);
  const d = normaliseDay(day);
  if (d && m && y) return `${d} ${m} ${y}`;
  // Month without a specific day is ambiguous — show year only.
  return y;
}

function sourceDateText(d: CitationData): string {
  return dayMonthYear(d.day, d.month, yearOnly(d));
}

function accessDateText(d: CitationData): string {
  const fromRaw = parseLooseDate(d.accessDate);
  if (fromRaw.year || fromRaw.month || fromRaw.day) return dayMonthYear(fromRaw.day, fromRaw.month, fromRaw.year);
  return clean(d.accessDate);
}

function dateYear(d: CitationData): string {
  return `(${yearOnly(d)})`;
}

function dateFull(d: CitationData): string {
  return `(${sourceDateText(d)})`;
}


function accessPart(d: CitationData): string {
  return has(d.accessDate) ? `accessed ${esc(accessDateText(d))}` : 'accessed date needed';
}

function appendUrl(out: string, url: string): string {
  if (!has(url)) return endFullStop(out);
  return noFinalPeriodAfterUrl(`${out.trim()}. ${clean(url)}`);
}

function doiHarvard(rawDoi: string): string {
  if (!has(rawDoi)) return '';
  const raw = clean(rawDoi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return `doi:${raw}`;
}

function edn(edition: string): string {
  const e = clean(edition);
  if (!e || /^1(st)?(?:\s+edn?)?$/i.test(e)) return '';
  if (/edn$/i.test(e)) return e;
  if (/ed\.?$/i.test(e)) return e.replace(/ed\.?$/i, 'edn');
  if (/\d+(st|nd|rd|th)$/i.test(e)) return `${e} edn`;
  return `${e} edn`;
}

function domainPrefixUpper(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const first = host.split('.')[0] || '';
    return first.toUpperCase();
  } catch {
    return '';
  }
}

function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7F]/.test(s);
}

function websiteName(d: CitationData): string {
  let raw = clean(d.siteName || d.publisher || d.platform);
  // Vietnamese (or other non-ASCII) site names render poorly in Harvard output and
  // typically have a well-known shorthand matching the domain prefix
  // (e.g. "Báo Công an Nhân dân" → cand.com.vn → "CAND"). Prefer the upper-cased
  // domain prefix in that case.
  if (raw && hasNonAscii(raw)) {
    const fallback = domainPrefixUpper(d.url);
    if (fallback) raw = fallback;
  }
  if (!raw) return '';
  // RMIT Harvard examples sometimes use the domain itself as the website name.
  if (/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(raw)) {
    return /\bwebsite\b/i.test(raw) ? raw : `${raw} website`;
  }
  return /\bwebsite\b/i.test(raw) ? raw : `${raw} website`;
}

function refLead(d: CitationData, titleHtmlForNoAuthor: string, date = dateYear(d)): { lead: string; omittedTitle: boolean } {
  const author = referenceAuthorsHarvard(d);
  if (author) return { lead: `${esc(author)} ${date} `, omittedTitle: false };
  return { lead: `${titleHtmlForNoAuthor} ${date} `, omittedTitle: true };
}

function titleSnippet(d: CitationData, words = 4): string {
  return clean(d.title).split(/\s+/).slice(0, words).join(' ') || 'Title';
}

const ITALIC_NO_AUTHOR_IN_TEXT = new Set<SourceType>([
  'webpage',
  'webpage-document',
  'wiki-entry',
  'book',
  'translated-book',
  'report',
  'image',
  'lecture-recording',
  'powerpoint-slides',
  'lab-manual',
  'thesis',
]);

function noAuthorText(d: CitationData, source: SourceType): string {
  if (source === 'journal') return clean(d.journal || d.title || 'Title');
  if (source === 'newspaper-online' || source === 'newspaper-print') return clean(d.publisher || d.siteName || d.title || 'Title');
  if (source === 'ai-chat') return clean(d.publisher || d.toolName || d.title || 'OpenAI');
  const snippet = esc(titleSnippet(d));
  return ITALIC_NO_AUTHOR_IN_TEXT.has(source) ? ital(snippet) : `${LQ}${snippet}${RQ}`;
}

function quoteLocatorHarvard(d: CitationData, source: SourceType): string {
  const qp = clean(d.quotePage);
  const qps = clean(d.quotePages);
  const section = clean(d.quoteSection);
  const para = clean(d.quoteParagraph);
  const time = clean(d.timestamp);
  if (qp) return qp;
  if (qps) return qps;
  if (time) return time;
  if (section && para) return `${section} section, para. ${para}`;
  if (section) return `${section} section`;
  if (para) return `para. ${para}`;
  if (
    source === 'social-twitter' ||
    source === 'social-facebook' ||
    source === 'social-instagram' ||
    source === 'social-tiktok' ||
    source === 'youtube-video' ||
    source === 'streaming-video' ||
    source === 'podcast' ||
    source === 'film' ||
    source === 'tv-series' ||
    source === 'tv-episode'
  ) return '';
  return 'page/locator needed';
}

function harvardInTextParenthetical(d: CitationData, source: SourceType): string {
  if (source === 'legal-act') return `(${esc(clean(d.title) || 'Title of Act')} ${esc(yearOnly(d))}${has(d.section) ? ` s ${esc(clean(d.section))}` : ''})`;
  if (source === 'legal-case') return `(${ital(esc(clean(d.title) || 'Case title'))} ${esc(yearOnly(d))})`;
  if (source === 'personal-communication') return harvardPersonalCommunicationParenthetical(d);
  const author = inTextAuthor(d.authors);
  if ((source === 'newspaper-online' || source === 'newspaper-print') && !author) {
    return `(${esc(noAuthorText(d, source))} ${esc(sourceDateText(d))})`;
  }
  return author ? `(${esc(author)} ${esc(yearOnly(d))})` : `(${noAuthorText(d, source)} ${esc(yearOnly(d))})`;
}

function harvardInTextNarrative(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return harvardPersonalCommunicationNarrative(d);
  const author = inTextAuthor(d.authors);
  if ((source === 'newspaper-online' || source === 'newspaper-print') && !author) {
    return `${esc(noAuthorText(d, source))} (${esc(sourceDateText(d))})`;
  }
  return author ? `${esc(author)} (${esc(yearOnly(d))})` : `${noAuthorText(d, source)} (${esc(yearOnly(d))})`;
}

function harvardInTextQuote(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return harvardPersonalCommunicationParenthetical(d);
  const base = harvardInTextParenthetical(d, source).replace(/\)$/, '');
  const locator = quoteLocatorHarvard(d, source);
  return locator ? `${base}:${esc(locator)})` : `${base})`;
}

function communicationName(d: CitationData): string {
  const a = validPeople(d.authors)[0];
  return a ? clean(a.family || a.given) : 'Family name needed';
}

function harvardPersonalCommunicationParenthetical(d: CitationData): string {
  return `(${esc(communicationName(d))}, personal communication, ${esc(sourceDateText(d))})`;
}

function harvardPersonalCommunicationNarrative(d: CitationData): string {
  return `${esc(communicationName(d))} (personal communication, ${esc(sourceDateText(d))})`;
}

/* -------------------- reference-list generators -------------------- */

function harvardWebpageLike(d: CitationData, titleAlwaysItalic = false): string {
  const rawTitle = esc(clean(d.title) || 'Untitled webpage');
  const titleHtml = titleAlwaysItalic ? ital(rawTitle) : rawTitle;

  // RMIT Harvard: no personal author → use org/site name as organisation author.
  // Title-first is only the absolute last resort when no org name exists either.
  const hasPersonal = validPeople(d.authors).length > 0;
  const orgName = !hasPersonal ? clean(d.siteName || d.publisher || '') : '';

  // Webpage references in RMIT Harvard use year-only, not the full publication date.
  const date = dateYear(d);

  let lead: string;
  let titleInLead = false;
  if (hasPersonal) {
    lead = `${esc(referenceAuthorsHarvard(d))} ${date} `;
  } else if (orgName) {
    lead = `${esc(orgName)} ${date} `;
  } else {
    lead = `${titleHtml} ${date} `;
    titleInLead = true;
  }

  const parts: string[] = [titleInLead ? lead.trim() : `${lead.trim()} ${titleHtml}`];
  const site = websiteName(d);
  if (site) parts.push(esc(site));
  parts.push(accessPart(d));
  return appendUrl(joinNonEmpty(parts), d.url);
}

function harvardWebpage(d: CitationData): string {
  return harvardWebpageLike(d, true);
}

function harvardWebpageDocument(d: CitationData): string {
  return harvardWebpageLike(d, true);
}

function harvardWikiEntry(d: CitationData): string {
  return harvardWebpageLike(d, true);
}

function harvardNewsOnline(d: CitationData): string {
  const title = quotedTitle(d.title, 'Untitled article');
  const author = authorsHarvard(d.authors);
  const pub = clean(d.publisher || d.siteName || 'Newspaper or magazine');
  let out = author
    ? `${esc(author)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`
    : `${esc(pub)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`;
  if (has(d.pages)) out += `, ${esc(clean(d.pages))}`;
  out += `, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function harvardNewsPrint(d: CitationData): string {
  const title = quotedTitle(d.title, 'Untitled article');
  const author = authorsHarvard(d.authors);
  const pub = clean(d.publisher || d.siteName || 'Newspaper or magazine');
  let out = author
    ? `${esc(author)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`
    : `${esc(pub)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`;
  if (has(d.pages)) out += `, ${esc(clean(d.pages))}`;
  return endFullStop(out);
}

function articleNumberPart(raw: string): string {
  const n = clean(raw);
  if (!n) return '';
  return /^article\b/i.test(n) ? n : `Article ${n}`;
}

function journalLocator(d: CitationData): string {
  const pages = clean(d.pages);
  const article = articleNumberPart(d.articleNumber);
  if (pages && article) return `${pages}, ${article}`;
  if (pages) return pages;
  if (article) return article;
  return '';
}

function harvardJournal(d: CitationData): string {
  const title = quotedTitle(d.title, 'Untitled article');
  const author = authorsHarvard(d.authors);
  const journalName = clean(d.journal || 'Journal title');
  let out = author
    ? `${esc(author)} ${dateYear(d)} ${title}, ${ital(esc(journalName))}`
    : `${esc(journalName)} ${dateYear(d)} ${title}, ${ital(esc(journalName))}`;
  const vol = clean(d.volume);
  const issue = clean(d.issue);
  const locator = journalLocator(d);
  if (vol) out += `, ${esc(vol)}${issue ? `(${esc(issue)})` : ''}`;
  if (locator) out += `:${esc(locator)}`;
  if (has(d.doi)) out += `, ${doiHarvard(d.doi)}.`;
  else if (has(d.url)) out += `, ${websiteName(d) || 'website'}, ${accessPart(d)}. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardBook(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled book'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [omittedTitle ? lead.trim() : `${lead.trim()} ${title}`];
  const edition = edn(d.edition);
  if (edition) parts.push(esc(edition));
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardTranslatedBook(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled book'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [omittedTitle ? lead.trim() : `${lead.trim()} ${title}`];
  if (has(d.translatorsText)) parts.push(`translated by ${esc(clean(d.translatorsText))}`);
  const edition = edn(d.edition);
  if (edition) parts.push(esc(edition));
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else if (has(d.place)) parts.push(esc(clean(d.place)));
  if (has(d.originalYear)) parts.push(`original work published ${esc(clean(d.originalYear))}`);
  return endFullStop(joinNonEmpty(parts));
}

function harvardBookChapter(d: CitationData): string {
  const author = authorsHarvard(d.authors);
  const chapterTitle = quotedTitle(d.title, 'Untitled chapter');
  const lead = author ? `${esc(author)} ${dateYear(d)} ` : `${chapterTitle} ${dateYear(d)} `;
  const editors = peopleTextHarvard(d.editors, d.editorsText);
  const editorLabel = (validPeople(d.editors).length + parsePeople(d.editorsText).length) === 1 ? 'ed' : 'eds';
  const book = ital(esc(clean(d.bookTitle) || 'Book title'));
  const parts = [
    `${lead}${author ? chapterTitle : ''}`.trim(),
    editors ? `in ${esc(editors)} (${editorLabel}) ${book}` : `in ${book}`,
  ];
  const edition = edn(d.edition);
  if (edition) parts.push(esc(edition));
  if (has(d.pages)) parts.push(esc(clean(d.pages)));
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardReport(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled report'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [omittedTitle ? lead.trim() : `${lead.trim()} ${title}`];
  if (has(d.reportNumber)) parts.push(esc(clean(d.reportNumber)));
  const pub = clean(d.publisher || d.siteName);
  if (pub) parts.push(esc(pub));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return appendUrl(joinNonEmpty(parts), d.url);
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardBlogPost(d: CitationData): string {
  const author = authorsHarvard(d.authors);
  const blog = clean(d.siteName || d.publisher || 'Blog');
  const title = quotedTitle(d.title, 'Untitled post');
  let out = author
    ? `${esc(author)} ${dateFull(d)} ${title}, ${ital(esc(blog))}`
    : `${esc(blog)} ${dateFull(d)} ${title}, ${ital(esc(blog))}`;
  out += `, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function firstWords(text: string, n: number): string {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.join(' ');
  return `${words.slice(0, n).join(' ')}...`;
}

function harvardSocial(d: CitationData, defaultPostType: string): string {
  const author = authorsHarvard(d.authors) || clean(d.siteName || d.publisher || d.username || 'Page name');
  const title = firstWords(d.title || 'Untitled post', 10);
  const type = clean(d.postType || defaultPostType);
  const page = clean(d.siteName || d.publisher || d.username || author);
  let out = `${esc(author)} ${dateFull(d)} ${quotedTitle(title, 'Untitled post')} [${esc(type)}], ${esc(page)}, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function harvardYouTube(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.siteName || d.publisher || 'Channel name');
  const channel = clean(d.siteName || d.publisher || author);
  const website = clean(d.platform || 'YouTube');
  let out = `${esc(author)} ${dateFull(d)} ${quotedTitle(d.title, 'Untitled video')} [video], ${esc(channel)}, ${esc(websiteName({ ...d, siteName: website, publisher: '', platform: '' }))}, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function harvardFilm(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled film'));
  const role = clean(d.hostRole || 'director').toLowerCase();
  const creator = authorsHarvard(d.authors);
  const companies = clean(d.productionCompanies || d.publisher);
  const parts = [creator ? `${esc(creator)} (${esc(role)}) ${dateYear(d)} ${title} [motion picture]` : `${title} ${dateYear(d)} [motion picture]`];
  if (has(d.seriesTitle)) parts.push(esc(clean(d.seriesTitle)));
  if (companies) parts.push(esc(companies));
  if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardPodcast(d: CitationData): string {
  const hosts = authorsHarvard(d.authors) || clean(d.publisher || d.siteName || 'Host');
  const hostRole = validPeople(d.authors).length > 1 ? 'hosts' : 'host';
  const producer = peopleTextHarvard([], d.producersText) || clean(d.productionCompanies || '');
  const lead = producer
    ? `${esc(hosts)} (${hostRole}) and ${esc(producer)} (producer)`
    : `${esc(hosts)} (${hostRole})`;
  const series = ital(esc(clean(d.seriesTitle || d.publisher || d.siteName || 'Podcast series')));
  const network = clean(d.platform || d.publisher || d.siteName || 'Podcast network');
  let out = `${lead} ${dateFull(d)} ${quotedTitle(d.title, 'Untitled episode')} [podcast], ${series}, ${esc(network)}, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function harvardStreamingVideo(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.publisher || d.siteName || 'Creator');
  const channel = clean(d.siteName || d.publisher || author);
  const website = websiteName(d) || 'Website website';
  let out = `${esc(author)} ${dateFull(d)} ${quotedTitle(d.title, 'Untitled video')} [video], ${esc(channel)}, ${esc(website)}, ${accessPart(d)}`;
  return appendUrl(out, d.url);
}

function harvardTvSeries(d: CitationData): string {
  const title = clean(d.title || d.seriesTitle || 'Untitled television program');
  const creator = authorsHarvard(d.authors);
  const role = clean(d.hostRole || 'producer').toLowerCase();
  const companies = clean(d.productionCompanies || d.publisher);
  const parts = [creator ? `${esc(creator)} (${esc(role)}) ${dateYear(d)} ${quotedTitle(title, 'Untitled television program')} [television program]` : `${quotedTitle(title, 'Untitled television program')} ${dateYear(d)} [television program]`];
  if (companies) parts.push(esc(companies));
  if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardTvEpisode(d: CitationData): string {
  const title = quotedTitle(d.title, 'Untitled episode');
  const series = ital(esc(clean(d.seriesTitle) || 'Series title'));
  const creator = peopleTextHarvard(d.authors, d.directorsText || d.producersText || d.writersText);
  const role = clean(d.hostRole || (d.directorsText ? 'director' : 'producer')).toLowerCase();
  const leadTitle = creator
    ? `${esc(creator)} (${esc(role)}) ${dateYear(d)} ${title} [television program]`
    : `${title} ${dateYear(d)} [television program]`;
  const details = [has(d.season) ? `season ${clean(d.season)}` : '', has(d.episode) ? `episode ${clean(d.episode)}` : ''].filter(Boolean).join(', ');
  const parts = [leadTitle, `${series}${details ? ` (${esc(details)})` : ''}`];
  if (has(d.productionCompanies || d.publisher)) parts.push(esc(clean(d.productionCompanies || d.publisher)));
  if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardImage(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled image'));
  const { lead, omittedTitle } = refLead(d, title, dateFull(d));
  const titleWithFormat = `${title} [${esc(clean(d.description || d.format || 'image'))}]`;
  const parts = [omittedTitle ? lead.trim() : `${lead.trim()} ${titleWithFormat}`];
  if (has(d.publisher || d.siteName)) parts.push(esc(clean(d.publisher || d.siteName)));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return appendUrl(joinNonEmpty(parts), d.url);
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardCourseMaterial(d: CitationData, defaultFormat: string): string {
  const author = authorsHarvard(d.authors) || clean(d.institution || d.publisher || 'RMIT University');
  const title = quotedTitle(d.title, 'Untitled course material');
  const format = clean(d.format || defaultFormat);
  const institution = clean(d.platform || d.institution || d.publisher || 'RMIT University');
  const parts = [`${esc(author)} ${dateYear(d)} ${title} [${esc(format)}]`, esc(institution)];
  if (has(d.url)) {
    parts.push(accessPart(d));
    return appendUrl(joinNonEmpty(parts), d.url);
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardThesis(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled thesis'));
  const type = clean(d.format || 'Doctoral dissertation');
  const author = authorsHarvard(d.authors) || 'Author needed';
  const parts = [`${esc(author)} ${dateYear(d)} ${title} [${esc(type)}]`];
  if (has(d.institution)) parts.push(esc(clean(d.institution)));
  if (has(d.repository)) parts.push(`${esc(clean(d.repository))} database`);
  if (has(d.url)) {
    parts.push(accessPart(d));
    return appendUrl(joinNonEmpty(parts), d.url);
  }
  if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardLegalAct(d: CitationData): string {
  const title = clean(d.title) || 'Title of Act';
  const year = clean(d.year);
  const jurisdiction = clean(d.jurisdiction);
  const section = clean(d.section);
  let out = `${ital(esc(title + (year && !title.includes(year) ? ` ${year}` : '')))}${jurisdiction ? ` (${esc(jurisdiction)})` : ''}`;
  if (section) out += ` s ${esc(section)}`;
  return endFullStop(out);
}

function harvardLegalCase(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Case title'));
  const legalParts = [clean(d.year) ? `(${clean(d.year)})` : '', clean(d.volumeLegal), clean(d.reporter), clean(d.startingPage)].filter(Boolean).join(' ');
  let out = `${title} ${esc(legalParts)}`.trim();
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardPersonalCommunication(d: CitationData): string {
  return `Personal communication is cited in-text only: ${harvardPersonalCommunicationParenthetical(d)}. Do not include it in the reference list.`;
}

function harvardAiChat(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.publisher || 'OpenAI');
  const tool = clean(d.toolName || d.title || 'ChatGPT');
  const format = clean(d.format || 'Large language model');
  const appendixUrl = has(d.appendix) ? clean(d.appendix).split(/\s+/).find((part) => /^https?:\/\//i.test(part)) || '' : '';
  const url = clean(d.url || appendixUrl).replace(/\.$/, '');
  let out = `${esc(author)} ${dateYear(d)} ${esc(tool)} [${esc(format)}], ${accessPart(d)}`;
  if (has(url)) out += `. ${url}`;
  else out = endFullStop(out);
  if (has(d.appendix)) {
    const appendix = clean(d.appendix).replace(/^https?:\/\/\S+\s*/i, '').replace(/^\.\s*/, '').trim();
    if (appendix) out += `. ${esc(appendix)}`;
  }
  return noFinalPeriodAfterUrl(out);
}

const dispatch: Record<SourceType, (d: CitationData) => string> = {
  webpage: harvardWebpage,
  'webpage-document': harvardWebpageDocument,
  'wiki-entry': harvardWikiEntry,
  'newspaper-online': harvardNewsOnline,
  'newspaper-print': harvardNewsPrint,
  journal: harvardJournal,
  book: harvardBook,
  'book-chapter': harvardBookChapter,
  'translated-book': harvardTranslatedBook,
  report: harvardReport,
  'blog-post': harvardBlogPost,
  'social-twitter': (d) => harvardSocial(d, 'Tweet'),
  'social-facebook': (d) => harvardSocial(d, 'Facebook post'),
  'social-instagram': (d) => harvardSocial(d, 'Instagram post'),
  'social-tiktok': (d) => harvardSocial(d, 'TikTok post'),
  'youtube-video': harvardYouTube,
  film: harvardFilm,
  podcast: harvardPodcast,
  'streaming-video': harvardStreamingVideo,
  'tv-series': harvardTvSeries,
  'tv-episode': harvardTvEpisode,
  image: harvardImage,
  'lecture-recording': (d) => harvardCourseMaterial(d, 'lecture recording'),
  'powerpoint-slides': (d) => harvardCourseMaterial(d, 'PowerPoint slides'),
  'lab-manual': (d) => harvardCourseMaterial(d, 'practical manual'),
  thesis: harvardThesis,
  'legal-act': harvardLegalAct,
  'legal-case': harvardLegalCase,
  'personal-communication': harvardPersonalCommunication,
  'ai-chat': harvardAiChat,
};

export function generateHarvard(source: SourceType, data: CitationData): CitationOutput {
  return {
    reference: dispatch[source](data),
    intextParaphrase: harvardInTextParenthetical(data, source),
    intextQuote: harvardInTextQuote(data, source),
    intextNarrative: harvardInTextNarrative(data, source),
    notes: [],
  };
}

export const harvardInternals = { has, validPeople };
