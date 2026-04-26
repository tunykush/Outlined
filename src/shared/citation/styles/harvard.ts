/**
 * RMIT Harvard formatter.
 * Built against the uploaded RMIT Harvard Style Guide PDF.
 * It intentionally does not try to support generic Harvard variants.
 */

import type { Author, CitationData, CitationOutput, SourceType } from '../../types.js';

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
const endFullStop = (s: string): string => /[.!?]$/.test(stripHtml(s).trim()) ? s : `${s}.`;
const noFinalPeriodAfterUrl = (s: string): string => s.replace(/\s+\./g, '.').trim();
const joinNonEmpty = (parts: string[], sep = ', '): string => parts.filter((p) => has(stripHtml(p))).join(sep);

function initialsNoStops(given: string): string {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/\./g, '').split('-').filter(Boolean).map((p) => p[0]?.toUpperCase() || '').join(''))
    .join('');
}

function validPeople(authors: Author[] = []): Author[] {
  return authors.filter((a) => has(a.family) || has(a.given));
}

function personHarvard(a: Author): string {
  if (a.isOrganisation) return clean(a.family);
  const fam = clean(a.family);
  const ini = initialsNoStops(a.given);
  return ini ? `${fam} ${ini}` : fam;
}

function authorsHarvard(authors: Author[] = []): string {
  const list = validPeople(authors).map(personHarvard).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
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
      // Raw editor strings are accepted as either "Family Initial" or "Given Family".
      // Prefer Family Initial because that is the expected helper format in this app.
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

function dateYear(d: CitationData): string {
  return `(${yearOnly(d)})`;
}

function dateFull(d: CitationData): string {
  const year = yearOnly(d);
  const month = clean(d.month);
  const day = clean(d.day);
  if (day && month && year) return `(${day} ${month} ${year})`;
  if (month && year) return `(${month} ${year})`;
  return `(${year})`;
}

function accessPart(d: CitationData): string {
  return has(d.accessDate) ? `accessed ${esc(clean(d.accessDate))}` : 'accessed date needed';
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

function websiteName(d: CitationData): string {
  const raw = clean(d.siteName || d.publisher || d.platform);
  if (!raw) return '';
  if (/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(raw)) return raw;
  return /\bwebsite\b/i.test(raw) ? raw : `${raw} website`;
}

function refLead(d: CitationData, titleHtml: string, date = dateYear(d)): { lead: string; omittedTitle: boolean } {
  const author = authorsHarvard(d.authors);
  if (author) return { lead: `${esc(author)} ${date} `, omittedTitle: false };
  return { lead: `${titleHtml} ${date} `, omittedTitle: true };
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
  'ai-chat',
]);

function noAuthorText(d: CitationData, source: SourceType): string {
  if (source === 'journal') return clean(d.journal || d.title || 'Title');
  if (source === 'newspaper-online' || source === 'newspaper-print') return clean(d.publisher || d.siteName || d.title || 'Title');
  const snippet = esc(titleSnippet(d));
  return ITALIC_NO_AUTHOR_IN_TEXT.has(source) ? ital(snippet) : `'${snippet}'`;
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
  if (source === 'social-twitter' || source === 'social-facebook' || source === 'social-instagram' || source === 'social-tiktok') return '';
  return 'page/locator needed';
}

function harvardInTextParenthetical(d: CitationData, source: SourceType): string {
  if (source === 'legal-act') return `(${esc(clean(d.title) || 'Title of Act')} ${esc(yearOnly(d))}${has(d.section) ? ` s ${esc(clean(d.section))}` : ''})`;
  if (source === 'legal-case') return `(${ital(esc(clean(d.title) || 'Case title'))} ${esc(yearOnly(d))})`;
  if (source === 'personal-communication') return harvardPersonalCommunicationInText(d);
  const author = inTextAuthor(d.authors);
  return author ? `(${esc(author)} ${esc(yearOnly(d))})` : `(${noAuthorText(d, source)} ${esc(yearOnly(d))})`;
}

function harvardInTextNarrative(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return harvardPersonalCommunicationInText(d);
  const author = inTextAuthor(d.authors);
  return author ? `${esc(author)} (${esc(yearOnly(d))})` : `${noAuthorText(d, source)} (${esc(yearOnly(d))})`;
}

function harvardInTextQuote(d: CitationData, source: SourceType): string {
  if (source === 'personal-communication') return harvardPersonalCommunicationInText(d);
  const base = harvardInTextParenthetical(d, source).replace(/\)$/, '');
  const locator = quoteLocatorHarvard(d, source);
  return locator ? `${base}:${esc(locator)})` : `${base})`;
}

function harvardPersonalCommunicationInText(d: CitationData): string {
  const a = validPeople(d.authors)[0];
  const name = a ? `${initialsNoStops(a.given)} ${clean(a.family)}`.trim() : 'Initial Family';
  const day = clean(d.day);
  const month = clean(d.month);
  const year = clean(d.year);
  const date = [day, month, year].filter(Boolean).join(' ') || 'exact date needed';
  return `(${esc(name)} ${esc(date)}, personal communication)`;
}

/* -------------------- reference-list generators -------------------- */

function harvardWebpage(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled webpage'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [lead.trim()];
  if (!omittedTitle) parts.push(title);
  const site = websiteName(d);
  if (site) parts.push(esc(site));
  parts.push(accessPart(d));
  let out = joinNonEmpty(parts, ', ');
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardWebpageDocument(d: CitationData): string {
  return harvardWebpage(d);
}

function harvardWikiEntry(d: CitationData): string {
  // Fandom/wiki pages are handled as RMIT Harvard webpage-style online sources.
  return harvardWebpage(d);
}

function harvardNewsOnline(d: CitationData): string {
  const title = `'${esc(clean(d.title) || 'Untitled article')}'`;
  const author = authorsHarvard(d.authors);
  const pub = clean(d.publisher || d.siteName || 'Newspaper or magazine');
  let out = author
    ? `${esc(author)} ${dateYear(d)} ${title}, ${ital(esc(pub))}`
    : `${esc(pub)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`;
  if (has(d.pages)) out += `, ${esc(clean(d.pages))}`;
  out += `, ${accessPart(d)}`;
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardNewsPrint(d: CitationData): string {
  const title = `'${esc(clean(d.title) || 'Untitled article')}'`;
  const author = authorsHarvard(d.authors);
  const pub = clean(d.publisher || d.siteName || 'Newspaper or magazine');
  let out = author
    ? `${esc(author)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`
    : `${esc(pub)} ${dateFull(d)} ${title}, ${ital(esc(pub))}`;
  if (has(d.pages)) out += `, ${esc(clean(d.pages))}`;
  return endFullStop(out);
}

function harvardJournal(d: CitationData): string {
  const title = `'${esc(clean(d.title) || 'Untitled article')}'`;
  const author = authorsHarvard(d.authors);
  const journalName = clean(d.journal || 'Journal title');
  let out = author
    ? `${esc(author)} ${dateYear(d)} ${title}, ${ital(esc(journalName))}`
    : `${esc(journalName)} ${dateYear(d)} ${title}, ${ital(esc(journalName))}`;
  const vol = clean(d.volume);
  const issue = clean(d.issue);
  const locator = has(d.pages) ? clean(d.pages) : has(d.articleNumber) ? `Article ${clean(d.articleNumber)}` : '';
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
  const parts: string[] = [lead.trim()];
  if (!omittedTitle) parts.push(title);
  const edition = edn(d.edition);
  if (edition) parts.push(esc(edition));
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else parts.push(esc(clean(d.place || 'n.p.')));
  return endFullStop(joinNonEmpty(parts));
}

function harvardTranslatedBook(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled book'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [lead.trim()];
  if (!omittedTitle) parts.push(title);
  if (has(d.translatorsText)) parts.push(`translated by ${esc(clean(d.translatorsText))}`);
  const edition = edn(d.edition);
  if (edition) parts.push(esc(edition));
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else parts.push(esc(clean(d.place || 'n.p.')));
  if (has(d.originalYear)) parts.push(`original work published ${esc(clean(d.originalYear))}`);
  return endFullStop(joinNonEmpty(parts));
}

function harvardBookChapter(d: CitationData): string {
  const author = authorsHarvard(d.authors);
  const chapterTitle = `'${esc(clean(d.title) || 'Untitled chapter')}'`;
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
  if (has(d.publisher)) parts.push(esc(clean(d.publisher)));
  if (has(d.doi)) parts.push(doiHarvard(d.doi));
  else parts.push(esc(clean(d.place || 'n.p.')));
  return endFullStop(joinNonEmpty(parts));
}

function harvardReport(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled report'));
  const { lead, omittedTitle } = refLead(d, title);
  const parts: string[] = [lead.trim()];
  if (!omittedTitle) parts.push(title);
  if (has(d.reportNumber)) parts.push(esc(clean(d.reportNumber)));
  const pub = clean(d.publisher || d.siteName);
  if (pub) parts.push(esc(pub));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return `${joinNonEmpty(parts)}. ${clean(d.url)}`;
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardBlogPost(d: CitationData): string {
  const author = authorsHarvard(d.authors);
  const blog = clean(d.siteName || d.publisher || 'Blog');
  const title = `'${esc(clean(d.title) || 'Untitled post')}'`;
  let out = author
    ? `${esc(author)} ${dateFull(d)} ${title}, ${ital(esc(blog))}`
    : `${esc(blog)} ${dateFull(d)} ${title}, ${ital(esc(blog))}`;
  if (has(d.url)) out += `, ${accessPart(d)}. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function firstWords(text: string, n: number): string {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.join(' ');
  return `${words.slice(0, n).join(' ')}...`;
}

function harvardSocial(d: CitationData, defaultPostType: string): string {
  const author = authorsHarvard(d.authors) || clean(d.siteName || d.publisher || 'Page name');
  const title = firstWords(d.title || 'Untitled post', 10);
  const type = clean(d.postType || defaultPostType);
  const page = clean(d.siteName || d.publisher || author);
  let out = `${esc(author)} ${dateFull(d)} '${esc(title)}' [${esc(type)}], ${esc(page)}, ${accessPart(d)}`;
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardYouTube(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.siteName || d.publisher || 'Channel name');
  const title = ital(esc(clean(d.title) || 'Untitled video'));
  let out = `${esc(author)} ${dateFull(d)} ${title} [video], ${esc(clean(d.platform || 'YouTube'))}, ${accessPart(d)}`;
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardFilm(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled film'));
  const role = clean(d.hostRole || 'director').toLowerCase();
  const creator = authorsHarvard(d.authors);
  const companies = clean(d.productionCompanies || d.publisher);
  const parts = [creator ? `${esc(creator)} (${esc(role)}) ${dateYear(d)} ${title} [motion picture]` : `${title} ${dateYear(d)} [motion picture]`];
  if (companies) parts.push(esc(companies));
  if (has(d.place)) parts.push(esc(clean(d.place)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardPodcast(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.publisher || d.siteName || 'Host');
  const title = ital(esc(clean(d.title) || 'Untitled podcast'));
  let out = `${esc(author)} ${dateFull(d)} ${title} [podcast], ${esc(clean(d.publisher || d.platform || 'Podcast'))}`;
  if (has(d.url)) out += `, ${accessPart(d)}. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardStreamingVideo(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.publisher || d.siteName || 'Creator');
  const title = ital(esc(clean(d.title) || 'Untitled video'));
  let out = `${esc(author)} ${dateFull(d)} ${title} [video], ${esc(clean(d.publisher || d.platform || 'Publisher'))}`;
  if (has(d.url)) out += `, ${accessPart(d)}. ${clean(d.url)}`;
  else out += '.';
  return noFinalPeriodAfterUrl(out);
}

function harvardTvSeries(d: CitationData): string {
  return harvardFilm({ ...d, title: d.title || d.seriesTitle, format: 'television program' });
}

function harvardTvEpisode(d: CitationData): string {
  const title = `'${esc(clean(d.title) || 'Untitled episode')}'`;
  const series = ital(esc(clean(d.seriesTitle) || 'Series title'));
  const creator = peopleTextHarvard([], d.writersText || d.directorsText || d.producersText);
  const lead = creator ? `${esc(creator)} ${dateFull(d)} ` : `${title} ${dateFull(d)} `;
  const details = [has(d.season) ? `season ${clean(d.season)}` : '', has(d.episode) ? `episode ${clean(d.episode)}` : ''].filter(Boolean).join(', ');
  const parts = [`${lead}${creator ? title : ''}`.trim(), `${series} [television program${details ? `, ${esc(details)}` : ''}]`];
  if (has(d.productionCompanies || d.publisher)) parts.push(esc(clean(d.productionCompanies || d.publisher)));
  return endFullStop(joinNonEmpty(parts));
}

function harvardImage(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled image'));
  const { lead, omittedTitle } = refLead(d, title, dateFull(d));
  const parts = [lead.trim()];
  if (!omittedTitle) parts.push(`${title} [${esc(clean(d.description || d.format || 'image'))}]`);
  if (has(d.publisher || d.siteName)) parts.push(esc(clean(d.publisher || d.siteName)));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return `${joinNonEmpty(parts)}. ${clean(d.url)}`;
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardCourseMaterial(d: CitationData, defaultFormat: string): string {
  const author = authorsHarvard(d.authors) || 'RMIT Creds';
  const title = `'${esc(clean(d.title) || 'Untitled course material')}'`;
  const format = clean(d.format || defaultFormat);
  const institution = clean(d.institution || d.publisher || 'RMIT University');
  const parts = [`${esc(author)} ${dateYear(d)} ${title} [${esc(format)}]`, esc(institution)];
  if (has(d.place)) parts.push(esc(clean(d.place)));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return `${joinNonEmpty(parts)}. ${clean(d.url)}`;
  }
  return endFullStop(joinNonEmpty(parts));
}

function harvardThesis(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Untitled thesis'));
  const type = clean(d.format || 'PhD dissertation');
  const author = authorsHarvard(d.authors) || 'Author needed';
  const parts = [`${esc(author)} ${dateYear(d)} ${title} [${esc(type)}]`];
  if (has(d.institution)) parts.push(esc(clean(d.institution)));
  if (has(d.url)) {
    parts.push(accessPart(d));
    return `${joinNonEmpty(parts)}. ${clean(d.url)}`;
  }
  if (has(d.repository)) parts.push(`${esc(clean(d.repository))} database`);
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
  return `Personal communication is cited in-text only: ${harvardPersonalCommunicationInText(d)}. Do not include it in the reference list.`;
}

function harvardAiChat(d: CitationData): string {
  const author = authorsHarvard(d.authors) || clean(d.publisher || 'OpenAI');
  const title = ital(esc(clean(d.title || d.toolName || 'Untitled chat')));
  const tool = clean(d.toolName || d.platform || 'AI tool');
  let out = `${esc(author)} ${dateYear(d)} ${title} [${esc(clean(d.format || 'Large language model'))}], ${accessPart(d)}`;
  if (has(d.url)) out += `. ${clean(d.url)}`;
  else out += `. ${esc(tool)}`;
  if (has(d.appendix)) out += `. ${esc(clean(d.appendix))}`;
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
  'lecture-recording': (d) => harvardCourseMaterial(d, 'lecture notes'),
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
