import { generate } from '../src/shared/citation-engine.js';
import { emptyCitationData } from '../src/shared/citation-engine.js';
import type { CitationData, CitationStyle, SourceType } from '../src/shared/types.js';

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const base = emptyCitationData();

type Fixture = {
  name: string;
  style: CitationStyle;
  source: SourceType;
  data: Partial<CitationData>;
  expected: string;
};

const fixtures: Fixture[] = [
  {
    name: 'RMIT Harvard PRSA webpage from uploaded class reference list',
    style: 'harvard',
    source: 'webpage',
    data: {
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
    name: 'RMIT Harvard webpage with full publication date',
    style: 'harvard',
    source: 'webpage',
    data: {
      authors: [{ family: 'Ferreira', given: '' }],
      year: '2024', month: 'February', day: '12',
      title: 'Transparency: The Only Sustainable Way Forward',
      siteName: 'Forbes', publisher: 'Forbes', accessDate: '19 April 2026',
      url: 'https://www.forbes.com/sites/forbesbooksauthors/2024/02/12/transparency-the-only-sustainable-way-forward',
    },
    expected: 'Ferreira (12 February 2024) Transparency: The Only Sustainable Way Forward, Forbes website, accessed 19 April 2026. https://www.forbes.com/sites/forbesbooksauthors/2024/02/12/transparency-the-only-sustainable-way-forward',
  },
  {
    name: 'RMIT Harvard journal with DOI',
    style: 'harvard',
    source: 'journal',
    data: {
      authors: [{ family: 'Gimenez', given: 'C' }, { family: 'Sierra', given: 'V' }, { family: 'Rodon', given: 'J' }],
      year: '2012', title: 'Sustainable operations: their impact on the triple bottom line',
      journal: 'International Journal of Production Economics', volume: '140', issue: '1', pages: '149–159',
      doi: '10.1016/j.ijpe.2012.01.035',
    },
    expected: "Gimenez C, Sierra V and Rodon J (2012) 'Sustainable operations: their impact on the triple bottom line', International Journal of Production Economics, 140(1):149–159, doi:10.1016/j.ijpe.2012.01.035.",
  },
  {
    name: 'RMIT Harvard journal with pages and article number',
    style: 'harvard',
    source: 'journal',
    data: {
      authors: [{ family: 'Mohsin', given: 'M' }, { family: 'Ghosh', given: 'T' }, { family: 'Hoque', given: 'N' }],
      year: '2025', title: 'Prediction and optimization of strength and CO2 emission for geopolymer concrete mix design using machine learning',
      journal: 'Results in Materials', volume: '28', pages: '1-18', articleNumber: '100791', doi: '10.1016/j.rinma.2025.100791',
    },
    expected: "Mohsin M, Ghosh T and Hoque N (2025) 'Prediction and optimization of strength and CO2 emission for geopolymer concrete mix design using machine learning', Results in Materials, 28:1-18, Article 100791, doi:10.1016/j.rinma.2025.100791.",
  },
  {
    name: 'APA 7th webpage, org author same as site',
    style: 'apa7',
    source: 'webpage',
    data: {
      authors: [{ family: 'Early Childhood Australia', given: '', isOrganisation: true }],
      year: '2016', title: 'Early Childhood Australia’s advocacy: Advocacy goals',
      siteName: 'Early Childhood Australia',
      url: 'https://www.earlychildhoodaustralia.org.au/our-work/early-childhood-australias-advocacy/',
    },
    expected: 'Early Childhood Australia. (2016). Early Childhood Australia’s advocacy: Advocacy goals. https://www.earlychildhoodaustralia.org.au/our-work/early-childhood-australias-advocacy/',
  },
  {
    name: 'APA 7th journal with DOI',
    style: 'apa7',
    source: 'journal',
    data: {
      authors: [{ family: 'Musiek', given: 'E. S.' }],
      year: '2017', title: 'Circadian rhythms in AD pathogenesis: A critical appraisal',
      journal: 'Current Sleep Medicine Reports', volume: '3', issue: '2', pages: '85-92', doi: '10.1007/s40675-017-0072-5',
    },
    expected: 'Musiek, E. S. (2017). Circadian rhythms in AD pathogenesis: A critical appraisal. Current Sleep Medicine Reports, 3(2), 85-92. https://doi.org/10.1007/s40675-017-0072-5',
  },
  {
    name: 'APA 7th no-author news article',
    style: 'apa7',
    source: 'newspaper-online',
    data: {
      year: '2016', month: 'May', day: '2',
      title: 'Budget to link school spending to outcomes', publisher: 'The Australian',
      url: 'https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a',
    },
    expected: 'Budget to link school spending to outcomes. (2016, May 2). The Australian. https://www.theaustralian.com.au/opinion/editorials/budget-to-link-school-spending-to-outcomes/news-story/b1b98475b68869356cc6540766d6358a',
  },
  {
    name: 'APA 7th AI chat defaults to OpenAI author',
    style: 'apa7',
    source: 'ai-chat',
    data: {
      year: '2026', month: 'February', day: '2', title: 'Book recommendations 2026', toolName: 'ChatGPT', url: 'https://chatgpt.com/share/example',
    },
    expected: 'OpenAI. (2026, February 2). Book recommendations 2026 [Generative AI chat]. ChatGPT. https://chatgpt.com/share/example',
  },
];

let failed = 0;
for (const f of fixtures) {
  const data = { ...base, ...f.data } as CitationData;
  const actual = strip(generate(f.style, f.source, data).reference);
  if (actual !== f.expected) {
    failed++;
    console.error(`FAIL: ${f.name}\nExpected: ${f.expected}\nActual:   ${actual}\n`);
  } else {
    console.log(`PASS: ${f.name}`);
  }
}

if (failed) process.exit(1);
