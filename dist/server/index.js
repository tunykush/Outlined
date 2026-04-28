/**
 * Server entry: Express app exposing /api/extract and /api/generate.
 *
 * /api/extract  — POST { url }  -> { ok, data, guessedType }
 * /api/generate — POST { style, source, data } -> { ok, output }
 */
import express from 'express';
import cors from 'cors';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../shared/citation-engine.js';
import { validateUrlSafety } from './safety.js';
import { fetchHtml } from './fetcher.js';
import { extractMetadata } from './extractor.js';
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
app.post('/api/extract', async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ ok: false, code: 'MISSING_URL', message: 'Vui lòng cung cấp URL.' });
    }
    try {
        const parsed = await validateUrlSafety(url.trim());
        const { html, finalUrl } = await fetchHtml(parsed.toString());
        const { data, guessedType } = extractMetadata(html, finalUrl || parsed.toString());
        return res.json({ ok: true, data, guessedType });
    }
    catch (err) {
        const e = err;
        return res.status(e.status || 500).json({
            ok: false,
            code: e.code || 'UNKNOWN_ERROR',
            message: e.message || 'Lỗi không xác định.',
        });
    }
});
app.post('/api/generate', (req, res) => {
    const { style, source, data } = req.body || {};
    if (!style || !source || !data) {
        return res
            .status(400)
            .json({ ok: false, code: 'MISSING_FIELDS', message: 'style, source và data đều bắt buộc.' });
    }
    try {
        const output = generate(style, source, data);
        return res.json({ ok: true, output });
    }
    catch (err) {
        const e = err;
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
