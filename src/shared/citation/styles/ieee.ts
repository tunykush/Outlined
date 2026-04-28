/**
 * IEEE citation engine implementing the RMIT Easy Cite IEEE Style Guide.
 * IEEE uses numbered references [N] ordered by first appearance in the document.
 * Since a citation engine cannot track document-level numbering, reference numbers
 * are shown as [1] placeholders — the user must renumber sequentially in their document.
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

function endsWithStop(s: string): boolean {
  return /[.!?]$/.test(stripHtml(s).trim());
}

/* ============================================================
 * IEEE MONTH ABBREVIATIONS
 * Jan., Feb., Mar., Apr., May, Jun., July, Aug., Sept., Oct., Nov., Dec.
 * ============================================================ */

const IEEE_MONTH_MAP: Record<string, string> = {
  january: 'Jan.', february: 'Feb.', march: 'Mar.',
  april: 'Apr.', may: 'May', june: 'Jun.',
  july: 'July', august: 'Aug.', september: 'Sept.',
  october: 'Oct.', november: 'Nov.', december: 'Dec.',
  jan: 'Jan.', feb: 'Feb.', mar: 'Mar.', apr: 'Apr.',
  jun: 'Jun.', jul: 'July', aug: 'Aug.',
  sep: 'Sept.', sept: 'Sept.', oct: 'Oct.', nov: 'Nov.', dec: 'Dec.',
  '1': 'Jan.', '2': 'Feb.', '3': 'Mar.', '4': 'Apr.',
  '5': 'May', '6': 'Jun.', '7': 'July', '8': 'Aug.',
  '9': 'Sept.', '10': 'Oct.', '11': 'Nov.', '12': 'Dec.',
  '01': 'Jan.', '02': 'Feb.', '03': 'Mar.', '04': 'Apr.',
  '05': 'May', '06': 'Jun.', '07': 'July', '08': 'Aug.',
  '09': 'Sept.',
};

function abbrevMonth(month: string): string {
  if (!has(month)) return '';
  const m = clean(month).replace(/\.$/, '');
  return IEEE_MONTH_MAP[m.toLowerCase()] || m;
}

/* ============================================================
 * DATE HELPERS
 * ============================================================ */

function parseLooseDate(raw: string): { day: string; month: string; year: string } {
  const s = clean(raw).replace(/,/g, '');
  if (!s) return { day: '', month: '', year: '' };

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return { day: m[3], month: m[2], year: m[1] };

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return { day: m[1], month: m[2], year: m[3] };

  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (m) return { day: m[1], month: m[2], year: m[3] };

  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/i);
  if (m) return { day: m[2], month: m[1], year: m[3] };

  m = s.match(/^(\d{4})$/);
  if (m) return { day: '', month: '', year: m[1] };

  return { day: '', month: '', year: '' };
}

// Format as "Mon. Day, Year" — used for accessed dates and published dates of online sources
function ieeeFullDate(month: string, day: string, year: string): string {
  const mo = abbrevMonth(month);
  const dy = clean(day).replace(/(st|nd|rd|th)$/i, '');
  const yr = clean(year);
  if (mo && dy && yr) return `${mo} ${dy}, ${yr}`;
  if (mo && yr) return `${mo} ${yr}`;
  if (yr) return yr;
  return 'date needed';
}

// Format as "Mon. Year" — used for personal communications
function ieeeMonthYear(month: string, year: string): string {
  const mo = abbrevMonth(month);
  const yr = clean(year);
  if (mo && yr) return `${mo} ${yr}`;
  return yr || 'date needed';
}

function ieeePublishedDate(d: CitationData): string {
  return ieeeFullDate(d.month, d.day, d.year);
}

function ieeeAccessDate(d: CitationData): string {
  const raw = clean(d.accessDate);
  if (!raw) return 'date needed';
  const parsed = parseLooseDate(raw);
  if (parsed.year) return ieeeFullDate(parsed.month, parsed.day, parsed.year);
  return raw;
}

/* ============================================================
 * AUTHOR FORMATTING (IEEE)
 * Format: "A. B. Family" — initials (with dots) before family name.
 *
 *  1 author:  A. Author
 *  2 authors: A. Author1 and B. Author2
 *  3–6:       A. A1, B. A2, ..., Y. An-1, and Z. An
 *  7+:        A. First et al.
 * ============================================================ */

function validPeople(authors: Author[] = []): Author[] {
  return authors.filter((a) => has(a.family) || has(a.given));
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
      const family = parts.pop() || '';
      return { family, given: parts.join(' ') };
    })
    .filter((a) => has(a.family) || has(a.given));
}

function ieeeInitials(given: string): string {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const bare = part.replace(/\./g, '');
      if (!bare) return '';
      if (bare.includes('-')) {
        return bare.split('-').filter(Boolean).map((p) => `${p[0]?.toUpperCase()}.`).join('-');
      }
      return `${bare[0]?.toUpperCase()}.`;
    })
    .filter(Boolean)
    .join(' ');
}

function formatPersonIEEE(a: Author): string {
  if (a.isOrganisation) return clean(a.family);
  const fam = clean(a.family);
  const ini = ieeeInitials(a.given);
  return ini ? `${ini} ${fam}` : fam;
}

function authorsIEEE(authors: Author[] = []): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  const fmt = list.map(formatPersonIEEE);
  if (fmt.length === 1) return fmt[0];
  if (fmt.length === 2) return `${fmt[0]} and ${fmt[1]}`;
  if (fmt.length <= 6) return `${fmt.slice(0, -1).join(', ')}, and ${fmt[fmt.length - 1]}`;
  return `${fmt[0]} et al.`;
}

// For in-text narrative: just the first author's family name
function ieeeNarrativeName(authors: Author[] = []): string {
  const list = validPeople(authors);
  if (!list.length) return '';
  return clean(list[0].family || list[0].given);
}

/* ============================================================
 * SMALL FORMATTING HELPERS
 * ============================================================ */

function ieeeEdition(edition: string): string {
  const e = clean(edition);
  if (!e || /^1(st)?(?:\s+ed\.?)?$/i.test(e)) return '';
  if (/ed\.$/.test(e)) return e;
  if (/ed$/.test(e)) return `${e}.`;
  if (/^\d+(st|nd|rd|th)$/i.test(e)) return `${e} ed.`;
  if (/^\d+$/.test(e)) {
    const n = parseInt(e, 10);
    const suf = n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${n}${suf} ed.`;
  }
  return `${e} ed.`;
}

function ieeeDoi(rawDoi: string): string {
  if (!has(rawDoi)) return '';
  const raw = clean(rawDoi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
  return `doi:${raw}.`;
}

// Append [Online]. Available: URL — no trailing period after URL
function ieeeAvailable(url: string, type = 'Online'): string {
  return `[${type}]. Available: ${clean(url)}`;
}

/* ============================================================
 * IEEE REFERENCE LIST GENERATORS
 * ============================================================ */

// Online sources (webpage, wiki, webpage-document)
// A. B. Author. "Title." *Website Name*. Accessed: Mon. Day, Year. [Online]. Available: URL
function ieeeOnline(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Untitled');
  const site = clean(d.siteName || d.publisher || '');
  const accessed = ieeeAccessDate(d);

  let out = '';
  if (auth) out += `${esc(auth)}. `;
  out += `&quot;${title}.&quot; `;
  if (site) out += `${ital(esc(site))}. `;
  out += `Accessed: ${esc(accessed)}.`;
  if (has(d.url)) out += ` ${ieeeAvailable(d.url)}`;
  return out.trim();
}

// Online newspaper/news article
// A. B. Author. "Title." *Publication*, Mon. Day, Year. Accessed: Mon. Day, Year. [Online]. Available: URL
function ieeeNewsOnline(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Untitled article');
  const pub = clean(d.publisher || d.siteName || '');
  const pubDate = ieeePublishedDate(d);
  const accessed = ieeeAccessDate(d);

  let out = '';
  if (auth) out += `${esc(auth)}. `;
  out += `&quot;${title}.&quot; `;
  if (pub) out += `${ital(esc(pub))}, `;
  out += `${esc(pubDate)}. Accessed: ${esc(accessed)}.`;
  if (has(d.url)) out += ` ${ieeeAvailable(d.url)}`;
  return out.trim();
}

// Print newspaper
// A. B. Author, "Title," *Publication*, pp. X-Y, Mon. Day, Year.
function ieeeNewsPrint(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Untitled article');
  const pub = clean(d.publisher || d.siteName || '');
  const pubDate = ieeeFullDate(d.month, d.day, d.year);

  const parts: string[] = [];
  if (auth) parts.push(esc(auth));
  parts.push(`&quot;${title},&quot;`);
  if (pub) parts.push(ital(esc(pub)));
  if (has(d.pages)) parts.push(`pp. ${esc(clean(d.pages))}`);
  parts.push(esc(pubDate) + '.');
  return parts.join(', ').replace(/,\s*\.$/, '.');
}

// Journal article
// A. B. Author, "Title," *Abbrev. J.*, vol. X, no. Y, pp. A-B, Mon. Year[, doi:xxx | [Online]. Available: URL]
function ieeeJournal(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Untitled article');
  const journal = clean(d.journal || 'J. title');

  const parts: string[] = [];
  if (auth) parts.push(esc(auth));
  parts.push(`&quot;${title},&quot;`);
  parts.push(ital(esc(journal)) + ',');
  if (has(d.volume)) parts.push(`vol. ${esc(clean(d.volume))},`);
  if (has(d.issue)) parts.push(`no. ${esc(clean(d.issue))},`);
  if (has(d.pages)) parts.push(`pp. ${esc(clean(d.pages))},`);
  else if (has(d.articleNumber)) parts.push(`Art. no. ${esc(clean(d.articleNumber))},`);

  const mo = abbrevMonth(d.month);
  const yr = clean(d.year);
  if (mo && yr) parts.push(`${mo} ${yr}`);
  else if (yr) parts.push(yr);

  let out = parts.join(' ').replace(/,\s+([,.])/g, '$1').replace(/,\s*$/, '');

  if (has(d.doi)) {
    out += `, ${ieeeDoi(d.doi)}`;
  } else if (has(d.url)) {
    out += `. ${ieeeAvailable(d.url)}`;
  } else {
    if (!endsWithStop(out)) out += '.';
  }
  return out;
}

// Book
// A. B. Author, *Title*, Xth ed. City, Country: Publisher, Year.
function ieeeBook(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = ital(esc(clean(d.title) || 'Title'));
  const ed = ieeeEdition(d.edition);
  const place = clean(d.place);
  const publisher = clean(d.publisher);
  const year = clean(d.year);

  let out = '';
  if (auth) out += `${esc(auth)}, `;
  out += title;
  if (ed) {
    // edition already ends with period (e.g. "2nd ed.")
    out += `, ${esc(ed)}`;
  } else {
    out += '.';
  }

  const location = place && publisher
    ? ` ${esc(place)}: ${esc(publisher)},`
    : publisher
      ? ` ${esc(publisher)},`
      : '';
  out += location;
  if (year) out += ` ${esc(year)}.`;
  else if (location) out = out.replace(/,$/, '.');

  if (has(d.doi)) out += ` ${ieeeDoi(d.doi)}`;
  else if (has(d.url)) out += ` ${ieeeAvailable(d.url)}`;

  return out.trim();
}

// Chapter in edited book
// A. B. Author, "Chapter title," in *Book Title*, A. Editor, Ed., Xth ed. City: Publisher, Year, pp. xxx-xxx.
function ieeeBookChapter(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const chTitle = esc(clean(d.title) || 'Chapter title');
  const bookTitle = ital(esc(clean(d.bookTitle) || 'Book title'));
  const ed = ieeeEdition(d.edition);
  const place = clean(d.place);
  const publisher = clean(d.publisher);
  const year = clean(d.year);

  const editorList = validPeople(d.editors);
  const editorsParsed = parsePeople(d.editorsText);
  const allEditors = [...editorList, ...editorsParsed];
  const editorsStr = allEditors.length ? authorsIEEE(allEditors) : '';
  const edLabel = allEditors.length > 1 ? 'Eds.' : 'Ed.';

  let out = '';
  if (auth) out += `${esc(auth)}, `;
  out += `&quot;${chTitle},&quot; in ${bookTitle}`;
  if (editorsStr) out += `, ${esc(editorsStr)}, ${edLabel}`;
  if (ed) out += `, ${esc(ed)}`;
  out += '.';

  if (place && publisher) out += ` ${esc(place)}: ${esc(publisher)},`;
  else if (publisher) out += ` ${esc(publisher)},`;

  if (year) out += ` ${esc(year)},`;
  if (has(d.pages)) {
    out += ` pp. ${esc(clean(d.pages))}.`;
  } else {
    out = out.replace(/,$/, '.');
  }

  if (has(d.doi)) out += ` ${ieeeDoi(d.doi)}`;
  else if (has(d.url)) out += ` ${ieeeAvailable(d.url)}`;

  return out.trim();
}

// Translated book
function ieeeTranslatedBook(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = ital(esc(clean(d.title) || 'Title'));
  const ed = ieeeEdition(d.edition);
  const place = clean(d.place);
  const publisher = clean(d.publisher);
  const year = clean(d.year);
  const trans = clean(d.translatorsText);

  let out = '';
  if (auth) out += `${esc(auth)}, `;
  out += title;
  if (trans) out += `, translated by ${esc(trans)}`;
  if (ed) {
    out += `, ${esc(ed)}`;
  } else {
    out += '.';
  }

  if (place && publisher) out += ` ${esc(place)}: ${esc(publisher)},`;
  else if (publisher) out += ` ${esc(publisher)},`;

  if (year) out += ` ${esc(year)}.`;
  else out = out.replace(/,$/, '.');

  if (has(d.originalYear)) out += ` (Original work published ${esc(clean(d.originalYear))})`;

  return out.trim();
}

// Technical report
// A. B. Author, "Title," Company, City, Country, Rep. No. X, Year.
function ieeeReport(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Report title');
  const pub = clean(d.publisher || d.siteName || '');
  const place = clean(d.place);
  const year = clean(d.year);
  const repNum = clean(d.reportNumber);

  const parts: string[] = [];
  if (auth) parts.push(esc(auth));
  parts.push(`&quot;${title},&quot;`);
  if (pub) parts.push(esc(pub));
  if (place) parts.push(esc(place));
  if (repNum) parts.push(`Rep. ${esc(repNum)}`);
  if (year) parts.push(esc(year));

  let out = parts.join(', ');
  if (!endsWithStop(out)) out += '.';

  if (has(d.url)) out += ` [Online]. Available: ${clean(d.url)}`;
  return out.trim();
}

// Thesis / Dissertation
// A. B. Author, "Title," Ph.D. dissertation, Dept., Univ., City, Country, Year.
function ieeeThesis(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Thesis title');
  const format = clean(d.format || 'Ph.D. dissertation');
  const institution = clean(d.institution);
  const place = clean(d.place);
  const year = clean(d.year);

  const parts: string[] = [];
  if (auth) parts.push(esc(auth));
  parts.push(`&quot;${title},&quot;`);
  parts.push(esc(format));
  if (institution) parts.push(esc(institution));
  if (place) parts.push(esc(place));
  if (year) parts.push(esc(year));

  let out = parts.join(', ');
  if (!endsWithStop(out)) out += '.';

  if (has(d.url)) out += ` [Online]. Available: ${clean(d.url)}`;
  return out.trim();
}

// Blog post
// A. B. Author, *Title*. (Mon. Day, Year). Accessed Mon. Day, Year. [Blog]. Available: URL
function ieeeBlogPost(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = ital(esc(clean(d.title) || 'Blog post'));
  const pubDate = ieeePublishedDate(d);
  const accessed = ieeeAccessDate(d);

  let out = '';
  if (auth) out += `${esc(auth)}, `;
  out += `${title}. (${esc(pubDate)}). Accessed ${esc(accessed)}. [Blog].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// Social media post
// A. B. Author. "Post text." *Platform*. Accessed: Mon. Day, Year. [Post]. Available: URL
function ieeeSocial(d: CitationData, defaultPlatform: string, defaultType: string): string {
  const auth = authorsIEEE(d.authors) || clean(d.username || d.siteName || 'Unknown author');
  const title = clean(d.title || '');
  const platform = ital(esc(clean(d.platform || defaultPlatform)));
  const type = esc(clean(d.postType || defaultType));
  const accessed = ieeeAccessDate(d);

  let out = `${esc(auth)}. `;
  if (title) out += `&quot;${esc(title)}.&quot; `;
  out += `${platform}. Accessed: ${esc(accessed)}. [${type}].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// Online video (YouTube, streaming video)
// Creator. *Title*. (Mon. Day, Year). Accessed: Mon. Day, Year. [Online Video]. Available: URL
function ieeeOnlineVideo(d: CitationData): string {
  const auth = authorsIEEE(d.authors) || clean(d.siteName || d.publisher || d.platform || 'Creator');
  const title = ital(esc(clean(d.title) || 'Video title'));
  const pubDate = has(d.year) ? ieeePublishedDate(d) : 'date unknown';
  const accessed = ieeeAccessDate(d);

  let out = `${esc(auth)}. ${title}. (${esc(pubDate)}). Accessed: ${esc(accessed)}. [Online Video].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// Film / motion picture
// A. B. Director, *Title*. Year. Production Company.
function ieeeFilm(d: CitationData): string {
  const auth = authorsIEEE(d.authors) || clean(d.publisher || 'Director');
  const title = ital(esc(clean(d.title) || 'Film title'));
  const year = clean(d.year);
  const prod = clean(d.productionCompanies || d.publisher || '');
  const place = clean(d.place);

  let out = `${esc(auth)}, ${title}`;
  if (year) out += `, ${esc(year)}`;
  out += '.';
  if (place && prod) out += ` ${esc(place)}: ${esc(prod)}.`;
  else if (prod) out += ` ${esc(prod)}.`;

  return out.trim();
}

// Podcast episode
// Creator. *Title*. (Mon. Day, Year). Accessed: Mon. Day, Year. [Podcast]. Available: URL
function ieeePodcast(d: CitationData): string {
  const auth = authorsIEEE(d.authors) || clean(d.publisher || d.siteName || 'Host');
  const title = ital(esc(clean(d.title) || 'Podcast title'));
  const pubDate = has(d.year) ? ieeePublishedDate(d) : 'date unknown';
  const accessed = ieeeAccessDate(d);

  let out = `${esc(auth)}. ${title}. (${esc(pubDate)}). Accessed: ${esc(accessed)}. [Podcast].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// TV series
function ieeeTvSeries(d: CitationData): string {
  const auth = authorsIEEE(d.authors) || clean(d.publisher || 'Producer');
  const title = ital(esc(clean(d.title || d.seriesTitle) || 'TV series'));
  const year = clean(d.year);
  const prod = clean(d.productionCompanies || d.publisher || '');

  let out = `${esc(auth)}, ${title}`;
  if (year) out += `, ${esc(year)}`;
  out += '.';
  if (prod) out += ` ${esc(prod)}.`;

  return out.trim();
}

// TV episode
// A. B. Director, "Episode title," in *Series Title*, season X, episode Y, Year. Production Company.
function ieeeTvEpisode(d: CitationData): string {
  const auth = authorsIEEE(d.authors) || clean(d.publisher || 'Director');
  const epTitle = esc(clean(d.title) || 'Episode title');
  const series = ital(esc(clean(d.seriesTitle) || 'Series title'));
  const year = clean(d.year);
  const prod = clean(d.productionCompanies || d.publisher || '');
  const seasonEp = [
    has(d.season) ? `season ${esc(clean(d.season))}` : '',
    has(d.episode) ? `episode ${esc(clean(d.episode))}` : '',
  ].filter(Boolean).join(', ');

  let out = `${esc(auth)}, &quot;${epTitle},&quot; in ${series}`;
  if (seasonEp) out += `, ${seasonEp}`;
  if (year) out += `, ${esc(year)}`;
  out += '.';
  if (prod) out += ` ${esc(prod)}.`;

  return out.trim();
}

// Image / photograph
// A. B. Author. "Title." *Website*. Accessed: Mon. Day, Year. [Photograph/Image]. Available: URL
function ieeeImage(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Untitled image');
  const site = clean(d.siteName || d.publisher || '');
  const format = esc(clean(d.description || d.format || 'Photograph'));
  const accessed = ieeeAccessDate(d);

  let out = '';
  if (auth) out += `${esc(auth)}. `;
  out += `&quot;${title}.&quot; `;
  if (site) out += `${ital(esc(site))}. `;
  out += `Accessed: ${esc(accessed)}. [${format}].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// Course material (lecture recording, slides, lab manual)
// A. B. Author. "Title." *Platform*. Accessed: Mon. Day, Year. [Lecture recording]. Available: URL
function ieeeCourseMaterial(d: CitationData, defaultType: string): string {
  const auth = authorsIEEE(d.authors);
  const title = esc(clean(d.title) || 'Course material');
  const platform = clean(d.platform || d.publisher || d.institution || '');
  const format = esc(clean(d.format || defaultType));
  const accessed = ieeeAccessDate(d);

  let out = '';
  if (auth) out += `${esc(auth)}. `;
  out += `&quot;${title}.&quot; `;
  if (platform) out += `${ital(esc(platform))}. `;
  out += `Accessed: ${esc(accessed)}. [${format}].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

// Standard / legal act
// *Title of Standard*, Standard Number, Year.
function ieeeStandard(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'Standard title'));
  const number = clean(d.section || d.reportNumber || d.volumeLegal || '');
  const year = clean(d.year);

  let out = title;
  if (number) out += `, ${esc(number)}`;
  if (year) out += `, ${esc(year)}`;
  if (!endsWithStop(out)) out += '.';

  if (has(d.url)) out += ` [Online]. Available: ${clean(d.url)}`;
  return out.trim();
}

// Legal case
function ieeeLegalCase(d: CitationData): string {
  const title = esc(clean(d.title) || 'Case title');
  const year = clean(d.year);
  const legalParts = [clean(d.volumeLegal), clean(d.reporter), clean(d.startingPage)].filter(Boolean);

  let out = title;
  if (year) out += ` (${esc(year)})`;
  if (legalParts.length) out += ` ${esc(legalParts.join(' '))}`;
  if (!endsWithStop(out)) out += '.';

  if (has(d.url)) out += ` [Online]. Available: ${clean(d.url)}`;
  return out.trim();
}

// Personal communication — cited in-text only; no reference list entry
// IEEE in-text: [1], but in references: A. B. Author, private communication, Mon. Year.
function ieeePersonalCommunication(d: CitationData): string {
  const auth = authorsIEEE(d.authors);
  const date = ieeeMonthYear(d.month, d.year);
  const name = auth || '[Author name]';
  return `Personal communication is cited in-text only: ${esc(name)}, private communication, ${esc(date)}.`;
}

// AI-generated content
// *Title*. (Year), Publisher. Accessed: Mon. Day, Year. [Online]. Available: URL
function ieeeAiContent(d: CitationData): string {
  const title = ital(esc(clean(d.title) || 'AI-generated content'));
  const year = clean(d.year);
  const publisher = esc(clean(d.publisher || d.toolName || 'OpenAI'));
  const accessed = ieeeAccessDate(d);

  let out = `${title}. (${esc(year)}), ${publisher}. Accessed: ${esc(accessed)}. [Online].`;
  if (has(d.url)) out += ` Available: ${clean(d.url)}`;
  return out.trim();
}

/* ============================================================
 * DISPATCH TABLE
 * ============================================================ */

const ieeeDispatch: Record<SourceType, (d: CitationData) => string> = {
  webpage: ieeeOnline,
  'webpage-document': ieeeOnline,
  'wiki-entry': ieeeOnline,
  'newspaper-online': ieeeNewsOnline,
  'newspaper-print': ieeeNewsPrint,
  journal: ieeeJournal,
  book: ieeeBook,
  'book-chapter': ieeeBookChapter,
  'translated-book': ieeeTranslatedBook,
  report: ieeeReport,
  'blog-post': ieeeBlogPost,
  'social-twitter': (d) => ieeeSocial(d, 'X', 'Post'),
  'social-facebook': (d) => ieeeSocial(d, 'Facebook', 'Post'),
  'social-instagram': (d) => ieeeSocial(d, 'Instagram', 'Post'),
  'social-tiktok': (d) => ieeeSocial(d, 'TikTok', 'Post'),
  'youtube-video': ieeeOnlineVideo,
  film: ieeeFilm,
  podcast: ieeePodcast,
  'streaming-video': ieeeOnlineVideo,
  'tv-series': ieeeTvSeries,
  'tv-episode': ieeeTvEpisode,
  image: ieeeImage,
  'lecture-recording': (d) => ieeeCourseMaterial(d, 'Lecture recording'),
  'powerpoint-slides': (d) => ieeeCourseMaterial(d, 'PowerPoint slides'),
  'lab-manual': (d) => ieeeCourseMaterial(d, 'Practical manual'),
  thesis: ieeeThesis,
  'legal-act': ieeeStandard,
  'legal-case': ieeeLegalCase,
  'personal-communication': ieeePersonalCommunication,
  'ai-chat': ieeeAiContent,
};

/* ============================================================
 * IEEE IN-TEXT CITATIONS
 *
 * IEEE numbers citations [1], [2], [3] in order of first appearance.
 * This engine outputs [1] as a placeholder since document-level numbering
 * cannot be tracked by a single-citation generator.
 * ============================================================ */

function ieeeQuoteLocator(d: CitationData): string {
  const qp = clean(d.quotePage);
  const qps = clean(d.quotePages);
  if (qp) return `, p. ${esc(qp)}`;
  if (qps) return `, pp. ${esc(qps)}`;
  return '';
}

export function generateIeee(source: SourceType, data: CitationData): CitationOutput {
  const narrativeName = ieeeNarrativeName(data.authors);
  const locator = source !== 'personal-communication' ? ieeeQuoteLocator(data) : '';

  return {
    reference: ieeeDispatch[source](data),
    intextParaphrase: '[1]',
    intextQuote: `[1${locator}]`,
    intextNarrative: narrativeName ? `${esc(narrativeName)} [1]` : '[1]',
    notes: [],
  };
}

export const ieeeInternals = { validPeople, has };
