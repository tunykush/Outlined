/**
 * Citation engine implementing APA 7th rules from the RMIT Easy Cite APA 7th PDF.
 * The engine focuses on producing a correct APA 7 reference-list entry plus
 * parenthetical/narrative/direct-quote in-text citations for the supported source type.
 */

import type {
  Author,
  CitationData,
  CitationOutput,
  SourceType,
} from '../../types.js';

/* ============================================================
 * LOW-LEVEL HELPERS
 * ============================================================ */

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
const dot = (s: string): string => /[.!?]$/.test(stripHtml(s).trim()) ? s : `${s}.`;
const noFinalPeriodAfterUrl = (s: string): string => s.replace(/\s+\./g, '.').trim();

function sentenceCase(s: string): string {
  // Conservative: keep user capitalization except trim. Citation generators should not destroy proper nouns/acronyms.
  return clean(s);
}

function initials(given: string): string {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const bare = part.replace(/\./g, '');
      if (!bare) return '';
      if (bare.includes('-')) {
        return bare
          .split('-')
          .filter(Boolean)
          .map((p) => `${p[0]?.toUpperCase()}.`)
          .join('-');
      }
      return `${bare[0]?.toUpperCase()}.`;
    })
    .filter(Boolean)
    .join(' ');
}

function normalizeOrgCandidate(s: string): boolean {
  return /\b(inc\.?|ltd\.?|llc|university|department|bureau|institute|association|society|foundation|federation|ministry|agency|corp\.?|company|group|news|press|library|government|organisation|organization|council|committee|hospital|college|school|gallery|museum|amnesty|openai|rmit|who|unicef)\b/i.test(s);
}

function splitName(raw: string): Author {
  const s = clean(raw);
  if (!s) return { family: '', given: '' };
  if (normalizeOrgCandidate(s) || s.split(/\s+/).length >= 5) return { family: s, given: '', isOrganisation: true };
  if (s.includes(',')) {
    const [family, given] = s.split(',', 2).map(clean);
    return { family, given };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { family: parts[0], given: '' };
  const family = parts.pop() || '';
  return { family, given: parts.join(' ') };
}

function parsePeople(raw: string): Author[] {
  const s = clean(raw);
  if (!s) return [];
  // Use semicolon / pipe / newline as safe multi-person delimiters. Commas may mean "Family, Given".
  return s
    .split(/\s*(?:;|\||\n)\s*/)
    .map(splitName)
    .filter((a) => has(a.family) || has(a.given));
}

function validPeople(authors: Author[] = []): Author[] {
  return authors.filter((a) => has(a.family) || has(a.given));
}

function formatPersonAPA(a: Author): string {
  if (a.isOrganisation) return clean(a.family);
  const fam = clean(a.family);
  const ini = initials(a.given);
  return ini ? `${fam}, ${ini}` : fam;
}

function authorsAPA(authors: Author[] = []): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  if (list.length === 1) return formatPersonAPA(list[0]);
  if (list.length === 2) return `${formatPersonAPA(list[0])}, & ${formatPersonAPA(list[1])}`;
  if (list.length <= 20) {
    return `${list.slice(0, -1).map(formatPersonAPA).join(', ')}, & ${formatPersonAPA(list[list.length - 1])}`;
  }
  return `${list.slice(0, 19).map(formatPersonAPA).join(', ')}, . . . ${formatPersonAPA(list[list.length - 1])}`;
}

function authorsAPAFromText(raw: string): string {
  return authorsAPA(parsePeople(raw));
}

function formatPersonInitialsFirst(a: Author): string {
  if (a.isOrganisation) return clean(a.family);
  const ini = initials(a.given);
  return ini ? `${ini} ${clean(a.family)}` : clean(a.family);
}

function contributorsInitialsFirst(authors: Author[] = [], raw = ''): string {
  const list = [...validPeople(authors), ...parsePeople(raw)];
  if (!list.length) return '';
  const formatted = list.map(formatPersonInitialsFirst);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
}

function authorsWithRole(authors: Author[] = [], role: string): string {
  const auth = authorsAPA(authors);
  return auth ? `${auth} (${role})` : '';
}

function authorsInText(authors: Author[] = [], narrative = false): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  const name = (a: Author) => clean(a.family || a.given);
  if (list.length === 1) return name(list[0]);
  if (list.length === 2) return `${name(list[0])} ${narrative ? 'and' : '&'} ${name(list[1])}`;
  return `${name(list[0])} et al.`;
}

function apaDate(d: CitationData, includeMonthDay: boolean): string {
  const year = clean(d.year) || 'n.d.';
  if (!includeMonthDay) return `(${year}).`;
  const month = clean(d.month);
  const day = clean(d.day);
  if (month && day) return `(${year}, ${month} ${day}).`;
  if (month) return `(${year}, ${month}).`;
  return `(${year}).`;
}


function doiUrl(rawDoi: string): string {
  if (!has(rawDoi)) return '';
  const raw = clean(rawDoi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return `https://doi.org/${raw}`;
}

function authorOrTitleLead(
  d: CitationData,
  date: string,
  titleForNoAuthor: string,
): { lead: string; omitTitle: boolean; orgUsedAsAuthor: boolean } {
  const auth = authorsAPA(d.authors);
  if (auth) return { lead: `${dot(esc(auth))} ${date} `, omitTitle: false, orgUsedAsAuthor: false };
  const orgName = clean(d.siteName || d.publisher || '');
  if (orgName) return { lead: `${dot(esc(orgName))} ${date} `, omitTitle: false, orgUsedAsAuthor: true };
  const fallbackTitle = titleForNoAuthor || esc(clean(d.title) || 'Untitled source');
  return { lead: `${dot(fallbackTitle)} ${date} `, omitTitle: true, orgUsedAsAuthor: false };
}

// Resolves the "effective author" for in-text citations, matching authorOrTitleLead priority:
// personal authors → org/site name → empty (falls through to title-based in-text).
function resolveInTextAuthor(d: CitationData, narrative = false): string {
  const fromAuthors = authorsInText(d.authors, narrative);
  if (fromAuthors) return fromAuthors;
  return clean(d.siteName || d.publisher || '');
}

function sameText(a: string, b: string): boolean {
  return clean(stripHtml(a)).replace(/\.$/, '').toLowerCase() === clean(stripHtml(b)).replace(/\.$/, '').toLowerCase();
}

function titleWords(d: CitationData, n = 20): { title: string; ellipsis: string } {
  const words = clean(d.title).split(/\s+/).filter(Boolean);
  return { title: words.slice(0, n).join(' '), ellipsis: words.length > n ? '…' : '' };
}

function titleSnippet(d: CitationData, words = 3): string {
  return clean(d.title).split(/\s+/).slice(0, words).join(' ') || 'Title';
}

const ITALIC_IN_TEXT_NO_AUTHOR = new Set<SourceType>([
  'webpage',
  'webpage-document',
  'book',
  'translated-book',
  'report',
  'image',
  'lecture-recording',
  'powerpoint-slides',
  'lab-manual',
  'thesis',
  'ai-chat',
]);

const AV_TIMESTAMP_TYPES = new Set<SourceType>([
  'youtube-video',
  'film',
  'podcast',
  'streaming-video',
  'tv-series',
  'tv-episode',
]);

const NO_LOCATOR_QUOTE_TYPES = new Set<SourceType>([
  'social-twitter',
  'social-facebook',
  'social-instagram',
  'social-tiktok',
]);

function noAuthorInTextTitle(d: CitationData, source: SourceType): string {
  const t = esc(titleSnippet(d));
  if (source === 'legal-act' || source === 'legal-case') return ital(esc(clean(d.title) || 'Title'));
  if (ITALIC_IN_TEXT_NO_AUTHOR.has(source)) return ital(t);
  return `&quot;${t}&quot;`;
}

function quoteLocator(d: CitationData, source: SourceType): string {
  if (NO_LOCATOR_QUOTE_TYPES.has(source)) return '';
  const qp = clean(d.quotePage);
  const qps = clean(d.quotePages);
  const section = clean(d.quoteSection);
  const para = clean(d.quoteParagraph);
  const time = clean(d.timestamp);

  if (qp) return `p. ${esc(qp)}`;
  if (qps) return `pp. ${esc(qps)}`;
  if (time) return esc(time);
  if (section && para) return `${esc(section)} section, para. ${esc(para)}`;
  if (section) return `${esc(section)} section`;
  if (para) return `para. ${esc(para)}`;
  if (AV_TIMESTAMP_TYPES.has(source)) return 'timestamp needed';
  return 'p./para. needed';
}

/* ============================================================
 * APA 7th REFERENCE GENERATORS
 * ============================================================ */

function apaWebpageLike(d: CitationData, includeMonthDay: boolean): string {
  const date = apaDate(d, includeMonthDay);
  const title = ital(esc(sentenceCase(d.title)));
  const { lead, omitTitle, orgUsedAsAuthor } = authorOrTitleLead(d, date, title);
  const auth = authorsAPA(d.authors);
  const site = clean(d.siteName);
  // Suppress site name when it was already used as the org-author lead (avoids duplication).
  const showSite = site && !orgUsedAsAuthor && (!auth || !sameText(auth, site));
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (showSite) out += `${esc(site)}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

const apaWebpage = (d: CitationData) => apaWebpageLike(d, Boolean(clean(d.month) || clean(d.day)));
const apaWebpageDocument = (d: CitationData) => apaWebpageLike(d, false);

function apaWikiEntry(d: CitationData): string {
  // RMIT APA 7th wiki/fandom format (user-specified):
  //   No author:   Title. (Date). Title. *Wiki Name*. URL
  //   With author: Author, A. (Date). Title. *Wiki Name*. URL
  // Title plain text (not italic). No "In". No "Retrieved".
  const date = apaDate(d, Boolean(clean(d.month) || clean(d.day)));
  const entryTitle = esc(sentenceCase(d.title) || 'Untitled entry');
  const workTitle = ital(esc(clean(d.siteName || d.publisher || 'Reference work')));
  const auth = authorsAPA(d.authors);
  let out = auth
    ? `${dot(esc(auth))} ${date} ${entryTitle}. ${workTitle}. `
    : `${dot(entryTitle)} ${date} ${entryTitle}. ${workTitle}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaNewspaperOnline(d: CitationData): string {
  const date = apaDate(d, true);
  const title = esc(sentenceCase(d.title));
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.publisher) || has(d.siteName)) out += `${ital(esc(clean(d.publisher || d.siteName)))}.`;
  if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaNewspaperPrint(d: CitationData): string {
  const date = apaDate(d, true);
  const title = esc(sentenceCase(d.title));
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.publisher) || has(d.siteName)) out += ital(esc(clean(d.publisher || d.siteName)));
  if (has(d.pages)) out += `, ${esc(clean(d.pages))}`;
  return dot(out.trim());
}

function apaJournal(d: CitationData): string {
  const date = apaDate(d, false);
  const title = esc(sentenceCase(d.title));
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.journal)) out += ital(esc(clean(d.journal)));
  if (has(d.volume)) out += `${has(d.journal) ? ', ' : ''}${ital(esc(clean(d.volume)))}`;
  if (has(d.issue)) out += `(${esc(clean(d.issue))})`;
  const locatorParts: string[] = [];
  if (has(d.pages)) locatorParts.push(esc(clean(d.pages)));
  if (has(d.articleNumber)) {
    const article = clean(d.articleNumber);
    locatorParts.push(/^article\b/i.test(article) ? esc(article) : `Article ${esc(article)}`);
  }
  if (locatorParts.length) out += `, ${locatorParts.join(', ')}`;
  out = dot(out.trim());
  if (has(d.doi)) out += ` ${doiUrl(d.doi)}`;
  else if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function editionPart(edition: string): string {
  const ed = clean(edition);
  if (!ed || /^1(st)?(?:\s+ed\.)?$/i.test(ed)) return '';
  if (/ed\.?$/i.test(ed)) return ed.replace(/\.?$/, '.');
  if (/\d+(st|nd|rd|th)$/i.test(ed)) return `${ed} ed.`;
  return `${ed} ed.`;
}

function apaBook(d: CitationData): string {
  const date = apaDate(d, false);
  let title = ital(esc(sentenceCase(d.title)));
  const ed = editionPart(d.edition);
  if (ed) title += ` (${esc(ed)})`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.publisher)) out += `${esc(clean(d.publisher))}.`;
  if (has(d.doi)) out += ` ${doiUrl(d.doi)}`;
  else if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaTranslatedBook(d: CitationData): string {
  const date = apaDate(d, false);
  let title = ital(esc(sentenceCase(d.title)));
  const trans = contributorsInitialsFirst([], d.translatorsText);
  if (trans) title += ` (${esc(trans)}, Trans.)`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.publisher)) out += `${esc(clean(d.publisher))}.`;
  if (has(d.originalYear)) out += ` (Original work published ${esc(clean(d.originalYear))})`;
  if (has(d.doi)) out += ` ${doiUrl(d.doi)}`;
  else if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaBookChapter(d: CitationData): string {
  const date = apaDate(d, false);
  const chapterTitle = esc(sentenceCase(d.title));
  const { lead, omitTitle } = authorOrTitleLead(d, date, chapterTitle);
  const editors = contributorsInitialsFirst(d.editors, d.editorsText);
  const edsLabel = (validPeople(d.editors).length + parsePeople(d.editorsText).length) > 1 ? 'Eds.' : 'Ed.';
  const ed = editionPart(d.edition);
  const parens = [ed, has(d.pages) ? `pp. ${clean(d.pages)}` : ''].filter(Boolean).join(', ');
  let out = lead;
  if (!omitTitle) out += `${chapterTitle}. `;
  out += editors ? `In ${esc(editors)} (${edsLabel}), ` : 'In ';
  out += `${ital(esc(sentenceCase(d.bookTitle)))}${parens ? ` (${esc(parens)})` : ''}. `;
  if (has(d.publisher)) out += `${esc(clean(d.publisher))}.`;
  if (has(d.doi)) out += ` ${doiUrl(d.doi)}`;
  else if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaReport(d: CitationData): string {
  const date = apaDate(d, false);
  let title = ital(esc(sentenceCase(d.title)));
  if (has(d.reportNumber)) title += ` (${esc(clean(d.reportNumber))})`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  const auth = authorsAPA(d.authors);
  const pub = clean(d.publisher);
  const showPublisher = pub && (!auth || !sameText(auth, pub));
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (showPublisher) out += `${esc(pub)}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaBlogPost(d: CitationData): string {
  const date = apaDate(d, true);
  const title = esc(sentenceCase(d.title));
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.siteName)) out += `${ital(esc(clean(d.siteName)))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaSocial(d: CitationData, platformDefault: string, descDefault: string, postTypeDefault: string): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);
  const handle = has(d.username) ? ` [${esc(clean(d.username))}]` : '';
  const { title, ellipsis } = titleWords(d, 20);
  const desc = clean(d.description || descDefault);
  const postType = clean(d.postType || postTypeDefault);
  const platform = clean(d.platform || platformDefault);
  let lead = '';
  if (auth) lead = `${dot(`${esc(auth)}${handle}`)} ${date} `;
  else lead = `${dot(ital(`${esc(title)}${ellipsis}`))} ${date} `;
  let out = lead;
  if (auth) out += `${ital(`${esc(title)}${ellipsis}`)} `;
  if (desc) out += `[${esc(desc)}] `;
  out += `[${esc(postType)}]. ${esc(platform)}.`;
  if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaYouTube(d: CitationData): string {
  const date = apaDate(d, true);
  const title = `${ital(esc(sentenceCase(d.title)))} [Video]`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  out += `${esc(clean(d.platform || 'YouTube'))}.`;
  if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaFilm(d: CitationData): string {
  const role = clean(d.hostRole || 'Director');
  const auth = authorsWithRole(d.authors, role);
  const date = apaDate(d, false);
  let out = auth ? `${dot(esc(auth))} ${date} ` : `${dot(ital(esc(sentenceCase(d.title))))} ${date} `;
  if (auth) out += `${ital(esc(sentenceCase(d.title)))} [Film]. `;
  else out += `[Film]. `;
  if (has(d.productionCompanies || d.publisher)) out += `${esc(clean(d.productionCompanies || d.publisher))}.`;
  return noFinalPeriodAfterUrl(out);
}

function apaPodcast(d: CitationData): string {
  const role = clean(d.hostRole || 'Host');
  const auth = authorsWithRole(d.authors, role);
  const date = apaDate(d, true);
  const title = `${ital(esc(sentenceCase(d.title)))} [Audio podcast]`;
  let out = auth ? `${dot(esc(auth))} ${date} ` : `${dot(title)} ${date} `;
  if (auth) out += `${title}. `;
  if (has(d.publisher)) out += `${esc(clean(d.publisher))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaStreamingVideo(d: CitationData): string {
  const role = clean(d.hostRole || d.description || 'Director');
  const auth = authorsWithRole(d.authors, role);
  const date = apaDate(d, true);
  const title = `${ital(esc(sentenceCase(d.title)))} [Video]`;
  let out = auth ? `${dot(esc(auth))} ${date} ` : `${dot(title)} ${date} `;
  if (auth) out += `${title}. `;
  if (has(d.publisher || d.platform)) out += `${esc(clean(d.publisher || d.platform))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaTvSeries(d: CitationData): string {
  const role = clean(d.hostRole || (validPeople(d.authors).length > 1 ? 'Executive Producers' : 'Executive Producer'));
  const auth = authorsWithRole(d.authors, role);
  const years = clean(d.year) || 'n.d.';
  let out = auth ? `${dot(esc(auth))} (${esc(years)}). ` : `${dot(ital(esc(sentenceCase(d.title))))} (${esc(years)}). `;
  if (auth) out += `${ital(esc(sentenceCase(d.title)))} [TV series]. `;
  else out += `[TV series]. `;
  if (has(d.productionCompanies || d.publisher)) out += `${esc(clean(d.productionCompanies || d.publisher))}.`;
  return noFinalPeriodAfterUrl(out);
}

function apaTvEpisode(d: CitationData): string {
  const writers = authorsAPAFromText(d.writersText);
  const directors = authorsAPAFromText(d.directorsText);
  const creators: string[] = [];
  if (writers) creators.push(`${writers} (Writer${parsePeople(d.writersText).length > 1 ? 's' : ''})`);
  if (directors) creators.push(`${directors} (Director${parsePeople(d.directorsText).length > 1 ? 's' : ''})`);
  const date = apaDate(d, true);
  const titleDetails = [has(d.season) ? `Season ${clean(d.season)}` : '', has(d.episode) ? `Episode ${clean(d.episode)}` : '']
    .filter(Boolean)
    .join(', ');
  const epTitle = `${esc(sentenceCase(d.title))}${titleDetails ? ` (${esc(titleDetails)})` : ''} [TV series episode]`;
  let out = creators.length ? `${creators.join(', & ')}. ${date} ` : `${dot(epTitle)} ${date} `;
  if (creators.length) out += `${epTitle}. `;
  const producers = contributorsInitialsFirst([], d.producersText);
  if (producers || has(d.seriesTitle)) {
    out += `In ${producers ? `${esc(producers)} (Executive Producer${parsePeople(d.producersText).length > 1 ? 's' : ''}), ` : ''}${ital(esc(sentenceCase(d.seriesTitle)))}. `;
  }
  if (has(d.productionCompanies || d.publisher)) out += `${esc(clean(d.productionCompanies || d.publisher))}.`;
  return noFinalPeriodAfterUrl(out);
}

function apaImage(d: CitationData): string {
  const date = apaDate(d, true);
  const format = clean(d.description || d.format || 'Photograph');
  const title = `${ital(esc(sentenceCase(d.title)))} [${esc(format)}]`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.publisher || d.siteName)) out += `${esc(clean(d.publisher || d.siteName))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaCourseMaterial(d: CitationData, defaultFormat: string, includeFullDate = false): string {
  const date = apaDate(d, includeFullDate);
  const format = clean(d.format || defaultFormat);
  const title = `${ital(esc(sentenceCase(d.title)))} [${esc(format)}]`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.platform || d.publisher)) out += `${esc(clean(d.platform || d.publisher))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaThesis(d: CitationData): string {
  const date = apaDate(d, false);
  const type = clean(d.format || 'Doctoral dissertation');
  const institution = clean(d.institution);
  const bracket = institution ? `[${type}, ${institution}]` : `[${type}]`;
  const title = `${ital(esc(sentenceCase(d.title)))} ${esc(bracket)}`;
  const { lead, omitTitle } = authorOrTitleLead(d, date, title);
  let out = lead;
  if (!omitTitle) out += `${title}. `;
  if (has(d.repository)) out += `${esc(clean(d.repository))}. `;
  if (has(d.url)) out += clean(d.url);
  return noFinalPeriodAfterUrl(out);
}

function apaLegalAct(d: CitationData): string {
  const title = clean(d.title) || 'Title of Act';
  const year = clean(d.year);
  const jurisdiction = clean(d.jurisdiction);
  const section = clean(d.section);
  let out = `${ital(esc(title + (year && !title.includes(year) ? ` ${year}` : '')))}${jurisdiction ? ` (${esc(jurisdiction)})` : ''}`;
  if (section) out += ` s. ${esc(section)}`;
  out += '.';
  if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaLegalCase(d: CitationData): string {
  const title = clean(d.title) || 'Case title';
  const year = clean(d.year);
  let out = `${ital(esc(title))}${year ? ` (${esc(year)})` : ''}`;
  const legalParts = [clean(d.volumeLegal), clean(d.reporter), clean(d.startingPage)].filter(Boolean);
  if (legalParts.length) out += ` ${esc(legalParts.join(' '))}`;
  out += '.';
  if (has(d.url)) out += ` ${clean(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function apaPersonalCommunication(d: CitationData): string {
  const author = validPeople(d.authors)[0];
  const name = author
    ? `${initials(author.given)} ${clean(author.family)}`.trim()
    : 'Initial. Family';
  const md = [clean(d.month), clean(d.day)].filter(Boolean).join(' ');
  const date = md && clean(d.year) ? `${md}, ${clean(d.year)}` : (md || clean(d.year) || 'exact date needed');
  return `Personal communication is cited in-text only: (${esc(name)}, personal communication, ${esc(date)}). Do not include it in the reference list.`;
}

function apaAiChat(d: CitationData): string {
  const date = apaDate(d, true);
  const titleText = sentenceCase(d.title || 'Untitled AI output');
  const title = `${esc(titleText)} [Generative AI chat]`;
  const auth = authorsAPA(d.authors) || 'OpenAI';
  let out = `${dot(esc(auth))} ${date} ${title}. `;
  if (has(d.toolName || d.platform)) out += `${esc(clean(d.toolName || d.platform))}. `;
  if (has(d.url)) out += clean(d.url);
  else if (has(d.appendix)) out += `${esc(clean(d.appendix))}`;
  return noFinalPeriodAfterUrl(out);
}

const apaDispatch: Record<SourceType, (d: CitationData) => string> = {
  webpage: apaWebpage,
  'webpage-document': apaWebpageDocument,
  'wiki-entry': apaWikiEntry,
  'newspaper-online': apaNewspaperOnline,
  'newspaper-print': apaNewspaperPrint,
  journal: apaJournal,
  book: apaBook,
  'book-chapter': apaBookChapter,
  'translated-book': apaTranslatedBook,
  report: apaReport,
  'blog-post': apaBlogPost,
  'social-twitter': (d) => apaSocial(d, 'X', '', 'Post'),
  'social-facebook': (d) => apaSocial(d, 'Facebook', '', 'Status update'),
  'social-instagram': (d) => apaSocial(d, 'Instagram', clean(d.description || 'Photograph'), 'Post'),
  'social-tiktok': (d) => apaSocial(d, 'TikTok', clean(d.description || 'Video'), 'Post'),
  'youtube-video': apaYouTube,
  film: apaFilm,
  podcast: apaPodcast,
  'streaming-video': apaStreamingVideo,
  'tv-series': apaTvSeries,
  'tv-episode': apaTvEpisode,
  image: apaImage,
  'lecture-recording': (d) => apaCourseMaterial(d, 'Lecture recording', true),
  'powerpoint-slides': (d) => apaCourseMaterial(d, 'PowerPoint slides', false),
  'lab-manual': (d) => apaCourseMaterial(d, 'Practical manual', false),
  thesis: apaThesis,
  'legal-act': apaLegalAct,
  'legal-case': apaLegalCase,
  'personal-communication': apaPersonalCommunication,
  'ai-chat': apaAiChat,
};

/* ============================================================
 * APA 7th IN-TEXT GENERATORS
 * ============================================================ */

function apaInTextParenthetical(d: CitationData, source: SourceType): string {
  if (source === 'legal-act') {
    const title = ital(esc(clean(d.title) || 'Title of Act'));
    const jurisdiction = clean(d.jurisdiction) ? ` (${esc(clean(d.jurisdiction))})` : '';
    const section = clean(d.section) ? `, s. ${esc(clean(d.section))}` : '';
    return `(${title}${clean(d.year) ? ` ${esc(clean(d.year))}` : ''}${jurisdiction}${section})`;
  }
  if (source === 'legal-case') return `(${ital(esc(clean(d.title) || 'Case title'))}${clean(d.year) ? `, ${esc(clean(d.year))}` : ''})`;
  if (source === 'personal-communication') {
    const author = validPeople(d.authors)[0];
    const name = author ? `${initials(author.given)} ${clean(author.family)}`.trim() : 'Initial. Family';
    const md = [clean(d.month), clean(d.day)].filter(Boolean).join(' ');
  const date = md && clean(d.year) ? `${md}, ${clean(d.year)}` : (md || clean(d.year) || 'exact date needed');
    return `(${esc(name)}, personal communication, ${esc(date)})`;
  }

  const author = resolveInTextAuthor(d, false);
  const year = clean(d.year) || 'n.d.';
  return author ? `(${esc(author)}, ${esc(year)})` : `(${noAuthorInTextTitle(d, source)}, ${esc(year)})`;
}

function apaInTextNarrative(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return apaInTextParenthetical(d, source);
  const year = clean(d.year) || 'n.d.';
  const author = resolveInTextAuthor(d, true);
  if (author) return `${esc(author)} (${esc(year)})`;
  return `${noAuthorInTextTitle(d, source)} (${esc(year)})`;
}

function apaInTextQuote(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return apaInTextParenthetical(d, source);
  if (source === 'legal-act') return apaInTextParenthetical(d, source);
  if (source === 'legal-case') {
    const locator = quoteLocator(d, source);
    const locPart = locator ? `, ${locator}` : '';
    return `(${ital(esc(clean(d.title) || 'Case title'))}${clean(d.year) ? `, ${esc(clean(d.year))}` : ''}${locPart})`;
  }
  const author = resolveInTextAuthor(d, false);
  const year = clean(d.year) || 'n.d.';
  const locator = quoteLocator(d, source);
  const locPart = locator ? `, ${locator}` : '';
  return author
    ? `(${esc(author)}, ${esc(year)}${locPart})`
    : `(${noAuthorInTextTitle(d, source)}, ${esc(year)}${locPart})`;
}



export function generateApa7(source: SourceType, data: CitationData): CitationOutput {
  return {
    reference: apaDispatch[source](data),
    intextParaphrase: apaInTextParenthetical(data, source),
    intextQuote: apaInTextQuote(data, source),
    intextNarrative: apaInTextNarrative(data, source),
    notes: [],
  };
}

export const apa7Internals = {
  validPeople,
  has,
};
