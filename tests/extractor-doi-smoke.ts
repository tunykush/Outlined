/**
 * Smoke tests for the multi-layer DOI scanner in src/server/extractor.ts.
 *
 * Each fixture is a small synthetic HTML page exercising one of the priority
 * layers (meta tag, JSON-LD identifier, anchor link, body text, URL itself)
 * plus a priority test where multiple layers expose DOIs and the highest
 * priority must win.
 */

import { extractMetadata } from '../src/server/extractor.js';

interface Case {
  name: string;
  html: string;
  baseUrl: string;
  expectedDoi: string;
}

const baseHtml = (body: string): string => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

const cases: Case[] = [
  {
    name: 'Layer 1: citation_doi meta tag',
    html: '<!doctype html><html><head><meta name="citation_doi" content="10.1038/s41586-024-07234-x"></head><body></body></html>',
    baseUrl: 'https://example.com/article',
    expectedDoi: '10.1038/s41586-024-07234-x',
  },
  {
    name: 'Layer 1: dc.identifier.doi meta tag',
    html: '<!doctype html><html><head><meta name="dc.identifier.doi" content="10.1016/j.ijpe.2012.01.035"></head><body></body></html>',
    baseUrl: 'https://example.com/x',
    expectedDoi: '10.1016/j.ijpe.2012.01.035',
  },
  {
    name: 'Layer 2: JSON-LD identifier as plain string',
    html: baseHtml(
      '<script type="application/ld+json">{"@type":"ScholarlyArticle","identifier":"10.1234/abc.123","name":"X"}</script>'
    ),
    baseUrl: 'https://example.com/x',
    expectedDoi: '10.1234/abc.123',
  },
  {
    name: 'Layer 2: JSON-LD identifier as object with propertyID DOI',
    html: baseHtml(
      '<script type="application/ld+json">{"@type":"Article","identifier":{"@type":"PropertyValue","propertyID":"DOI","value":"10.5555/12345-abc.7"},"name":"Y"}</script>'
    ),
    baseUrl: 'https://example.com/y',
    expectedDoi: '10.5555/12345-abc.7',
  },
  {
    name: 'Layer 2: JSON-LD sameAs array containing doi.org URL',
    html: baseHtml(
      '<script type="application/ld+json">{"@type":"Article","sameAs":["https://example.com/page","https://doi.org/10.7717/peerj.99"],"name":"Z"}</script>'
    ),
    baseUrl: 'https://example.com/z',
    expectedDoi: '10.7717/peerj.99',
  },
  {
    name: 'Layer 3: anchor href to doi.org',
    html: baseHtml('<p>See <a href="https://doi.org/10.1002/bse.3596">the paper</a>.</p>'),
    baseUrl: 'https://example.com/p',
    expectedDoi: '10.1002/bse.3596',
  },
  {
    name: 'Layer 4: visible text with "doi:" cue',
    html: baseHtml('<p>Reference: doi: 10.3389/fpsyg.2024.01234</p>'),
    baseUrl: 'https://example.com/q',
    expectedDoi: '10.3389/fpsyg.2024.01234',
  },
  {
    name: 'Layer 4: visible text with "doi.org/" cue',
    html: baseHtml('<footer>Cite as doi.org/10.1145/3580305.3599876</footer>'),
    baseUrl: 'https://example.com/r',
    expectedDoi: '10.1145/3580305.3599876',
  },
  {
    name: 'Layer 5: DOI in the page URL itself (publisher redirect)',
    html: baseHtml('<p>No DOI in body.</p>'),
    baseUrl: 'https://link.springer.com/article/10.1007/s11192-022-04561-w',
    expectedDoi: '10.1007/s11192-022-04561-w',
  },
  {
    name: 'Priority: meta tag wins over JSON-LD',
    html:
      '<!doctype html><html><head><meta name="citation_doi" content="10.1111/winner"></head><body>' +
      '<script type="application/ld+json">{"@type":"Article","identifier":"10.2222/jsonld"}</script>' +
      '</body></html>',
    baseUrl: 'https://example.com/p',
    expectedDoi: '10.1111/winner',
  },
  {
    name: 'Priority: JSON-LD wins over anchor',
    html: baseHtml(
      '<script type="application/ld+json">{"@type":"Article","identifier":"10.1111/jsonld"}</script>' +
      '<a href="https://doi.org/10.2222/anchor">link</a>'
    ),
    baseUrl: 'https://example.com/p',
    expectedDoi: '10.1111/jsonld',
  },
  {
    name: 'Trailing punctuation stripped',
    html: baseHtml('<p>doi: 10.1093/test.123).</p>'),
    baseUrl: 'https://example.com/q',
    expectedDoi: '10.1093/test.123',
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { data } = await extractMetadata(c.html, c.baseUrl);
  const actual = String(data.doi || '');
  if (actual === c.expectedDoi) {
    console.log(`PASS: ${c.name}`);
    pass++;
  } else {
    console.log(`FAIL: ${c.name}\n  Expected: ${c.expectedDoi}\n  Actual:   ${actual}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} DOI scanner tests passed.`);
if (fail > 0) process.exit(1);
