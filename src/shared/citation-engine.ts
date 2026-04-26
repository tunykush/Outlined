/**
 * Citation engine implementing rules transcribed from the
 * RMIT Easy Cite APA 7th Edition Style Guide PDF.
 *
 * Each function maps to a section of the guide. Page references in comments
 * point back to the source PDF for traceability.
 */

import type {
  Author,
  CitationData,
  CitationOutput,
  CitationStyle,
  SourceType,
} from '../shared/types.js';

/* ============================================================
 * AUTHOR FORMATTERS
 * ============================================================ */

/** Extract initials with periods, e.g. "John Allen" -> "J. A." */
function initials(given: string): string {
  return given
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      // Handle hyphenated like "Jean-Paul" -> "J.-P."
      if (part.includes('-')) {
        return part.split('-').map((p) => p[0]?.toUpperCase() + '.').join('-');
      }
      return part[0]?.toUpperCase() + '.';
    })
    .join(' ');
}

/**
 * APA 7th author list for reference list.
 * Rules from PDF (pages 4, 19-20):
 *   - 1 author: "Family, F. M."
 *   - 2-20 authors: list all, comma-separated, "& " before last
 *   - 21+ authors: list first 19, then ". . . " then final author
 *   - Organisation: use full name as-is
 */
function authorsAPA(authors: Author[]): string {
  const list = authors.filter((a) => a.family.trim() || a.given.trim());
  if (list.length === 0) return '';

  const formatOne = (a: Author): string => {
    if (a.isOrganisation) return a.family.trim();
    const fam = a.family.trim();
    const ini = initials(a.given);
    return ini ? `${fam}, ${ini}` : fam;
  };

  if (list.length === 1) return formatOne(list[0]);
  if (list.length === 2) return `${formatOne(list[0])}, & ${formatOne(list[1])}`;
  if (list.length <= 20) {
    return (
      list.slice(0, -1).map(formatOne).join(', ') +
      ', & ' +
      formatOne(list[list.length - 1])
    );
  }
  // 21+: first 19, ellipsis, last
  const first19 = list.slice(0, 19).map(formatOne).join(', ');
  return `${first19}, . . . ${formatOne(list[list.length - 1])}`;
}

/**
 * APA in-text author string.
 * PDF page 1: "When a work has three or more authors, cite only the family
 * name of the first author followed by et al."
 */
function authorsInTextAPA(authors: Author[]): string {
  const list = authors.filter((a) => a.family.trim() || a.given.trim());
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].family || list[0].given;
  if (list.length === 2) return `${list[0].family} & ${list[1].family}`;
  return `${list[0].family} et al.`;
}

/**
 * Narrative form (e.g. "Brophy (2010) states..."). Uses "and" instead of "&"
 * when authors appear in running text — PDF page 12, 18.
 */
function authorsInTextNarrativeAPA(authors: Author[]): string {
  const list = authors.filter((a) => a.family.trim() || a.given.trim());
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].family || list[0].given;
  if (list.length === 2) return `${list[0].family} and ${list[1].family}`;
  return `${list[0].family} et al.`;
}

/* ============================================================
 * APA 7th — REFERENCE LIST GENERATORS
 * ============================================================ */

/** Wrap text in <i> for italics rendering */
const ital = (s: string) => `<i>${s}</i>`;
/**
 * Escape HTML entities in user-provided text only.
 * Use this on title/journal/url/etc. — NOT on already-formatted author strings,
 * which may legitimately contain "&" as APA's ampersand separator.
 */
const esc = (s: string) =>
  s.replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Ensure a string ends with a period (used for author segments). Avoids "Baird, J.." */
const dot = (s: string): string => (s.endsWith('.') ? s : s + '.');

/** Construct APA date parenthetical: (Year), (Year, Month Day), or (n.d.) */
function apaDate(d: CitationData, includeMonthDay: boolean): string {
  const year = d.year.trim() || 'n.d.';
  if (!includeMonthDay) return `(${year}).`;
  if (d.month.trim() && d.day.trim()) return `(${year}, ${d.month.trim()} ${d.day.trim()}).`;
  if (d.month.trim()) return `(${year}, ${d.month.trim()}).`;
  return `(${year}).`;
}

/**
 * APA 7th — Webpage / Webpage document.
 * PDF pages 32-35.
 *
 * Rule: Author. (Year, Month Day). Title of webpage. Website Name. URL
 * - If author is the same as Website Name, omit Website Name.
 * - Title of webpage is italicised when standalone (no site name above it).
 */
function apaWebpage(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);

  // The PDF distinguishes: if author == site name, omit site name.
  const authIsSite =
    auth &&
    d.siteName &&
    auth.replace(/\.$/, '').toLowerCase() === d.siteName.toLowerCase();

  // For standalone webpages (independent author and site), title is italicised
  // when the page is part of a larger website. Per PDF p. 33 examples,
  // webpage titles are italicised in references.
  const title = ital(esc(d.title));
  const site = !authIsSite && d.siteName.trim() ? `${esc(d.siteName.trim())}. ` : '';
  const url = d.url.trim();

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `; // No author — title goes first (PDF p. 7-8)
  out += `${title}. `;
  out += site;
  if (url) out += url;
  return out.trim();
}

/**
 * APA 7th — Newspaper article from website.
 * PDF pages 23-24.
 *
 * Rule: Author. (Year, Month Day). Title of article. Title of Periodical. URL
 * - Title of ARTICLE is NOT italicised, only the newspaper name.
 */
function apaNewspaperOnline(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);
  const title = esc(d.title);          // article title plain
  const periodical = ital(esc(d.publisher || d.siteName));
  const url = d.url.trim();

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${title}. ${periodical}.`;
  if (url) out += ` ${url}`;
  return out;
}

/**
 * APA 7th — Newspaper article, print.
 * PDF pages 24-25.
 * Author. (Year, Month Day). Title of article. Title of Periodical, Page(s).
 */
function apaNewspaperPrint(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);
  const title = esc(d.title);
  const periodical = ital(esc(d.publisher || d.siteName));

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${title}. ${periodical}`;
  if (d.pages.trim()) out += `, ${esc(d.pages.trim())}`;
  out += '.';
  return out;
}

/**
 * APA 7th — Journal article.
 * PDF pages 17-22.
 *
 * Rules:
 *   - Title of journal AND volume number are italicised.
 *   - Issue in (parens) NOT italicised.
 *   - Include DOI as https://doi.org/xxxx (no full stop after URL, PDF p. 9).
 *   - If no page range, use "Article xxx" instead.
 */
function apaJournal(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, false);
  const title = esc(d.title);
  const journal = ital(esc(d.journal));
  const volume = d.volume.trim() ? ital(esc(d.volume.trim())) : '';
  const issue = d.issue.trim() ? `(${esc(d.issue.trim())})` : '';

  // Page range OR article number (PDF page 9)
  let locator = '';
  if (d.pages.trim()) locator = esc(d.pages.trim());
  else if (d.articleNumber.trim()) locator = `Article ${esc(d.articleNumber.trim())}`;

  // DOI normalisation — accept "10.xxx/yyy", "doi:...", or full URL.
  let doiUrl = '';
  if (d.doi.trim()) {
    let raw = d.doi.trim();
    raw = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    doiUrl = `https://doi.org/${raw}`;
  }

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${title}. ${journal}`;
  if (volume) out += `, ${volume}`;
  if (issue) out += issue;
  if (locator) out += `, ${locator}`;
  out += '.';
  if (doiUrl) out += ` ${doiUrl}`;
  else if (d.url.trim()) out += ` ${d.url.trim()}`;
  return out;
}

/**
 * APA 7th — Book / E-book.
 * PDF pages 11-16.
 *
 * Rule: Author. (Year). Title of book: Subtitle (Edition ed.). Publisher.
 * - Book title italicised.
 * - Edition only if NOT 1st edition.
 * - For e-book with DOI: append https://doi.org/xxxx (PDF p. 16)
 */
function apaBook(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, false);
  let titleStr = ital(esc(d.title));

  // Edition handling — only include if non-empty and not "1st"
  const ed = d.edition.trim();
  if (ed && !/^1(st)?$/i.test(ed)) {
    // Format: "(2nd ed.)"
    const edFormatted = /\d+(st|nd|rd|th)$/i.test(ed) ? ed : `${ed} ed.`;
    titleStr += ` (${esc(edFormatted.endsWith('ed.') ? edFormatted : edFormatted + ' ed.')})`;
  }

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${titleStr}. `;
  if (d.publisher.trim()) out += `${esc(d.publisher.trim())}.`;

  // DOI / URL for e-books
  if (d.doi.trim()) {
    const raw = d.doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    out += ` https://doi.org/${raw}`;
  } else if (d.url.trim()) {
    out += ` ${d.url.trim()}`;
  }
  return out;
}

/**
 * APA 7th — Chapter in an edited book.
 * PDF pages 14-15.
 *
 * Rule: Author. (Year). Title of chapter. In E. E. Editor (Ed.),
 *       Title of book (Edition, pp. xx-xx). Publisher.
 */
function apaBookChapter(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, false);

  // Editors formatted as "I. M. Lubkin & P. D. Larsen" (initials FIRST)
  const editorList = d.editors.filter((e) => e.family.trim() || e.given.trim());
  const editorStr = editorList
    .map((e) => {
      if (e.isOrganisation) return e.family.trim();
      const ini = initials(e.given);
      return ini ? `${ini} ${e.family.trim()}` : e.family.trim();
    })
    .join(editorList.length === 2 ? ' & ' : ', ')
    .replace(/, ([^,]*)$/, editorList.length > 2 ? ', & $1' : ', $1');
  const edsLabel = editorList.length > 1 ? 'Eds.' : 'Ed.';

  // Edition + pages in (parens)
  const ed = d.edition.trim();
  const pages = d.pages.trim();
  const inParens: string[] = [];
  if (ed && !/^1(st)?$/i.test(ed)) {
    const edFormatted = /\d+(st|nd|rd|th)$/i.test(ed) ? `${ed} ed.` : `${ed} ed.`;
    inParens.push(edFormatted);
  }
  if (pages) inParens.push(`pp. ${pages}`);
  const parenPart = inParens.length ? ` (${inParens.join(', ')})` : '';

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${esc(d.title)}. `;
  out += `In ${esc(editorStr)} (${edsLabel}), `;
  out += `${ital(esc(d.bookTitle))}${parenPart}. `;
  if (d.publisher.trim()) out += `${esc(d.publisher.trim())}.`;
  return out.trim();
}

/**
 * APA 7th — Government / corporate report.
 * PDF pages 56-57.
 *
 * Rule: Author. (Year). Title of report (Report Number). Publisher. URL
 * - Title italicised. Report number after title in parens (no italics).
 * - If publisher == author, omit publisher (per PDF "Only identify the publisher
 *   as part of the retrieval statement if the publisher has NOT been identified
 *   as the author").
 */
function apaReport(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, false);
  let titleStr = ital(esc(d.title));
  if (d.reportNumber.trim()) titleStr += ` (${esc(d.reportNumber.trim())})`;

  // Publisher omitted if same as author
  const authNorm = auth.replace(/\.$/, '').toLowerCase();
  const pubNorm = d.publisher.trim().toLowerCase();
  const showPublisher = d.publisher.trim() && authNorm !== pubNorm;

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${titleStr}. `;
  if (showPublisher) out += `${esc(d.publisher.trim())}. `;
  if (d.url.trim()) out += d.url.trim();
  return out.trim();
}

/**
 * APA 7th — Blog post.
 * PDF pages 35-36.
 *
 * Rule: Author. (Year, Month Day). Title of entry. Title of Blog. URL
 * - Blog name italicised, post title plain.
 */
function apaBlogPost(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${esc(d.title)}. `;
  if (d.siteName.trim()) out += `${ital(esc(d.siteName.trim()))}. `;
  if (d.url.trim()) out += d.url.trim();
  return out.trim();
}

/**
 * APA 7th — Twitter / X post.
 * PDF pages 39-40.
 *
 * Rule: Author, A. [@username]. (Year, Month Day). Content (up to 20 words)
 *       [Description] [Post]. X. URL
 * - First 20 words of post content as title, italicised.
 * - "[Post]" descriptor (or "[Tweet]" for archived).
 */
function apaTwitter(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);
  const handle = d.username.trim() ? ` [${esc(d.username.trim())}]` : '';

  // Truncate title to 20 words (the rule)
  const words = d.title.trim().split(/\s+/);
  const titleTrunc = words.slice(0, 20).join(' ');
  const titleEllipsis = words.length > 20 ? '…' : '';

  let out = '';
  if (auth) out += `${dot(esc(auth) + handle)} ${date} `;
  else out += `${date} `;
  out += `${ital(esc(titleTrunc) + titleEllipsis)} `;
  out += `[Post]. ${ital('X')}.`;
  if (d.url.trim()) out += ` ${d.url.trim()}`;
  return out.trim();
}

/**
 * APA 7th — Facebook post.
 * PDF pages 36-37.
 */
function apaFacebook(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);

  const words = d.title.trim().split(/\s+/);
  const titleTrunc = words.slice(0, 20).join(' ');
  const ell = words.length > 20 ? '…' : '';

  let out = '';
  if (auth) out += `${dot(esc(auth))} ${date} `;
  else out += `${date} `;
  out += `${ital(esc(titleTrunc) + ell)} `;
  out += `[Status update]. Facebook.`;
  if (d.url.trim()) out += ` ${d.url.trim()}`;
  return out.trim();
}

/**
 * APA 7th — Instagram post.
 * PDF pages 37-38.
 */
function apaInstagram(d: CitationData): string {
  const auth = authorsAPA(d.authors);
  const date = apaDate(d, true);
  const handle = d.username.trim() ? ` [${esc(d.username.trim())}]` : '';

  const words = d.title.trim().split(/\s+/);
  const titleTrunc = words.slice(0, 20).join(' ');
  const ell = words.length > 20 ? '…' : '';

  let out = '';
  if (auth) out += `${dot(esc(auth) + handle)} ${date} `;
  else out += `${date} `;
  out += `${ital(esc(titleTrunc) + ell)} `;
  out += `[Photograph]. Instagram.`;
  if (d.url.trim()) out += ` ${d.url.trim()}`;
  return out.trim();
}

/* ============================================================
 * APA 7th — IN-TEXT GENERATORS
 * ============================================================ */

/** Parenthetical citation: (Author, Year) or (Author et al., Year) */
function apaInTextParenthetical(d: CitationData): string {
  const author = authorsInTextAPA(d.authors);
  const year = d.year.trim() || 'n.d.';

  if (!author) {
    // No author — use first few words of title in quotes (PDF p. 5)
    const titleSnippet = d.title.trim().split(/\s+/).slice(0, 3).join(' ');
    if (!titleSnippet) return `(n.d.)`;
    // For italicised titles in references, italicise in-text too (PDF p. 5)
    return `(<i>${esc(titleSnippet)}</i>, ${year})`;
  }
  return `(${esc(author)}, ${year})`;
}

/** Direct-quote citation: (Author, Year, p. X) */
function apaInTextQuote(d: CitationData): string {
  const author = authorsInTextAPA(d.authors);
  const year = d.year.trim() || 'n.d.';
  // PDF p. 2-3: page numbers required for direct quotes;
  // when no pages, use section name + paragraph number.
  const locator = d.pages.trim()
    ? `p. ${d.pages.trim().split(/[-–]/)[0]}`
    : 'para. X';

  if (!author) {
    const titleSnippet = d.title.trim().split(/\s+/).slice(0, 3).join(' ');
    return `(<i>${esc(titleSnippet || 'Title')}</i>, ${year}, ${locator})`;
  }
  return `(${esc(author)}, ${year}, ${locator})`;
}

/* ============================================================
 * STYLE DISPATCH (APA 7th — primary; others briefly supported)
 * ============================================================ */

const apaDispatch: Record<SourceType, (d: CitationData) => string> = {
  webpage: apaWebpage,
  'newspaper-online': apaNewspaperOnline,
  'newspaper-print': apaNewspaperPrint,
  journal: apaJournal,
  book: apaBook,
  'book-chapter': apaBookChapter,
  report: apaReport,
  'blog-post': apaBlogPost,
  'social-twitter': apaTwitter,
  'social-facebook': apaFacebook,
  'social-instagram': apaInstagram,
};

/* ============================================================
 * RMIT HARVARD — minimal port (single function for brevity)
 * Format: Family FM Year, 'Title', Source, accessed Date, <URL>.
 * ============================================================ */

function harvardAuthors(authors: Author[]): string {
  const list = authors.filter((a) => a.family.trim() || a.given.trim());
  if (!list.length) return '';
  const fmt = (a: Author) => {
    if (a.isOrganisation) return a.family.trim();
    const ini = a.given
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((g) => g[0]?.toUpperCase())
      .join('');
    return ini ? `${a.family.trim()} ${ini}` : a.family.trim();
  };
  if (list.length === 1) return fmt(list[0]);
  if (list.length === 2) return `${fmt(list[0])} and ${fmt(list[1])}`;
  if (list.length <= 3)
    return `${list.slice(0, -1).map(fmt).join(', ')} and ${fmt(list[list.length - 1])}`;
  return `${fmt(list[0])} et al.`;
}

function harvardGenerate(d: CitationData, src: SourceType): string {
  const auth = harvardAuthors(d.authors);
  const year = d.year.trim() || 'n.d.';
  const accessed = d.accessDate.trim() ? `accessed ${esc(d.accessDate.trim())}, ` : '';

  if (src === 'journal') {
    let s = '';
    if (auth) s += `${esc(auth)} `;
    s += `${year}, '${esc(d.title)}', ${ital(esc(d.journal))}`;
    if (d.volume.trim()) s += `, vol. ${esc(d.volume.trim())}`;
    if (d.issue.trim()) s += `, no. ${esc(d.issue.trim())}`;
    if (d.pages.trim()) s += `, pp. ${esc(d.pages.trim())}`;
    s += '.';
    if (d.doi.trim()) s += ` doi: ${esc(d.doi.trim())}`;
    return s;
  }
  if (src === 'book') {
    let s = '';
    if (auth) s += `${esc(auth)} `;
    s += `${year}, ${ital(esc(d.title))}`;
    if (d.edition.trim()) s += `, ${esc(d.edition.trim())} edn`;
    if (d.publisher.trim()) s += `, ${esc(d.publisher.trim())}`;
    if (d.place.trim()) s += `, ${esc(d.place.trim())}`;
    return s + '.';
  }
  // Webpages / news / social / blog / report
  let s = '';
  if (auth) s += `${esc(auth)} `;
  s += `${year}, ${ital(esc(d.title))}, `;
  if (d.siteName.trim()) s += `${esc(d.siteName.trim())}, `;
  else if (d.publisher.trim()) s += `${esc(d.publisher.trim())}, `;
  s += accessed;
  if (d.url.trim()) s += `&lt;${esc(d.url.trim())}&gt;`;
  return s.replace(/,\s*$/, '') + '.';
}

/* ============================================================
 * MAIN ENTRY: generate(style, source, data) -> CitationOutput
 * ============================================================ */

export function generate(
  style: CitationStyle,
  source: SourceType,
  data: CitationData
): CitationOutput {
  const notes: string[] = [];

  // Common quality checks (PDF rules)
  if (!data.authors.some((a) => a.family.trim() || a.given.trim())) {
    notes.push('No author detected — using title in author position (per APA p. 5-7).');
  }
  if (!data.year.trim()) {
    notes.push('No publication year — used "n.d." (no date).');
  }
  if (source === 'journal' && !data.doi.trim() && !data.url.trim()) {
    notes.push('Journal articles should include a DOI when available (APA p. 9).');
  }

  let reference = '';

  if (style === 'apa7') {
    reference = apaDispatch[source](data);

    // Reference-list formatting reminder (PDF p. 9)
    notes.push(
      'In Word: select the entry and apply a hanging indent (Format → Paragraph → Special → Hanging).'
    );
    notes.push('Arrange your reference list alphabetically by author family name.');
  } else if (style === 'harvard') {
    reference = harvardGenerate(data, source);
  } else {
    // Other styles fall back to a clear placeholder so user knows they need APA-only currently.
    reference = `(Style "${style}" — minimal output) ${apaDispatch[source](data).replace(/<\/?i>/g, '')}`;
    notes.push(
      `Full implementation of ${style} is not yet wired — output above is APA-derived. Use the APA 7th tab for the most accurate result.`
    );
  }

  return {
    reference,
    intextParaphrase: apaInTextParenthetical(data),
    intextQuote: apaInTextQuote(data),
    notes,
  };
}

/** Default empty CitationData — used to seed the form */
export function emptyCitationData(): CitationData {
  return {
    authors: [{ family: '', given: '' }],
    year: '',
    month: '',
    day: '',
    title: '',
    url: '',
    accessDate: '',
    siteName: '',
    publisher: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    articleNumber: '',
    doi: '',
    edition: '',
    place: '',
    bookTitle: '',
    editors: [],
    username: '',
    platform: '',
    reportNumber: '',
  };
}
