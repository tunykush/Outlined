import assert from 'node:assert/strict';
import {
  crossrefWorkToExtraction,
  doiUrl,
  openAlexWorkToExtraction,
  parseReferenceIdentifier,
  pubMedSummaryToExtraction,
} from '../src/server/reference-lookup.js';

const doi = parseReferenceIdentifier('doi:10.3390/soc14040051');
assert.deepEqual(doi, { kind: 'doi', value: '10.3390/soc14040051', fromUrl: false });
assert.equal(doiUrl('https://doi.org/10.3390/soc14040051.'), 'https://doi.org/10.3390/soc14040051');

const doiFromUrl = parseReferenceIdentifier('https://doi.org/10.1016/j.envres.2021.110725');
assert.deepEqual(doiFromUrl, { kind: 'doi', value: '10.1016/j.envres.2021.110725', fromUrl: true });

const pmid = parseReferenceIdentifier('https://pubmed.ncbi.nlm.nih.gov/38218182/');
assert.deepEqual(pmid, { kind: 'pmid', value: '38218182', fromUrl: true });

const crossrefJournal = crossrefWorkToExtraction({
  type: 'journal-article',
  title: ['Vulnerability to sex trafficking'],
  author: [
    { family: 'Andrade-Rubio', given: 'K. L.' },
    { family: 'Moral-de-la-Rubia', given: 'J.' },
  ],
  'published-online': { 'date-parts': [[2024, 4, 5]] },
  'container-title': ['Societies'],
  volume: '14',
  issue: '4',
  page: '51',
  DOI: '10.3390/soc14040051',
});

assert.equal(crossrefJournal.guessedType, 'journal');
assert.equal(crossrefJournal.data.title, 'Vulnerability to sex trafficking');
assert.equal(crossrefJournal.data.journal, 'Societies');
assert.equal(crossrefJournal.data.month, 'April');
assert.equal(crossrefJournal.data.doi, '10.3390/soc14040051');

const crossrefChapter = crossrefWorkToExtraction({
  type: 'book-chapter',
  title: ['Human resource analytics'],
  author: [{ family: 'Danielle', given: 'J.' }],
  issued: { 'date-parts': [[2025]] },
  'container-title': ['Handbook of workplace analytics'],
  publisher: 'Routledge',
  DOI: '10.4324/example',
});

assert.equal(crossrefChapter.guessedType, 'book-chapter');
assert.equal(crossrefChapter.data.bookTitle, 'Handbook of workplace analytics');
assert.equal(crossrefChapter.data.publisher, 'Routledge');

const openAlex = openAlexWorkToExtraction({
  title: 'Environmental health article',
  type_crossref: 'journal-article',
  publication_date: '2021-06-10',
  doi: 'https://doi.org/10.1016/j.envres.2021.110725',
  authorships: [{ author: { display_name: 'Jane Smith' } }],
  primary_location: { source: { display_name: 'Environmental Research' } },
  biblio: { volume: '190', first_page: '110725' },
});

assert.equal(openAlex.guessedType, 'journal');
assert.equal(openAlex.data.year, '2021');
assert.equal(openAlex.data.day, '10');
assert.equal(openAlex.data.pages, '110725');

const pubmed = pubMedSummaryToExtraction({
  uid: '38218182',
  title: 'A PubMed indexed article.',
  fulljournalname: 'Journal of Public Health',
  pubdate: '2024 Apr 15',
  volume: '12',
  issue: '2',
  pages: '100-110',
  authors: [{ name: 'Nguyen TM' }, { name: 'Smith JA' }],
  articleids: [{ idtype: 'doi', value: '10.1000/example' }],
});

assert.equal(pubmed.guessedType, 'journal');
assert.equal(pubmed.data.title, 'A PubMed indexed article');
assert.equal(pubmed.data.authors?.[0]?.family, 'Nguyen');
assert.equal(pubmed.data.authors?.[0]?.given, 'T. M.');
assert.equal(pubmed.data.url, 'https://doi.org/10.1000/example');

console.log('PASS: reference identifier and scholarly metadata mapping');
