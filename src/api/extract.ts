import { validateUrlSafety } from '../server/safety.js';
import { fetchHtml } from '../server/fetcher.js';
import { extractMetadata } from '../server/extractor.js';
import type { CitationStyle } from '../shared/types.js';

type Req = { method?: string; body: Record<string, unknown> };
type Res = {
  status(code: number): Res;
  json(data: unknown): void;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
};

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
    return;
  }

  const { url, style } = req.body || {};
  if (!url || typeof url !== 'string') {
    res.status(400).json({ ok: false, code: 'MISSING_URL', message: 'Vui lòng cung cấp URL.' });
    return;
  }

  try {
    const parsed = await validateUrlSafety(url.trim());
    const { html, finalUrl } = await fetchHtml(parsed.toString());
    const extractionStyle: CitationStyle | undefined = style === 'apa7' || style === 'harvard' || style === 'ieee'
      ? style
      : undefined;
    const { data, guessedType } = await extractMetadata(html, finalUrl || parsed.toString(), extractionStyle);
    res.json({ ok: true, data, guessedType });
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    res.status(e.status || 500).json({
      ok: false,
      code: e.code || 'UNKNOWN_ERROR',
      message: e.message || 'Lỗi không xác định.',
    });
  }
}
