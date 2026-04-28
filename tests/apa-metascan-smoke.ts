import assert from 'node:assert/strict';
import { emptyCitationData, generate } from '../src/shared/citation-engine.js';
import { metascanApa7 } from '../src/shared/citation/apa-metascan.js';

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const base = emptyCitationData();

const noAuthorNews = {
  ...base,
  year: '2016',
  month: 'May',
  day: '2',
  title: 'Budget to link school spending to outcomes',
  publisher: 'The Australian',
  url: 'https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a',
};

const repairedNews = metascanApa7('newspaper-online', noAuthorNews, {
  reference: 'The Australian. (2016, May 2). Budget to link school spending to outcomes. The Australian. https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a.',
  intextParaphrase: '(The Australian, 2016)',
  intextQuote: '(The Australian, 2016, p./para. needed)',
  intextNarrative: 'The Australian (2016)',
  notes: [],
});

assert.equal(
  strip(repairedNews.reference),
  'Budget to link school spending to outcomes. (2016, May 2). The Australian. https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a'
);
assert.equal(repairedNews.intextParaphrase, '(&quot;Budget to link&quot;, 2016)');
assert(repairedNews.notes.some((note) => note.includes('APA_NO_AUTHOR_NEWS_REPAIRED')));
assert(repairedNews.notes.some((note) => note.includes('APA_URL_PERIOD_REPAIRED')));

const generatedNews = generate('apa7', 'newspaper-online', noAuthorNews);
assert.equal(
  strip(generatedNews.reference),
  'Budget to link school spending to outcomes. (2016, May 2). The Australian. https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a'
);
assert(generatedNews.notes.some((note) => note.startsWith('APA 7 metascan confidence:')));

const journal = metascanApa7('journal', {
  ...base,
  authors: [{ family: 'Andrade-Rubio', given: 'K. L.' }, { family: 'Moral-de-la-Rubia', given: 'J.' }, { family: 'Izcara-Palacios', given: 'S. P.' }],
  year: '2024',
  title: "Vulnerability to Sex Trafficking: Adult Women's Experiences While They Were Adolescents",
  journal: 'Societies',
  volume: '14',
  issue: '4',
  articleNumber: '51',
  doi: '10.3390/soc14040051',
}, {
  reference: "Andrade-Rubio, K. L., Moral-de-la-Rubia, J., & Izcara-Palacios, S. P. (2024). Vulnerability to Sex Trafficking: Adult Women's Experiences While They Were Adolescents. Societies, 14(4), 51. doi:10.3390/soc14040051.",
  intextParaphrase: '',
  intextQuote: '',
  intextNarrative: '',
  notes: [],
});

assert(strip(journal.reference).endsWith('https://doi.org/10.3390/soc14040051'));
assert(journal.notes.some((note) => note.includes('APA_DOI_URL_REPAIRED')));

const changingPage = generate('apa7', 'webpage', {
  ...base,
  authors: [{ family: 'Special Nhan Dan', given: '', isOrganisation: true }],
  year: 'n.d.',
  title: 'Hmong ethnic group',
  siteName: 'Special Nhan Dan',
  accessDate: '4 December 2025',
  url: 'https://special.nhandan.vn/hmong-ethnic-group/index.html',
});
assert(changingPage.notes.some((note) => note.includes('APA_RETRIEVAL_DATE_CONSIDER')));

console.log('PASS: APA 7 metascan repairs and evidence checks');
