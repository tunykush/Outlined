import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    name: 'Webpage with n.d. from uploaded reference list',
    source: 'webpage',
    data: {
      ...base,
      year: 'n.d.',
      title: 'Ford Motor Company',
      siteName: 'ERM',
      publisher: 'ERM',
      accessDate: '18 April 2026',
      url: 'https://www.erm.com/projects/ford-motor-company/',
    },
    expected: 'ERM (n.d.) Ford Motor Company, ERM website, accessed 18 April 2026. https://www.erm.com/projects/ford-motor-company/',
  },
  {
    name: 'Webpage preserves domain website name from uploaded reference list',
    source: 'webpage',
    data: {
      ...base,
      authors: [{ family: 'Handle', given: '', isOrganisation: true }],
      year: '2026',
      title: 'Restoring Investor Confidence Post-Crisis',
      siteName: 'handle.ae',
      publisher: 'handle.ae',
      accessDate: '18 April 2026',
      url: 'https://handle.ae/business-strategy/institutional-turnaround-strategy/restoring-investor-confidence/',
    },
    expected: 'Handle (2026) Restoring Investor Confidence Post-Crisis, handle.ae website, accessed 18 April 2026. https://handle.ae/business-strategy/institutional-turnaround-strategy/restoring-investor-confidence/',
  },
  {
    name: 'Journal keeps full five-author reference list',
    source: 'journal',
    data: {
      ...base,
      authors: [
        { family: 'Abdullah', given: 'A' },
        { family: 'Yamak', given: 'S' },
        { family: 'Korzhenitskaya', given: 'A' },
        { family: 'Rahimi', given: 'R' },
        { family: 'McClellan', given: 'J' },
      ],
      year: '2023',
      title: 'Sustainable development: The role of sustainability committees in achieving ESG targets',
      journal: 'Business Strategy and the Environment',
      volume: '33',
      issue: '3',
      pages: '2250–2268',
      doi: '10.1002/bse.3596',
    },
    expected: "Abdullah A, Yamak S, Korzhenitskaya A, Rahimi R and McClellan J (2023) 'Sustainable development: The role of sustainability committees in achieving ESG targets', Business Strategy and the Environment, 33(3):2250–2268, doi:10.1002/bse.3596.",
  },
  {
    name: 'Journal keeps full six-author reference list',
    source: 'journal',
    data: {
      ...base,
      authors: [
        { family: 'Meng', given: 'J J' },
        { family: 'Wang', given: 'X D' },
        { family: 'Xie', given: 'M Y' },
        { family: 'Hao', given: 'Z L' },
        { family: 'Yang', given: 'J L' },
        { family: 'Liu', given: 'Y B' },
      ],
      year: '2023',
      title: 'Ethical leadership and TMT decision-making of corporate social responsibility - a perspective of self-determination theory',
      journal: 'Frontiers in Psychology',
      volume: '14',
      doi: '10.3389/fpsyg.2023.1268091',
    },
    expected: "Meng JJ, Wang XD, Xie MY, Hao ZL, Yang JL and Liu YB (2023) 'Ethical leadership and TMT decision-making of corporate social responsibility - a perspective of self-determination theory', Frontiers in Psychology, 14, doi:10.3389/fpsyg.2023.1268091.",
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
