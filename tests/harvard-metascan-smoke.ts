import assert from 'node:assert/strict';
import { extractMetadata } from '../src/server/extractor.js';
import { emptyCitationData, generate } from '../src/shared/citation-engine.js';
import { metascanHarvard } from '../src/shared/citation/harvard-metascan.js';

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const newsHtml = `<!doctype html>
<html>
<head>
  <title>Hai doc thoai: Su dung tuc lai thanh dac san? | Tuoi Tre</title>
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": "Hai doc thoai: Su dung tuc lai thanh dac san?",
      "datePublished": "2023-02-12T22:29:54+07:00",
      "author": { "@type": "Person", "name": "Tien Vu" },
      "publisher": { "@type": "Organization", "name": "Tuoi Tre" }
    }
  </script>
</head>
<body><h1>Hai doc thoai: Su dung tuc lai thanh dac san?</h1></body>
</html>`;

const harvardNews = await extractMetadata(
  newsHtml,
  'https://tuoitre.vn/hai-doc-thoai-su-dung-tuc-lai-thanh-dac-san-20230212222954425.htm',
  'harvard'
);
assert.equal(harvardNews.guessedType, 'webpage');
assert.equal(harvardNews.data.siteName, 'Tuoi Tre');

const apaNews = await extractMetadata(
  newsHtml,
  'https://tuoitre.vn/hai-doc-thoai-su-dung-tuc-lai-thanh-dac-san-20230212222954425.htm',
  'apa7'
);
assert.equal(apaNews.guessedType, 'newspaper-online');

const pdfShell = '<html><head><title>Human trafficking in post-COVID Vietnam</title><meta property="og:type" content="article"></head><body></body></html>';
const pdfResult = await extractMetadata(
  pdfShell,
  'https://www.bluedragon.org/wp-content/uploads/2024/03/Human-trafficking-in-post-Covid-Vietnam.pdf',
  'harvard'
);
assert.equal(pdfResult.guessedType, 'webpage-document');

const creativeFlair = await extractMetadata(
  '<html><head><title>The Effects of Art and Culture on Todays Modern Society</title><meta property="og:type" content="article"></head><body><h1>The Effects of Art and Culture on Todays Modern Society</h1></body></html>',
  'https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/',
  'harvard'
);
assert.equal(creativeFlair.guessedType, 'webpage');
assert.equal(creativeFlair.data.siteName, 'Creative Flair');

const base = emptyCitationData();
const webData = {
  ...base,
  year: '2024',
  title: 'The Effects of Art and Culture on Todays Modern Society',
  siteName: 'Creative Flair',
  publisher: 'Creative Flair',
  accessDate: '5 September 2024',
  url: 'https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/',
};

const repaired = metascanHarvard('webpage', webData, {
  reference: 'Creative Flair. (2024). The Effects of Art and Culture on Todays Modern Society, Creative Flair, accessed September 5, 2024. https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/.',
  intextParaphrase: '',
  intextQuote: '',
  intextNarrative: '',
  notes: [],
});
assert.equal(
  strip(repaired.reference),
  'Creative Flair (2024) The Effects of Art and Culture on Todays Modern Society, Creative Flair website, accessed 5 September 2024. https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/'
);
assert(repaired.notes.some((note) => note.includes('HARVARD_APA_LEAD_REPAIRED')));
assert(repaired.notes.some((note) => note.includes('HARVARD_ACCESS_DATE_REPAIRED')));
assert(repaired.notes.some((note) => note.includes('HARVARD_WEBSITE_LABEL_REPAIRED')));

const generated = generate('harvard', 'webpage', webData);
assert(generated.notes.some((note) => note.startsWith('RMIT Harvard metascan confidence:')));
assert(!generated.notes.some((note) => note.includes('no author/byline detected')));

const sourceEvidence = metascanHarvard('newspaper-online', webData, {
  reference: 'Creative Flair (2024) The Effects of Art and Culture on Todays Modern Society, Creative Flair website, accessed 5 September 2024. https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/',
  intextParaphrase: '',
  intextQuote: '',
  intextNarrative: '',
  notes: [],
});
assert(sourceEvidence.notes.some((note) => note.includes('HARVARD_SOURCE_EVIDENCE')));

const quoteRepair = metascanHarvard('journal', {
  ...base,
  authors: [{ family: 'Danielle', given: 'J' }],
  year: '2025',
  title: 'Leveraging the power of human resource analytics for enhanced decision making: opportunities and challenges',
  journal: 'International Journal of Research in Business and Social Science',
  volume: '14',
  issue: '6',
  pages: '53–69',
  doi: '10.20525/ijrbs.v14i6.4276',
}, {
  reference: "Danielle J (2025) 'Leveraging the power of human resource analytics for enhanced decision making: opportunities and challenges', International Journal of Research in Business and Social Science, 14(6):53–69, doi:10.20525/ijrbs.v14i6.4276.",
  intextParaphrase: '',
  intextQuote: '',
  intextNarrative: '',
  notes: [],
});
assert(strip(quoteRepair.reference).includes('‘Leveraging the power of human resource analytics for enhanced decision making: opportunities and challenges’'));
assert(quoteRepair.notes.some((note) => note.includes('HARVARD_TITLE_QUOTES_REPAIRED')));

console.log('PASS: Harvard metascan style-aware source detection');
