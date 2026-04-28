import assert from 'node:assert/strict';
import { extractMetadata } from '../src/server/extractor.js';

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

console.log('PASS: Harvard metascan style-aware source detection');
