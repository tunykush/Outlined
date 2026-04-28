/**
 * Fetch page metadata safely:
 *   - 8s timeout
 *   - 5 MB size cap for textual pages
 *   - Allows HTML/XML/text and lightweight PDF URL fallback
 *   - Follows redirects
 *   - Uses MediaWiki/Fandom API fallback when direct Fandom HTML is blocked
 */

interface FetchError extends Error {
  status: number;
  code: string;
}

function makeError(status: number, code: string, message: string): FetchError {
  const err = new Error(message) as FetchError;
  err.status = status;
  err.code = code;
  return err;
}

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

export interface FetchResult {
  html: string;
  finalUrl: string;
}

function pseudoHtmlForPdf(finalUrl: string): string {
  let filename = 'PDF document';
  try {
    filename = decodeURIComponent(
      (new URL(finalUrl).pathname.split('/').pop() || 'PDF document')
        .replace(/\.pdf$/i, '')
        .replace(/[-_]+/g, ' ')
    );
  } catch {
    /* ignore */
  }
  return `<html><head><title>${escapeHtml(filename)}</title><meta property="og:type" content="article" /></head><body><h1>${escapeHtml(filename)}</h1></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isFandomWikiUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return /(^|\.)fandom\.com$/i.test(u.hostname) && u.pathname.split('/').includes('wiki');
  } catch {
    return false;
  }
}

function fandomApiEndpoint(urlString: string): { apiUrl: string; pageTitle: string } | null {
  try {
    const u = new URL(urlString);
    const parts = u.pathname.split('/').filter(Boolean);
    const wikiIndex = parts.findIndex((part) => part.toLowerCase() === 'wiki');
    if (wikiIndex === -1 || !parts[wikiIndex + 1]) return null;

    const prefixPath = parts.slice(0, wikiIndex).join('/');
    const apiUrl = `${u.origin}${prefixPath ? `/${prefixPath}` : ''}/api.php`;
    const pageTitle = decodeURIComponent(parts.slice(wikiIndex + 1).join('/')).replace(/_/g, ' ');
    return { apiUrl, pageTitle };
  } catch {
    return null;
  }
}

async function readResponseText(res: Response, ac: AbortController): Promise<string> {
  if (!res.body) throw makeError(502, 'FETCH_FAIL', 'Empty response body.');

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_BYTES) {
      try {
        ac.abort();
      } catch {
        /* noop */
      }
      throw makeError(413, 'TOO_LARGE', 'Trang quá lớn (vượt 5 MB).');
    }
    chunks.push(value);
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const charset = ct.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase() || 'utf-8';
  return buf.toString(charset === 'utf-8' ? 'utf-8' : 'latin1');
}

interface FandomParseResponse {
  parse?: {
    title?: string;
    displaytitle?: string;
    text?: string;
  };
  error?: {
    code?: string;
    info?: string;
  };
}

interface FandomSiteInfoResponse {
  query?: {
    general?: {
      sitename?: string;
    };
  };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFandomViaApi(originalUrl: string, ac: AbortController): Promise<FetchResult> {
  const fandom = fandomApiEndpoint(originalUrl);
  if (!fandom) {
    throw makeError(502, 'FETCH_FAIL', 'Fandom URL không đúng định dạng /wiki/...');
  }

  const parseUrl = new URL(fandom.apiUrl);
  parseUrl.searchParams.set('action', 'parse');
  parseUrl.searchParams.set('page', fandom.pageTitle);
  parseUrl.searchParams.set('prop', 'text|displaytitle');
  parseUrl.searchParams.set('format', 'json');
  parseUrl.searchParams.set('formatversion', '2');
  parseUrl.searchParams.set('redirects', '1');
  parseUrl.searchParams.set('origin', '*');

  const siteInfoUrl = new URL(fandom.apiUrl);
  siteInfoUrl.searchParams.set('action', 'query');
  siteInfoUrl.searchParams.set('meta', 'siteinfo');
  siteInfoUrl.searchParams.set('siprop', 'general');
  siteInfoUrl.searchParams.set('format', 'json');
  siteInfoUrl.searchParams.set('formatversion', '2');
  siteInfoUrl.searchParams.set('origin', '*');

  const [parseRes, siteInfoRes] = await Promise.all([
    fetch(parseUrl, { signal: ac.signal, redirect: 'follow', headers: BROWSER_HEADERS }),
    fetch(siteInfoUrl, { signal: ac.signal, redirect: 'follow', headers: BROWSER_HEADERS }).catch(() => null),
  ]);

  if (!parseRes.ok) {
    throw makeError(502, 'FETCH_FAIL', `Fandom API trả về HTTP ${parseRes.status}.`);
  }

  const parseJson = (await parseRes.json()) as FandomParseResponse;
  if (parseJson.error) {
    throw makeError(
      502,
      'FETCH_FAIL',
      `Fandom API lỗi ${parseJson.error.code || 'unknown'}: ${parseJson.error.info || 'unknown'}`
    );
  }

  const siteInfoJson = siteInfoRes?.ok ? ((await siteInfoRes.json()) as FandomSiteInfoResponse) : null;
  const title = stripTags(parseJson.parse?.displaytitle || parseJson.parse?.title || fandom.pageTitle);
  const siteName = siteInfoJson?.query?.general?.sitename || 'Fandom';
  const articleHtml = parseJson.parse?.text || `<h1>${escapeHtml(title)}</h1>`;

  // Build a normal HTML document so the existing Cheerio/Readability extractor can keep working.
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} | ${escapeHtml(siteName)} | Fandom</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(originalUrl)}">
  <link rel="canonical" href="${escapeHtml(originalUrl)}">
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    ${articleHtml}
  </article>
</body>
</html>`;

  return { html, finalUrl: originalUrl };
}

export async function fetchHtml(urlString: string): Promise<FetchResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(urlString, {
      signal: ac.signal,
      redirect: 'follow',
      headers: BROWSER_HEADERS,
    });

    // Fandom often blocks direct server-side HTML requests from cloud/serverless IPs.
    // Use the supported MediaWiki API fallback instead of failing the whole extraction.
    if (!res.ok) {
      if ((res.status === 403 || res.status === 429) && isFandomWikiUrl(urlString)) {
        return await fetchFandomViaApi(urlString, ac);
      }
      throw makeError(502, 'FETCH_FAIL', `Trang web trả về HTTP ${res.status}.`);
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const finalUrl = res.url || urlString;

    // Some Fandom requests return an interstitial/block page with status 200.
    // Prefer the API when the final URL/page still looks like a Fandom wiki page.
    if (isFandomWikiUrl(finalUrl) && /text\/html/i.test(ct)) {
      const html = await readResponseText(res, ac);
      if (/captcha|blocked|enable javascript|access denied|forbidden/i.test(html.slice(0, 12000))) {
        return await fetchFandomViaApi(finalUrl, ac);
      }
      return { html, finalUrl };
    }

    // We do not OCR/parse PDFs here. Instead, accept PDF URLs and return a safe
    // pseudo HTML shell so the UI can still generate a report/document citation
    // and let the user refine author/date/report-number fields manually.
    if (ct.includes('application/pdf') || /\.pdf(?:\?|$)/i.test(finalUrl)) {
      return { html: pseudoHtmlForPdf(finalUrl), finalUrl };
    }

    if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
      throw makeError(415, 'NOT_HTML', `Content-Type không phải HTML (${ct}).`);
    }

    const html = await readResponseText(res, ac);
    return { html, finalUrl };
  } catch (err: unknown) {
    const e = err as { name?: string; status?: number; message?: string };
    if (e.name === 'AbortError') {
      throw makeError(504, 'TIMEOUT', 'Trang web phản hồi quá chậm (>8s).');
    }
    if (e.status) throw err;
    throw makeError(502, 'FETCH_FAIL', 'Không thể truy cập URL: ' + (e.message || 'unknown'));
  } finally {
    clearTimeout(timer);
  }
}
