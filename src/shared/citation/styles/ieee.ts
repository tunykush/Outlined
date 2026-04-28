/**
 * IEEE formatter.
 * Built against the uploaded RMIT IEEE Style Guide PDF.
 * This module is intentionally separate from APA 7th and RMIT Harvard.
 */

import type { Author, CitationData, CitationOutput, SourceType } from '../../types.js';

const REF_NO = '1';
const REF = `[${REF_NO}]`;

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
const joinNonEmpty = (parts: string[], sep = ', '): string => parts.filter((p) => has(stripHtml(p))).join(sep);
const endFullStop = (s: string): string => /[.!?]$/.test(stripHtml(s).trim()) ? s.trim() : `${s.trim()}.`;
const noFinalPeriodAfterUrl = (s: string): string => s.trim().replace(/(https?:\/\/\S+)\.$/i, '$1');

const MONTH_ABBR: Record<string, string> = {
  january: 'Jan.',
  jan: 'Jan.',
  february: 'Feb.',
  feb: 'Feb.',
  march: 'Mar.',
  mar: 'Mar.',
  april: 'Apr.',
  apr: 'Apr.',
  may: 'May',
  june: 'Jun.',
  jun: 'Jun.',
  july: 'July',
  jul: 'July',
  august: 'Aug.',
  aug: 'Aug.',
  september: 'Sept.',
  sep: 'Sept.',
  sept: 'Sept.',
  october: 'Oct.',
  oct: 'Oct.',
  november: 'Nov.',
  nov: 'Nov.',
  december: 'Dec.',
  dec: 'Dec.',
};

function validPeople(authors: Author[] = []): Author[] {
  return authors.filter((a) => has(a.family) || has(a.given));
}

function initials(given: string): string {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part
      .replace(/\./g, '')
      .split('-')
      .filter(Boolean)
      .map((piece) => `${piece[0]?.toUpperCase() || ''}.`)
      .join('-'))
    .join(' ');
}

function personIEEE(a: Author): string {
  if (a.isOrganisation) return esc(clean(a.family || a.given));
  const fam = clean(a.family);
  const ini = initials(a.given);
  return esc(clean(`${ini} ${fam}`));
}

function authorsIEEE(authors: Author[] = []): string {
  const list = validPeople(authors).map(personIEEE).filter(Boolean);
  if (!list.length) return '';
  if (list.length > 6) return `${list[0]} <i>et al.</i>`;
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function parsePerson(raw: string): Author {
  const s = clean(raw);
  if (!s) return { family: '', given: '' };
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
  return clean(raw)
    .split(/\s*(?:;|\||\n)\s*/)
    .map(parsePerson)
    .filter((a) => has(a.family) || has(a.given));
}

function editorsIEEE(raw: string): string {
  const list = parsePeople(raw);
  if (!list.length) return '';
  const names = authorsIEEE(list);
  return `${names}, ${list.length === 1 ? 'Ed.' : 'Eds.'}`;
}

function inTextAuthor(authors: Author[] = []): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  const fam = (a: Author): string => esc(clean(a.family || a.given));
  if (list.length === 1) return fam(list[0]);
  if (list.length === 2) return `${fam(list[0])} and ${fam(list[1])}`;
  return `${fam(list[0])} <i>et al.</i>`;
}

function monthAbbr(month: string): string {
  const raw = clean(month).replace(/\.$/, '');
  if (!raw) return '';
  if (raw.includes('/') || raw.includes('-') || raw.includes('\u2013')) {
    return raw
      .split(/([/\u2013-])/)
      .map((part) => /^[A-Za-z]+$/.test(part) ? monthAbbr(part) : part)
      .join('');
  }
  return MONTH_ABBR[raw.toLowerCase()] || raw;
}

function normalDay(day: string): string {
  const d = clean(day).replace(/(st|nd|rd|th)$/i, '');
  return /^\d+$/.test(d) ? String(Number(d)) : d;
}

function ieeeDate(d: CitationData, fallback = 'year needed'): string {
  const y = clean(d.year);
  const m = monthAbbr(d.month);
  const day = normalDay(d.day);
  if (m && day && y) return `${m} ${day}, ${y}`;
  if (m && y) return `${m} ${y}`;
  return y || fallback;
}

function ieeeAccessDate(d: CitationData): string {
  const raw = clean(d.accessDate);
  if (raw) {
    const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) return `${monthAbbr(m[2])} ${normalDay(m[1])}, ${m[3]}`;
    const m2 = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m2) return `${monthAbbr(m2[1])} ${normalDay(m2[2])}, ${m2[3]}`;
    return raw;
  }
  return 'date needed';
}

function publicationPlace(d: CitationData): string {
  return clean(d.place || d.institution);
}

function publisherName(d: CitationData): string {
  return clean(d.publisher || d.siteName || d.platform || d.institution);
}

function titleText(d: CitationData, fallback = 'Title needed'): string {
  return clean(d.title) || fallback;
}

function quotedTitleWith(d: CitationData, punctuation: '.' | ',', fallback = 'Title needed'): string {
  const title = titleText(d, fallback).replace(/[.,]\s*$/, '');
  return `"${esc(title)}${punctuation}"`;
}

function doi(rawDoi: string): string {
  const raw = clean(rawDoi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return raw ? `doi: ${esc(raw)}` : '';
}

function onlineAvailable(url: string): string {
  return has(url) ? `[Online]. Available: ${esc(clean(url))}` : '[Online]. Available: URL needed';
}

function ref(s: string): string {
  return `${REF} ${s}`;
}

function appendOnline(out: string, url: string): string {
  return noFinalPeriodAfterUrl(`${endFullStop(out)} ${onlineAvailable(url)}`);
}

function editionText(edition: string): string {
  const e = clean(edition);
  if (!e || /^1(st)?(?:\s+ed\.?)?$/i.test(e)) return '';
  if (/ed\.?$/i.test(e)) return e.replace(/ed\.?$/i, 'ed');
  if (/\d+(st|nd|rd|th)$/i.test(e)) return `${e} ed`;
  return `${e} ed`;
}

function pagesText(pages: string): string {
  const p = clean(pages);
  if (!p) return '';
  return p.includes('-') || p.includes('\u2013') ? `pp. ${p}` : `p. ${p}`;
}

function articleLocator(d: CitationData): string {
  if (has(d.pages)) return pagesText(d.pages);
  if (has(d.articleNumber)) return `Article ${esc(clean(d.articleNumber).replace(/^Article\s+/i, ''))}`;
  return '';
}

function bookLike(d: CitationData, translated = false): string {
  const author = authorsIEEE(d.authors) || publisherName(d) || 'Author needed';
  const title = ital(esc(titleText(d)));
  const ed = editionText(d.edition);
  const place = publicationPlace(d);
  const publisher = publisherName(d) || 'Publisher needed';
  const year = clean(d.year) || 'year needed';
  const translatedNote = translated && has(d.translatorsText) ? ` (${esc(clean(d.translatorsText))})` : '';
  const placePublisher = place ? `${esc(place)}: ${esc(publisher)}${translatedNote}` : `${esc(publisher)}${translatedNote}`;
  let out = ref(`${author}, ${title}${ed ? `, ${esc(ed)}` : ''}. ${placePublisher}, ${esc(year)}.`);
  if (has(d.doi)) out = ref(`${author}, ${title}${ed ? `, ${esc(ed)}` : ''}. ${placePublisher}, ${esc(year)}. [Online]. Available: https://doi.org/${esc(clean(d.doi))}`);
  else if (has(d.url)) out = appendOnline(out, d.url);
  return out;
}

function ieeeBook(d: CitationData): string {
  return bookLike(d, false);
}

function ieeeTranslatedBook(d: CitationData): string {
  return bookLike(d, true);
}

function ieeeBookChapter(d: CitationData): string {
  const author = authorsIEEE(d.authors) || 'Author needed';
  const bookTitle = clean(d.bookTitle) || 'Book title needed';
  const editor = editorsIEEE(d.editorsText);
  const ed = editionText(d.edition);
  const place = publicationPlace(d);
  const publisher = publisherName(d) || 'Publisher needed';
  const year = clean(d.year) || 'year needed';
  const loc = pagesText(d.pages);
  const inParts = [
    `in ${ital(esc(bookTitle))}`,
    editor ? esc(stripHtml(editor)) : '',
    ed ? esc(ed) : '',
  ];
  const placePublisher = place ? `${esc(place)}: ${esc(publisher)}` : esc(publisher);
  let out = ref(`${author}, ${quotedTitleWith(d, ',', 'Chapter title needed')} ${joinNonEmpty(inParts)}. ${placePublisher}, ${esc(year)}${loc ? `, ${esc(loc)}` : ''}.`);
  if (has(d.doi)) out = `${out.replace(/\.$/, '')}, ${doi(d.doi)}.`;
  else if (has(d.url)) out = appendOnline(out, d.url);
  return out;
}

function ieeeJournal(d: CitationData): string {
  const author = authorsIEEE(d.authors) || 'Author needed';
  const journal = clean(d.journal) || 'Journal title needed';
  const parts = [
    has(d.volume) ? `vol. ${esc(clean(d.volume))}` : '',
    has(d.issue) ? `no. ${esc(clean(d.issue))}` : '',
    esc(articleLocator(d)),
  ];
  const date = ieeeDate(d, '');
  let out = ref(`${author}, ${quotedTitleWith(d, ',', 'Article title needed')} ${ital(esc(journal))}${joinNonEmpty(parts) ? `, ${joinNonEmpty(parts)}` : ''}${date ? `, ${esc(date)}` : ''}`);
  if (has(d.doi)) return `${out}, ${doi(d.doi)}.`;
  out = endFullStop(out);
  if (has(d.url)) return appendOnline(out, d.url);
  return out;
}

function ieeeReport(d: CitationData): string {
  const company = publisherName(d) || 'Company needed';
  const author = authorsIEEE(d.authors) || company;
  const place = publicationPlace(d);
  const reportNo = has(d.reportNumber) ? esc(clean(d.reportNumber)) : '';
  const date = ieeeDate(d);
  const middle = joinNonEmpty([esc(company), place ? esc(place) : '', reportNo]);
  let out = ref(`${author}, ${quotedTitleWith(d, ',', 'Report title needed')} ${middle}, ${esc(date)}.`);
  if (has(d.url)) {
    out = `${out.replace(/\.$/, '')}. Accessed: ${esc(ieeeAccessDate(d))}. ${onlineAvailable(d.url)}`;
    return noFinalPeriodAfterUrl(out);
  }
  return out;
}

function ieeeWebpage(d: CitationData): string {
  const site = clean(d.siteName || d.publisher || d.platform || d.institution) || 'Website title needed';
  const author = authorsIEEE(d.authors) || site;
  const out = ref(`${author}. ${quotedTitleWith(d, '.', 'Webpage title needed')} ${esc(site)}. Accessed: ${esc(ieeeAccessDate(d))}. ${onlineAvailable(d.url)}`);
  return noFinalPeriodAfterUrl(out);
}

function ieeeNewspaperOnline(d: CitationData): string {
  return ieeeWebpage(d);
}

function ieeeNewspaperPrint(d: CitationData): string {
  const author = authorsIEEE(d.authors) || 'Author needed';
  const paper = publisherName(d) || 'Newspaper title needed';
  const date = ieeeDate(d);
  const loc = pagesText(d.pages);
  return ref(`${author}, ${quotedTitleWith(d, ',', 'Article title needed')} ${ital(esc(paper))}, ${esc(date)}${loc ? `, ${esc(loc)}` : ''}.`);
}

function ieeeBlogPost(d: CitationData): string {
  const author = authorsIEEE(d.authors) || publisherName(d) || 'Author needed';
  const title = esc(titleText(d, 'Blog title needed'));
  const date = ieeeDate(d, 'date needed');
  const out = ref(`${author}, ${title}. (${esc(date)}). Accessed: ${esc(ieeeAccessDate(d))}. [Blog]. Available: ${esc(clean(d.url) || 'URL needed')}`);
  return noFinalPeriodAfterUrl(out);
}

function videoOwner(d: CitationData): string {
  return authorsIEEE(d.authors) || clean(d.username) || publisherName(d) || 'Creator needed';
}

function ieeeOnlineVideo(d: CitationData): string {
  const owner = videoOwner(d);
  const date = ieeeDate(d, 'date needed');
  const out = ref(`${owner}. ${esc(titleText(d, 'Video title needed'))}. (${esc(date)}). Accessed: ${esc(ieeeAccessDate(d))}. [Online Video]. Available: ${esc(clean(d.url) || 'URL needed')}`);
  return noFinalPeriodAfterUrl(out);
}

function ieeePodcast(d: CitationData): string {
  const owner = videoOwner(d);
  const date = ieeeDate(d, 'date needed');
  const title = titleText(d, 'Podcast title needed');
  const series = has(d.seriesTitle) ? `${esc(clean(d.seriesTitle))}: ` : '';
  const out = ref(`${owner}. ${series}${esc(title)}. (${esc(date)}). Accessed: ${esc(ieeeAccessDate(d))}. [Podcast]. Available: ${esc(clean(d.url) || 'URL needed')}`);
  return noFinalPeriodAfterUrl(out);
}

function ieeeImage(d: CitationData): string {
  const author = authorsIEEE(d.authors) || publisherName(d) || 'Author needed';
  const date = ieeeDate(d, clean(d.year) ? clean(d.year) : 'date needed');
  const publisher = publisherName(d);
  const medium = clean(d.description || 'Online image');
  let out = ref(`${author}, ${esc(date)}, ${quotedTitleWith(d, ',', 'Image title needed')}${publisher ? ` ${esc(publisher)}` : ''}. [${esc(medium)}].`);
  if (has(d.doi)) return `${out.replace(/\.$/, '')}, ${doi(d.doi)}.`;
  if (has(d.url)) out = `${out.replace(/\.$/, '')}. ${onlineAvailable(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function ieeeCourseMaterial(d: CitationData, fallbackMedium: string): string {
  const author = authorsIEEE(d.authors) || publisherName(d) || 'Author needed';
  const platform = publisherName(d) || 'Platform needed';
  const medium = clean(d.format || fallbackMedium);
  const date = ieeeDate(d, 'date needed');
  let out = ref(`${author}. ${esc(titleText(d))}. (${esc(date)}). ${esc(platform)}. Accessed: ${esc(ieeeAccessDate(d))}. [${esc(medium)}].`);
  if (has(d.url)) out = `${out.replace(/\.$/, '')}. ${onlineAvailable(d.url)}`;
  return noFinalPeriodAfterUrl(out);
}

function ieeeFilm(d: CitationData): string {
  const creator = authorsIEEE(d.authors) || clean(d.directorsText) || clean(d.producersText) || publisherName(d) || 'Creator needed';
  const company = clean(d.productionCompanies || d.publisher);
  const year = clean(d.year) || 'year needed';
  const medium = clean(d.description || 'Film');
  return ref(`${esc(creator)}. ${ital(esc(titleText(d, 'Film title needed')))}. ${company ? `${esc(company)}, ` : ''}${esc(year)}. [${esc(medium)}].`);
}

function ieeeTvSeries(d: CitationData): string {
  const creator = authorsIEEE(d.authors) || clean(d.producersText) || clean(d.productionCompanies) || 'Creator needed';
  const company = clean(d.productionCompanies || d.publisher);
  const year = clean(d.year) || 'year needed';
  return ref(`${esc(creator)}. ${ital(esc(titleText(d, 'Series title needed')))}. ${company ? `${esc(company)}, ` : ''}${esc(year)}. [TV series].`);
}

function ieeeTvEpisode(d: CitationData): string {
  const writer = clean(d.writersText);
  const director = clean(d.directorsText);
  const creator = authorsIEEE(d.authors) || writer || director || clean(d.producersText) || 'Creator needed';
  const series = clean(d.seriesTitle) || 'Series title needed';
  const episodeBits = joinNonEmpty([
    has(d.season) ? `season ${esc(clean(d.season))}` : '',
    has(d.episode) ? `episode ${esc(clean(d.episode))}` : '',
  ]);
  const date = ieeeDate(d);
  return ref(`${esc(creator)}, ${quotedTitleWith(d, ',', 'Episode title needed')} ${ital(esc(series))}${episodeBits ? `, ${episodeBits}` : ''}, ${esc(date)}. [TV episode].`);
}

function ieeeThesis(d: CitationData): string {
  const author = authorsIEEE(d.authors) || 'Author needed';
  const thesisType = clean(d.format || 'Ph.D. dissertation');
  const institution = clean(d.institution || d.publisher) || 'University needed';
  const place = publicationPlace(d);
  const year = clean(d.year) || 'year needed';
  let out = ref(`${author}, ${quotedTitleWith(d, ',', 'Thesis title needed')} ${esc(thesisType)}, ${esc(institution)}${place ? `, ${esc(place)}` : ''}, ${esc(year)}.`);
  if (has(d.url)) out = appendOnline(out, d.url);
  return out;
}

function ieeeLegalAct(d: CitationData): string {
  const jurisdiction = has(d.jurisdiction) ? `, ${esc(clean(d.jurisdiction))}` : '';
  const section = has(d.section) ? `, sec. ${esc(clean(d.section))}` : '';
  return ref(`${ital(esc(titleText(d, 'Act title needed')))}${jurisdiction}${section}${has(d.year) ? `, ${esc(clean(d.year))}` : ''}.`);
}

function ieeeLegalCase(d: CitationData): string {
  const reporter = joinNonEmpty([
    has(d.volumeLegal) ? esc(clean(d.volumeLegal)) : '',
    has(d.reporter) ? esc(clean(d.reporter)) : '',
    has(d.startingPage) ? esc(clean(d.startingPage)) : '',
  ], ' ');
  const url = has(d.url) ? ` ${onlineAvailable(d.url)}` : '';
  return noFinalPeriodAfterUrl(ref(`${ital(esc(titleText(d, 'Case title needed')))}${reporter ? `, ${reporter}` : ''}${has(d.year) ? ` (${esc(clean(d.year))})` : ''}.${url}`));
}

function ieeePersonalCommunication(d: CitationData): string {
  const author = authorsIEEE(d.authors) || 'Author needed';
  const date = [monthAbbr(d.month), clean(d.year)].filter(Boolean).join(' ') || ieeeDate(d, 'date needed');
  return ref(`${author}, private communication, ${esc(date)}.`);
}

function ieeeAiChat(d: CitationData): string {
  const tool = clean(d.toolName || d.title || 'AI tool');
  const publisher = publisherName(d) || authorsIEEE(d.authors) || 'Publisher needed';
  const year = clean(d.year) || 'year needed';
  const appendix = clean(d.appendix);
  const available = has(d.url)
    ? `Available: ${esc(clean(d.url))}`
    : `Available: ${esc(appendix || 'tool URL needed')}`;
  const out = ref(`${esc(tool)} (${esc(year)}), ${esc(publisher)}. Accessed: ${esc(ieeeAccessDate(d))}. [Online]. ${available}`);
  return noFinalPeriodAfterUrl(out);
}

const unsupportedGuideSources = new Set<SourceType>([
  'newspaper-online',
  'newspaper-print',
  'social-twitter',
  'social-facebook',
  'social-instagram',
  'social-tiktok',
  'film',
  'streaming-video',
  'tv-series',
  'tv-episode',
  'image',
  'lecture-recording',
  'powerpoint-slides',
  'lab-manual',
  'legal-act',
  'legal-case',
]);

const ieeeDispatch: Record<SourceType, (d: CitationData) => string> = {
  webpage: ieeeWebpage,
  'webpage-document': ieeeReport,
  'wiki-entry': ieeeWebpage,
  'newspaper-online': ieeeNewspaperOnline,
  'newspaper-print': ieeeNewspaperPrint,
  journal: ieeeJournal,
  book: ieeeBook,
  'book-chapter': ieeeBookChapter,
  'translated-book': ieeeTranslatedBook,
  report: ieeeReport,
  'blog-post': ieeeBlogPost,
  'social-twitter': ieeeWebpage,
  'social-facebook': ieeeWebpage,
  'social-instagram': ieeeWebpage,
  'social-tiktok': ieeeWebpage,
  'youtube-video': ieeeOnlineVideo,
  film: ieeeFilm,
  podcast: ieeePodcast,
  'streaming-video': ieeeOnlineVideo,
  'tv-series': ieeeTvSeries,
  'tv-episode': ieeeTvEpisode,
  image: ieeeImage,
  'lecture-recording': ieeeOnlineVideo,
  'powerpoint-slides': (d) => ieeeCourseMaterial(d, 'PowerPoint slides'),
  'lab-manual': (d) => ieeeCourseMaterial(d, 'Practical manual'),
  thesis: ieeeThesis,
  'legal-act': ieeeLegalAct,
  'legal-case': ieeeLegalCase,
  'personal-communication': ieeePersonalCommunication,
  'ai-chat': ieeeAiChat,
};

function quoteLocatorIEEE(d: CitationData, source: SourceType): string {
  if (has(d.quotePage)) return `, p. ${esc(clean(d.quotePage))}`;
  if (has(d.quotePages)) return `, pp. ${esc(clean(d.quotePages))}`;
  const section = clean(d.quoteSection);
  const para = clean(d.quoteParagraph);
  if (section && para) return `, ${esc(section)} section, para. ${esc(para)}`;
  if (section) return `, ${esc(section)} section`;
  if (para) return `, para. ${esc(para)}`;
  if (has(d.timestamp) && !['youtube-video', 'streaming-video', 'podcast'].includes(source)) {
    return `, ${esc(clean(d.timestamp))}`;
  }
  return '';
}

function ieeeInTextParenthetical(): string {
  return REF;
}

function ieeeInTextNarrative(d: CitationData): string {
  const author = inTextAuthor(d.authors);
  return author ? `${author} ${REF}` : REF;
}

function ieeeInTextQuote(d: CitationData, source: SourceType): string {
  return `[${REF_NO}${quoteLocatorIEEE(d, source)}]`;
}

export function generateIeee(source: SourceType, data: CitationData): CitationOutput {
  const notes: string[] = [
    'IEEE uses numbered citations in order of first appearance. Treat [1] as a placeholder and renumber the final reference list.',
  ];
  if (source === 'journal') {
    notes.push('IEEE asks for abbreviated journal titles where available; use the accepted abbreviation if your guide or database provides one.');
  }
  if (unsupportedGuideSources.has(source)) {
    notes.push('The uploaded IEEE guide does not provide a dedicated template for this exact source type; this entry uses the closest IEEE template available in the guide.');
  }

  return {
    reference: ieeeDispatch[source](data),
    intextParaphrase: ieeeInTextParenthetical(),
    intextQuote: ieeeInTextQuote(data, source),
    intextNarrative: ieeeInTextNarrative(data),
    notes,
  };
}

export const ieeeInternals = {
  validPeople,
  has,
};
