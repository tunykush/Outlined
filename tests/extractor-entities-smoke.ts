/**
 * Smoke tests for HTML numeric character reference decoding in the extractor.
 *
 * Some Vietnamese news CMS templates double-encode their meta tags, leaving
 * literal "Ti&#7870;n V&#361;" in the rendered HTML. Cheerio cannot decode
 * those because the ampersand itself was escaped — the extractor has to do
 * a second pass.
 *
 * These tests pin down the decode + NFC normalisation behaviour.
 */

import { extractMetadata } from '../src/server/extractor.js';

interface Case {
  name: string;
  html: string;
  baseUrl: string;
  expect: (data: { authors?: Array<{ family?: string; given?: string }>; title?: string }) => boolean;
  describeExpected: string;
}

function html(head: string, body = ''): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

const cases: Case[] = [
  {
    name: 'Decimal NCRs in meta[name="author"] decode to Vietnamese',
    // "Ti&#7870;n V&#361;" should become "TiẾn Vũ" — capital Ế is U+1EBE = 7870.
    html: html('<meta name="author" content="Ti&amp;#7870;n V&amp;#361;">'),
    baseUrl: 'https://tuoitre.vn/example.htm',
    expect: (d) => {
      const a = d.authors?.[0];
      const fam = (a?.family || '').normalize('NFC');
      const giv = (a?.given || '').normalize('NFC');
      // Family is the first word in Vietnamese order
      return fam === 'TiẾn' && giv === 'Vũ';
    },
    describeExpected: 'authors[0].family = "TiẾn", given = "Vũ" (decoded + NFC)',
  },
  {
    name: 'Hex NCRs decode the same way',
    // 0x1EBF = ế (lowercase). "Ti&#x1EBF;n" → "Tiến"
    html: html('<meta name="author" content="Ti&amp;#x1EBF;n V&amp;#x0169;">'),
    baseUrl: 'https://example.vn/x',
    expect: (d) => {
      const a = d.authors?.[0];
      return (a?.family || '').normalize('NFC') === 'Tiến' && (a?.given || '').normalize('NFC') === 'Vũ';
    },
    describeExpected: 'authors[0].family = "Tiến", given = "Vũ"',
  },
  {
    name: 'Plain ASCII meta[name="author"] is untouched',
    html: html('<meta name="author" content="Sarah Johnson">'),
    baseUrl: 'https://example.com/x',
    expect: (d) => {
      const a = d.authors?.[0];
      // Sarah is given, Johnson is family (Western order, last word = family)
      return a?.family === 'Johnson' && a?.given === 'Sarah';
    },
    describeExpected: 'authors[0].family = "Johnson", given = "Sarah"',
  },
  {
    name: 'NCR in og:title decodes for the title field',
    html: html(
      '<meta property="og:title" content="H&amp;#224;i đ&amp;#7897;c tho&amp;#7841;i">',
    ),
    baseUrl: 'https://example.vn/x',
    expect: (d) => (d.title || '').normalize('NFC') === 'Hài độc thoại',
    describeExpected: 'title = "Hài độc thoại"',
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { data } = await extractMetadata(c.html, c.baseUrl);
  const ok = c.expect({
    authors: data.authors as Array<{ family?: string; given?: string }>,
    title: data.title,
  });
  if (ok) {
    console.log(`PASS: ${c.name}`);
    pass++;
  } else {
    const actualAuthor = data.authors?.[0]
      ? `family="${data.authors[0].family}", given="${data.authors[0].given}"`
      : '(no authors)';
    console.log(
      `FAIL: ${c.name}\n  Expected: ${c.describeExpected}\n  Actual:   ${actualAuthor}, title="${data.title || ''}"`,
    );
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} entity-decode tests passed.`);
if (fail > 0) process.exit(1);
