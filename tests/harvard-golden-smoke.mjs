import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'src/shared/citation/styles/harvard.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod, require, console });
const { generateHarvard } = mod.exports;

const base = {
  authors: [], referenceAuthorText: '', year: '', month: '', day: '', title: '', url: '', accessDate: '',
  quotePage: '', quotePages: '', quoteSection: '', quoteParagraph: '', timestamp: '', siteName: '', publisher: '',
  journal: '', volume: '', issue: '', pages: '', articleNumber: '', doi: '', edition: '', place: '', bookTitle: '',
  editors: [], editorsText: '', translatorsText: '', originalYear: '', username: '', platform: '', description: '',
  postType: '', format: '', seriesTitle: '', season: '', episode: '', productionCompanies: '', writersText: '',
  directorsText: '', producersText: '', hostRole: '', reportNumber: '', institution: '', repository: '', jurisdiction: '',
  section: '', reporter: '', volumeLegal: '', startingPage: '', appendix: '', toolName: '',
};

const fixtures = [
  {
    name: 'PRSA webpage from uploaded class reference list',
    source: 'webpage',
    data: {
      ...base,
      authors: [{ family: 'Bermudez', given: 'Heather' }, { family: 'Izquierdo', given: 'Aileen' }],
      referenceAuthorText: 'Bermudez et al.',
      year: '2020',
      title: 'Trust and Transparency in Times of Crisis',
      siteName: 'PRSA',
      publisher: 'PRSA',
      accessDate: '19 April 2026',
      url: 'https://www.prsa.org/article/trust-and-transparency-in-times-of-crisis',
    },
    expected: 'Bermudez et al. (2020) Trust and Transparency in Times of Crisis, PRSA website, accessed 19 April 2026. https://www.prsa.org/article/trust-and-transparency-in-times-of-crisis',
  },
  {
    name: 'Forbes webpage with full publication date',
    source: 'webpage',
    data: {
      ...base,
      authors: [{ family: 'Ferreira', given: '' }],
      year: '2024', month: 'February', day: '12',
      title: 'Transparency: The Only Sustainable Way Forward',
      siteName: 'Forbes', publisher: 'Forbes', accessDate: '19 April 2026',
      url: 'https://www.forbes.com/sites/forbesbooksauthors/2024/02/12/transparency-the-only-sustainable-way-forward',
    },
    expected: 'Ferreira (12 February 2024) Transparency: The Only Sustainable Way Forward, Forbes website, accessed 19 April 2026. https://www.forbes.com/sites/forbesbooksauthors/2024/02/12/transparency-the-only-sustainable-way-forward',
  },
  {
    name: 'Journal with pages and DOI',
    source: 'journal',
    data: {
      ...base,
      authors: [{ family: 'Gimenez', given: 'C' }, { family: 'Sierra', given: 'V' }, { family: 'Rodon', given: 'J' }],
      year: '2012', title: 'Sustainable operations: their impact on the triple bottom line',
      journal: 'International Journal of Production Economics', volume: '140', issue: '1', pages: '149–159',
      doi: '10.1016/j.ijpe.2012.01.035',
    },
    expected: "Gimenez C, Sierra V and Rodon J (2012) 'Sustainable operations: their impact on the triple bottom line', International Journal of Production Economics, 140(1):149–159, doi:10.1016/j.ijpe.2012.01.035.",
  },
];

let failed = 0;
for (const f of fixtures) {
  const actual = generateHarvard(f.source, f.data).reference.replace(/<[^>]+>/g, '');
  if (actual !== f.expected) {
    failed++;
    console.error(`FAIL: ${f.name}\nExpected: ${f.expected}\nActual:   ${actual}\n`);
  } else {
    console.log(`PASS: ${f.name}`);
  }
}
if (failed) process.exit(1);
