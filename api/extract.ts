import { validateUrlSafety } from '../src/server/safety.js';
import { fetchHtml } from '../src/server/fetcher.js';
import { extractMetadata } from '../src/server/extractor.js';
import { doiUrl, lookupReferenceIdentifier, parseReferenceIdentifier } from '../src/server/reference-lookup.js';
import type { CitationStyle } from '../src/shared/types.js';

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
    const rawInput = url.trim();
    const identifier = parseReferenceIdentifier(rawInput);
    if (identifier) {
      const lookedUp = await lookupReferenceIdentifier(identifier);
      if (lookedUp) {
        res.json({ ok: true, data: lookedUp.data, guessedType: lookedUp.guessedType });
        return;
      }
      if (!identifier.fromUrl) {
        res.status(502).json({
          ok: false,
          code: 'IDENTIFIER_LOOKUP_FAIL',
          message: identifier.kind === 'doi'
            ? 'Không tìm được metadata cho DOI này.'
            : 'Không tìm được metadata cho PubMed ID này.',
        });
        return;
      }
    }

    const fetchTarget = identifier?.kind === 'doi' ? doiUrl(identifier.value) : rawInput;
    const parsed = await validateUrlSafety(fetchTarget);
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
