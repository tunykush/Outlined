/**
 * Fetch page metadata safely:
 *   - 8s timeout
 *   - 5 MB size cap for textual pages
 *   - Allows HTML/XML/text and lightweight PDF URL fallback
 *   - Follows redirects
 */
function makeError(status, code, message) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
function pseudoHtmlForPdf(finalUrl) {
    let filename = 'PDF document';
    try {
        filename = decodeURIComponent((new URL(finalUrl).pathname.split('/').pop() || 'PDF document')
            .replace(/\.pdf$/i, '')
            .replace(/[-_]+/g, ' '));
    }
    catch {
        /* ignore */
    }
    return `<html><head><title>${filename}</title><meta property="og:type" content="article" /></head><body><h1>${filename}</h1></body></html>`;
}
export async function fetchHtml(urlString) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(urlString, {
            signal: ac.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; OutlinedBot/1.0; reference-generator)',
                Accept: 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        });
        if (!res.ok) {
            throw makeError(502, 'FETCH_FAIL', `Trang web trả về HTTP ${res.status}.`);
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const finalUrl = res.url || urlString;
        // We do not OCR/parse PDFs here. Instead, accept PDF URLs and return a safe
        // pseudo HTML shell so the UI can still generate a report/document citation
        // and let the user refine author/date/report-number fields manually.
        if (ct.includes('application/pdf') || /\.pdf(?:\?|$)/i.test(finalUrl)) {
            return { html: pseudoHtmlForPdf(finalUrl), finalUrl };
        }
        if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
            throw makeError(415, 'NOT_HTML', `Content-Type không phải HTML (${ct}).`);
        }
        if (!res.body) {
            throw makeError(502, 'FETCH_FAIL', 'Empty response body.');
        }
        const reader = res.body.getReader();
        const chunks = [];
        let total = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            total += value.length;
            if (total > MAX_BYTES) {
                try {
                    ac.abort();
                }
                catch { /* noop */ }
                throw makeError(413, 'TOO_LARGE', 'Trang quá lớn (vượt 5 MB).');
            }
            chunks.push(value);
        }
        const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        let charset = 'utf-8';
        const m = ct.match(/charset=([^;]+)/i);
        if (m)
            charset = m[1].trim().toLowerCase();
        const html = buf.toString(charset === 'utf-8' ? 'utf-8' : 'latin1');
        return { html, finalUrl };
    }
    catch (err) {
        const e = err;
        if (e.name === 'AbortError') {
            throw makeError(504, 'TIMEOUT', 'Trang web phản hồi quá chậm (>8s).');
        }
        if (e.status)
            throw err;
        throw makeError(502, 'FETCH_FAIL', 'Không thể truy cập URL: ' + (e.message || 'unknown'));
    }
    finally {
        clearTimeout(timer);
    }
}
