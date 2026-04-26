/**
 * Fetch HTML safely:
 *   - 8s timeout
 *   - 5 MB size cap
 *   - Only HTML/XML content types
 *   - Follows redirects
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

export interface FetchResult {
  html: string;
  finalUrl: string;
}

export async function fetchHtml(urlString: string): Promise<FetchResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(urlString, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; EasyCiteBot/1.0; reference-generator)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!res.ok) {
      throw makeError(
        502,
        'FETCH_FAIL',
        `Trang web trả về HTTP ${res.status}.`
      );
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) {
      throw makeError(415, 'NOT_HTML', `Content-Type không phải HTML (${ct}).`);
    }

    if (!res.body) {
      throw makeError(502, 'FETCH_FAIL', 'Empty response body.');
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > MAX_BYTES) {
        try { ac.abort(); } catch { /* noop */ }
        throw makeError(413, 'TOO_LARGE', 'Trang quá lớn (vượt 5 MB).');
      }
      chunks.push(value);
    }

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    let charset = 'utf-8';
    const m = ct.match(/charset=([^;]+)/i);
    if (m) charset = m[1].trim().toLowerCase();
    const html = buf.toString(charset === 'utf-8' ? 'utf-8' : 'latin1');
    return { html, finalUrl: res.url };
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
