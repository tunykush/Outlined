/**
 * Server entry: Express app exposing /api/extract and /api/generate.
 *
 * /api/extract  — POST { url }  -> { ok, data, guessedType }
 * /api/generate — POST { style, source, data } -> { ok, output }
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CitationData,
  CitationStyle,
  SourceType,
  ExtractResult,
} from '../shared/types.js';
import { generate } from '../shared/citation-engine.js';
import { validateUrlSafety } from './safety.js';
import { fetchHtml } from './fetcher.js';
import { extractMetadata } from './extractor.js';
import { doiUrl, lookupReferenceIdentifier, parseReferenceIdentifier } from './reference-lookup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '64kb' }));

// Static frontend
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

/* -------- routes -------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

interface ExtractBody {
  url?: string;
  style?: CitationStyle;
}

app.post('/api/extract', async (req: Request<unknown, unknown, ExtractBody>, res: Response<ExtractResult>) => {
  const { url, style } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, code: 'MISSING_URL', message: 'Vui lòng cung cấp URL.' });
  }

  try {
    const rawInput = url.trim();
    const identifier = parseReferenceIdentifier(rawInput);
    if (identifier) {
      const lookedUp = await lookupReferenceIdentifier(identifier);
      if (lookedUp) return res.json({ ok: true, data: lookedUp.data, guessedType: lookedUp.guessedType });
      if (!identifier.fromUrl) {
        return res.status(502).json({
          ok: false,
          code: 'IDENTIFIER_LOOKUP_FAIL',
          message: identifier.kind === 'doi'
            ? 'Không tìm được metadata cho DOI này.'
            : 'Không tìm được metadata cho PubMed ID này.',
        });
      }
    }

    const fetchTarget = identifier?.kind === 'doi' ? doiUrl(identifier.value) : rawInput;
    const parsed = await validateUrlSafety(fetchTarget);
    const { html, finalUrl } = await fetchHtml(parsed.toString());
    const extractionStyle = style === 'apa7' || style === 'harvard' || style === 'ieee' ? style : undefined;
    const { data, guessedType } = await extractMetadata(html, finalUrl || parsed.toString(), extractionStyle);
    return res.json({ ok: true, data, guessedType });
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    return res.status(e.status || 500).json({
      ok: false,
      code: e.code || 'UNKNOWN_ERROR',
      message: e.message || 'Lỗi không xác định.',
    });
  }
});

interface GenerateBody {
  style?: CitationStyle;
  source?: SourceType;
  data?: CitationData;
}

app.post('/api/generate', (req: Request<unknown, unknown, GenerateBody>, res: Response) => {
  const { style, source, data } = req.body || {};
  if (!style || !source || !data) {
    return res
      .status(400)
      .json({ ok: false, code: 'MISSING_FIELDS', message: 'style, source và data đều bắt buộc.' });
  }

  try {
    const output = generate(style, source, data);
    return res.json({ ok: true, output });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return res.status(500).json({
      ok: false,
      code: 'GENERATE_FAIL',
      message: e.message || 'Không generate được citation.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`✓ Outlined running at http://localhost:${PORT}`);
  console.log(`  POST /api/extract  { "url": "..." }`);
  console.log(`  POST /api/generate { style, source, data }`);
});
