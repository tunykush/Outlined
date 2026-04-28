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
import { emptyCitationData } from '../shared/citation-engine.js';
/* ---------- helpers ---------- */
function metaContent($, selectors) {
    for (const sel of selectors) {
        const el = $(sel).first();
        if (el.length) {
            const c = el.attr('content') || el.attr('value') || el.text();
            if (c && c.trim())
                return c.trim();
        }
    }
    return '';
}
function metaContentAll($, selector) {
    const out = [];
    $(selector).each((_, el) => {
        const c = $(el).attr('content');
        if (c && c.trim())
            out.push(c.trim());
    });
    return out;
}
function pickFirst(...values) {
    for (const v of values) {
        if (v != null && String(v).trim() !== '')
            return String(v).trim();
    }
    return '';
}
function parseJsonLd($) {
    const result = {
        article: null,
        product: null,
        organization: null,
        website: null,
        newsArticle: null,
        book: null,
    };
    $('script[type="application/ld+json"]').each((_, el) => {
        const text = $(el).contents().text();
        if (!text)
            return;
        try {
            const parsed = JSON.parse(text);
            const visit = (node) => {
                if (!node || typeof node !== 'object')
                    return;
                const types = [].concat(node['@type'] || []);
                for (const t of types) {
                    const tl = String(t).toLowerCase();
                    if (/^newsarticle$/.test(tl))
                        result.newsArticle || (result.newsArticle = node);
                    if (/^(article|blogposting|scholarlyarticle|techarticle|report)$/.test(tl)) {
                        result.article || (result.article = node);
                    }
                    if (tl === 'webpage' && !result.article)
                        result.article || (result.article = node);
                    if (tl === 'product')
                        result.product || (result.product = node);
                    if (tl === 'organization')
                        result.organization || (result.organization = node);
                    if (tl === 'website')
                        result.website || (result.website = node);
                    if (tl === 'book')
                        result.book || (result.book = node);
                }
                if (node['@graph'])
                    for (const g of node['@graph'])
                        visit(g);
            };
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            for (const obj of arr)
                visit(obj);
        }
        catch {
            /* ignore malformed JSON-LD */
        }
    });
    return result;
}
/** Split a "First Last" or "Last, First" name string into Author */
function splitName(raw) {
    const s = raw.trim().replace(/\s+/g, ' ');
    if (!s)
        return { family: '', given: '' };
    if (s.includes(',')) {
        const [fam, giv] = s.split(',', 2).map((x) => x.trim());
        return { family: fam, given: giv || '' };
    }
    // Heuristic for organisations.
    const orgRegex = /\b(inc\.?|ltd\.?|llc|university|department|bureau|institute|association|society|foundation|federation|ministry|agency|corp\.?|company|group|news|press|times|herald|gazette|tribune|post|wiki|library|museum|gallery)\b/i;
    if (orgRegex.test(s) || s.split(/\s+/).length >= 5)
        return { family: s, given: '', isOrganisation: true };
    const parts = s.split(' ');
    if (parts.length === 1)
        return { family: parts[0], given: '' };
    const family = parts.pop();
    return { family, given: parts.join(' ') };
}
/** Resolve a possibly-relative URL to absolute */
function abs(maybeRelative, base) {
    if (!maybeRelative)
        return '';
    try {
        return new URL(maybeRelative, base).toString();
    }
    catch {
        return '';
    }
}
function hostnameOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    }
    catch {
        return '';
    }
}
function isWikiLikeHost(host) {
    return /(^|\.)fandom\.com$|(^|\.)wikipedia\.org$|(^|\.)wiktionary\.org$|(^|\.)wikiquote\.org$/i.test(host);
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cleanTitle(rawTitle, siteName, baseUrl) {
    let title = rawTitle.replace(/\s+/g, ' ').trim();
    if (!title)
        return '';
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
    if (title.includes('|'))
        title = title.split('|')[0].trim();
    return title;
}
function cleanCanonicalUrl(rawUrl, baseUrl) {
    const u = abs(rawUrl, baseUrl);
    if (!u)
        return '';
    try {
        const parsed = new URL(u);
        for (const key of Array.from(parsed.searchParams.keys())) {
            if (/^(utm_|fbclid$|gclid$|srsltid$|mc_cid$|mc_eid$)/i.test(key)) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.hash = '';
        return parsed.toString();
    }
    catch {
        return u;
    }
}
function visibleDateText($) {
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const patterns = [
        /(?:Cập\s*nhật\s*lần\s*cuối|Cập\s*nhật|Ngày\s*đăng|Đăng\s*ngày|Xuất\s*bản|Published|Updated|Last\s*updated)\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:19|20)\d{2})/i,
        /(?:Cập\s*nhật\s*lần\s*cuối|Cập\s*nhật|Ngày\s*đăng|Đăng\s*ngày|Xuất\s*bản|Published|Updated|Last\s*updated)\s*:?\s*((?:19|20)\d{2}[\/-]\d{1,2}[\/-]\d{1,2})/i,
        /(?:Published|Updated|Last\s*updated|Date)\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+(?:19|20)\d{2})/i,
        /(?:Published|Updated|Last\s*updated|Date)\s*:?\s*(\d{1,2}\s+[A-Z][a-z]+\s+(?:19|20)\d{2})/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m?.[1])
            return m[1];
    }
    // Article pages often place a date directly under the byline, e.g. "July-August 2020".
    const shortBlockSelector = 'time,h2,h3,h4,h5,h6,p,span,div';
    const monthRange = /\b([A-Z][a-z]+(?:\s*[-–]\s*[A-Z][a-z]+)?\s+(?:19|20)\d{2})\b/;
    const monthDayYear = /\b([A-Z][a-z]+\s+\d{1,2},?\s+(?:19|20)\d{2})\b/;
    const dayMonthYear = /\b(\d{1,2}\s+[A-Z][a-z]+\s+(?:19|20)\d{2})\b/;
    for (const el of $(shortBlockSelector).toArray()) {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (!t || t.length > 140)
            continue;
        const m = t.match(monthDayYear) || t.match(dayMonthYear) || t.match(monthRange);
        if (m?.[1])
            return m[1];
    }
    return '';
}
async function readabilityExtract(html, url) {
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
    }
    catch {
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
async function nerAuthors(text) {
    if (!text.trim())
        return [];
    try {
        const nlpModule = await import('compromise');
        const nlp = nlpModule.default;
        const doc = nlp(text);
        // Try recognised person names first — highest confidence
        const people = doc.people().out('array')
            .map((s) => s.trim())
            .filter((s) => s.length >= 3 && !shouldIgnoreAuthor(s));
        if (people.length > 0) {
            return people.map((name) => splitName(name));
        }
        // Fall back to org entities (e.g. "Haig Partners", "Handle")
        const orgs = doc.organizations().out('array')
            .map((s) => s.trim())
            .filter((s) => s.length >= 2 && !shouldIgnoreAuthor(s));
        return orgs.map((name) => ({ family: name, given: '', isOrganisation: true }));
    }
    catch {
        return [];
    }
}
/* ─────────────────────────────────────────────────────────────────
   LAYER 3: itemprop / pubdate <time> scanning
   Prioritises time elements that explicitly declare publication date
   via schema.org microdata, which is more reliable than the first
   time[datetime] element (which may be a comment timestamp).
   ───────────────────────────────────────────────────────────────── */
function extractTimeElements($) {
    return ($('time[itemprop="datePublished"]').first().attr('datetime') ||
        $('[itemprop="datePublished"]').first().attr('content') ||
        $('[itemprop="datePublished"]').first().attr('datetime') ||
        $('time[pubdate]').first().attr('datetime') ||
        '');
}
function shouldIgnoreAuthor(raw) {
    const s = raw.trim();
    if (!s)
        return true;
    if (/^https?:/i.test(s))
        return true;
    if (/contributors?\s+to/i.test(s))
        return true;
    if (/^(wiki|fandom|admin|administrator|staff|editorial team)$/i.test(s))
        return true;
    if (/^by\s*$/i.test(s))
        return true;
    return false;
}
function cleanBylineName(raw) {
    return raw
        .replace(/\bby\b\s*/i, '')
        .replace(/\b(written|posted|published)\s+by\b\s*/i, '')
        .replace(/\b(APR|PhD|Ph\.D\.?|MBA|MA|MSc|Dr\.?|Prof\.?|Professor)\b\.?/gi, '')
        .replace(/\s*,\s*(and\b)/gi, ' $1')
        .replace(/\s*,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function splitAuthorList(raw) {
    const normalised = cleanBylineName(raw)
        .replace(/\s*&\s*/g, ' and ')
        .replace(/\s+with\s+/gi, ' and ');
    return normalised
        .split(/\s+(?:and)\s+|\s*;\s*|\s*\|\s*|\n+/i)
        .map(cleanBylineName)
        .filter(Boolean);
}
function extractVisibleBylineAuthors($) {
    const candidates = [];
    $('[class*="author" i], [class*="byline" i], [rel="author"], [itemprop="author"], a[href*="/author" i], a[href*="/authors" i]').each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t && t.length <= 180)
            candidates.push(t);
    });
    // PRSA-style pages expose the byline as a heading: "By Heather Bermudez, APR and Aileen Izquierdo".
    $('h2,h3,h4,h5,h6,p,span,div').each((_, el) => {
        const t = $(el).clone().children('script,style,nav,footer,header').remove().end().text().replace(/\s+/g, ' ').trim();
        if (/^by\s+/i.test(t) && t.length <= 220)
            candidates.push(t);
    });
    const seen = new Set();
    const out = [];
    for (const candidate of candidates) {
        const cleanedCandidate = candidate.replace(/\s+and\s+\d{4}.*$/i, '').trim();
        for (const name of splitAuthorList(cleanedCandidate)) {
            if (shouldIgnoreAuthor(name))
                continue;
            const key = name.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(splitName(name));
        }
        if (out.length)
            break;
    }
    return out;
}
function inferSiteNameFromTitle(rawTitle) {
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
async function extractAuthors($, jsonld, readabilityByline = '') {
    const seen = new Set();
    const out = [];
    const add = (raw) => {
        const cleaned = raw.trim();
        if (!cleaned || cleaned.length < 2)
            return;
        if (shouldIgnoreAuthor(cleaned))
            return;
        const key = cleaned.toLowerCase();
        if (seen.has(key))
            return;
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
            if (typeof a === 'string')
                add(a);
            else if (a && typeof a === 'object' && a.name)
                add(a.name);
        }
    }
    // 3. article:author (Open Graph)
    metaContentAll($, 'meta[property="article:author"]').forEach(add);
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
            if (/[;|\n]/.test(a))
                a.split(/\s*(?:;|\||\n)\s*/).forEach(add);
            else
                add(a);
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
            if (!seen.has(key)) {
                seen.add(key);
                out.push(splitName(name));
            }
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
function splitDate(raw) {
    if (!raw)
        return { year: '', month: '', day: '' };
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
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
function guessType($, jsonld, baseUrl) {
    const host = hostnameOf(baseUrl);
    // Strong signals first
    if (metaContent($, ['meta[name="citation_journal_title"]', 'meta[name="prism.publicationName"]'])) {
        return 'journal';
    }
    if (metaContent($, ['meta[name="citation_doi"]']))
        return 'journal';
    if (jsonld.newsArticle)
        return 'newspaper-online';
    if (jsonld.article) {
        const types = [].concat(jsonld.article['@type'] || []);
        if (types.some((t) => /report/i.test(t)))
            return 'report';
        if (types.some((t) => /scholarly|techarticle/i.test(t)))
            return 'journal';
        if (types.some((t) => /blogposting/i.test(t)))
            return 'blog-post';
    }
    if (jsonld.book)
        return 'book';
    // Hostname-based heuristics
    if (isWikiLikeHost(host))
        return 'wiki-entry';
    if (/youtube\.com|youtu\.be/.test(host))
        return 'youtube-video';
    if (/twitter\.com|x\.com/.test(host))
        return 'social-twitter';
    if (/facebook\.com/.test(host))
        return 'social-facebook';
    if (/instagram\.com/.test(host))
        return 'social-instagram';
    if (/tiktok\.com/.test(host))
        return 'social-tiktok';
    if (/medium\.com|substack\.com|wordpress\.com|blogspot\./.test(host))
        return 'blog-post';
    if (/(news|times|guardian|herald|post|tribune|nytimes|bbc|cnn|reuters|smh|theage)/i.test(host)) {
        return 'newspaper-online';
    }
    // og:type=article is common for normal website articles; do not force it to newspaper.
    const og = metaContent($, ['meta[property="og:type"]']);
    if (/book/i.test(og))
        return 'book';
    if (/video/i.test(og))
        return 'streaming-video';
    if (/article/i.test(og))
        return 'webpage';
    // PDF reports / webpage documents
    if (/\.pdf(\?|$)/i.test(baseUrl))
        return 'report';
    return 'webpage';
}
/* ---------- main extractor ---------- */
export async function extractMetadata(html, baseUrl) {
    const $ = cheerio.load(html);
    const jsonld = parseJsonLd($);
    // Readability runs in parallel with Cheerio — it parses the article body to
    // extract a cleaned title, byline, and site name that meta tags often omit.
    const rdbl = await readabilityExtract(html, baseUrl);
    const data = emptyCitationData();
    // Title — Readability gives a cleaner title than og:title on many sites
    // (strips " | Site Name" suffixes automatically), but we still prefer
    // og:title first since it's the canonical machine-readable signal.
    const rawTitle = pickFirst(metaContent($, ['meta[property="og:title"]']), metaContent($, ['meta[name="twitter:title"]']), metaContent($, ['meta[name="citation_title"]']), jsonld.newsArticle?.headline, jsonld.article?.headline, metaContent($, ['meta[name="dc.title"]', 'meta[name="DC.title"]']), rdbl.title, $('h1').first().text(), $('title').first().text()).replace(/\s+/g, ' ');
    // Site name — Readability's siteName fills the gap when og:site_name is absent
    const host = hostnameOf(baseUrl);
    data.siteName = pickFirst(metaContent($, ['meta[property="og:site_name"]']), jsonld.website?.name, metaContent($, ['meta[name="application-name"]']), rdbl.siteName, inferSiteNameFromTitle(rawTitle), host);
    if (/^prsa\.org$/i.test(host))
        data.siteName = 'PRSA';
    // Fandom pages sometimes expose site_name as "Fandom" even though the actual
    // reference-work title is the middle segment, e.g. "TYPE-MOON Wiki".
    if (isWikiLikeHost(host) && rawTitle.includes('|')) {
        const bits = rawTitle.split('|').map((x) => x.trim()).filter(Boolean);
        const wikiName = bits.find((x) => /wiki/i.test(x) && !/^fandom$/i.test(x));
        if (wikiName)
            data.siteName = wikiName;
    }
    data.title = cleanTitle(rawTitle, data.siteName || '', baseUrl);
    // For news, publisher = newspaper masthead (often == site name)
    data.publisher = pickFirst(metaContent($, ['meta[name="citation_publisher"]']), typeof jsonld.newsArticle?.publisher === 'object' ? jsonld.newsArticle?.publisher?.name : '', typeof jsonld.article?.publisher === 'object' ? jsonld.article?.publisher?.name : '', data.siteName);
    // Date: reliable publication date signals only — never fall back to modification date.
    // Priority: explicit meta > JSON-LD datePublished > schema.org microdata <time> >
    //           generic meta[name="date"] > first time[datetime] > visible body text.
    const dateRaw = pickFirst(metaContent($, ['meta[property="article:published_time"]']), metaContent($, ['meta[name="article:published_time"]']), metaContent($, ['meta[name="citation_publication_date"]']), metaContent($, ['meta[name="citation_date"]']), jsonld.newsArticle?.datePublished, jsonld.article?.datePublished, 
    // schema.org microdata <time itemprop="datePublished"> is more reliable than
    // the first time[datetime] (which might be a comment timestamp)
    extractTimeElements($), metaContent($, [
        'meta[name="datePublished"]',
        'meta[name="date"]',
        'meta[name="dc.date"]',
        'meta[name="DC.date"]',
        'meta[name="DC.date.issued"]',
        'meta[name="parsely-pub-date"]',
    ]), $('time[datetime]').first().attr('datetime'), visibleDateText($));
    if (dateRaw) {
        const { year, month, day } = splitDate(dateRaw);
        data.year = year;
        data.month = month;
        data.day = day;
    }
    // Authors — pass Readability byline so NER fallback has article-body text to work with
    data.authors = await extractAuthors($, jsonld, rdbl.byline);
    // URL & canonical
    data.url = pickFirst(metaContent($, ['meta[property="og:url"]']), $('link[rel="canonical"]').attr('href'), baseUrl);
    if (data.url)
        data.url = cleanCanonicalUrl(data.url, baseUrl);
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
    if (/youtube\.com|youtu\.be/.test(host))
        data.platform = 'YouTube';
    else if (/tiktok\.com/.test(host))
        data.platform = 'TikTok';
    else if (/instagram\.com/.test(host))
        data.platform = 'Instagram';
    else if (/twitter\.com|x\.com/.test(host))
        data.platform = 'X';
    else if (/facebook\.com/.test(host))
        data.platform = 'Facebook';
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
