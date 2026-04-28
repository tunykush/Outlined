import { generate } from '../shared/citation-engine.js';
import type { CitationData, CitationStyle, SourceType } from '../shared/types.js';

type Req = { method?: string; body: Record<string, unknown> };
type Res = {
  status(code: number): Res;
  json(data: unknown): void;
  setHeader(name: string, value: string | string[]): void;
  end(body?: string): void;
};

export default function handler(req: Req, res: Res): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
    return;
  }

  const { style, source, data } = req.body || {};
  if (!style || !source || !data) {
    res.status(400).json({ ok: false, code: 'MISSING_FIELDS', message: 'style, source và data đều bắt buộc.' });
    return;
  }

  try {
    const output = generate(style as CitationStyle, source as SourceType, data as CitationData);
    res.json({ ok: true, output });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({
      ok: false,
      code: 'GENERATE_FAIL',
      message: e.message || 'Không generate được citation.',
    });
  }
}
