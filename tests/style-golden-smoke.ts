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
    name: 'RMIT Harvard webpage with n.d. from uploaded reference list',
    style: 'harvard',
    source: 'webpage',
    data: {
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
    name: 'RMIT Harvard webpage preserves domain website name from uploaded reference list',
    style: 'harvard',
    source: 'webpage',
    data: {
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
    name: 'RMIT Harvard journal keeps full five-author reference list',
    style: 'harvard',
    source: 'journal',
    data: {
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
    expected: "Abdullah A, Yamak S, Korzhenitskaya A, Rahimi R and McClellan J (2023) ‘Sustainable development: The role of sustainability committees in achieving ESG targets’, Business Strategy and the Environment, 33(3):2250–2268, doi:10.1002/bse.3596.",
  },
  {
    name: 'RMIT Harvard journal keeps full six-author reference list',
    style: 'harvard',
    source: 'journal',
    data: {
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
    expected: "Meng JJ, Wang XD, Xie MY, Hao ZL, Yang JL and Liu YB (2023) ‘Ethical leadership and TMT decision-making of corporate social responsibility - a perspective of self-determination theory’, Frontiers in Psychology, 14, doi:10.3389/fpsyg.2023.1268091.",
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
    expected: "Gimenez C, Sierra V and Rodon J (2012) ‘Sustainable operations: their impact on the triple bottom line’, International Journal of Production Economics, 140(1):149–159, doi:10.1016/j.ijpe.2012.01.035.",
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
    expected: "Mohsin M, Ghosh T and Hoque N (2025) ‘Prediction and optimization of strength and CO2 emission for geopolymer concrete mix design using machine learning’, Results in Materials, 28:1-18, Article 100791, doi:10.1016/j.rinma.2025.100791.",
  },
  {
    name: 'RMIT Harvard normalizes uploaded reference-list website host',
    style: 'harvard',
    source: 'webpage',
    data: {
      year: '2024',
      title: 'The Effects of Art and Culture on Todays Modern Society',
      siteName: 'blog.creativeflair.org',
      accessDate: '5 September 2024',
      url: 'https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/',
    },
    expected: 'Creative Flair (2024) The Effects of Art and Culture on Todays Modern Society, Creative Flair website, accessed 5 September 2024. https://blog.creativeflair.org/the-effects-of-art-and-culture-on-todays-modern-society/',
  },
  {
    name: 'RMIT Harvard book without place does not invent n.p.',
    style: 'harvard',
    source: 'book',
    data: {
      authors: [{ family: 'Kraidy', given: 'M' }],
      year: '2005',
      title: 'Hybridity: The cultural logic of globalization',
      publisher: 'Temple University Press',
    },
    expected: 'Kraidy M (2005) Hybridity: The cultural logic of globalization, Temple University Press.',
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
  {
    name: 'IEEE book with one author',
    style: 'ieee',
    source: 'book',
    data: {
      authors: [{ family: 'Blackburn', given: 'J. L.' }],
      year: '2014',
      title: 'Protective Relaying: Principles and Applications',
      edition: '4th',
      place: 'Boca Raton, FL, USA',
      publisher: 'CRC Press',
    },
    expected: '[1] J. L. Blackburn, Protective Relaying: Principles and Applications, 4th ed. Boca Raton, FL, USA: CRC Press, 2014.',
  },
  {
    name: 'IEEE e-journal article with DOI',
    style: 'ieee',
    source: 'journal',
    data: {
      authors: [
        { family: 'Shao', given: 'S.' },
        { family: 'Bi', given: 'J.' },
        { family: 'Yang', given: 'F.' },
        { family: 'Guan', given: 'W.' },
      ],
      year: '2014',
      month: 'October',
      title: 'On-line estimation of state-of-charge of Li-ion batteries in electric vehicle using the resampling particle filter',
      journal: 'Transp. Res. Part D: Transport Environ.',
      volume: '32',
      pages: '207-217',
      doi: '10.1016/j.trd.2014.07.013',
    },
    expected: '[1] S. Shao, J. Bi, F. Yang, and W. Guan, "On-line estimation of state-of-charge of Li-ion batteries in electric vehicle using the resampling particle filter," Transp. Res. Part D: Transport Environ., vol. 32, pp. 207-217, Oct. 2014, doi: 10.1016/j.trd.2014.07.013.',
  },
  {
    name: 'IEEE webpage with access date',
    style: 'ieee',
    source: 'webpage',
    data: {
      authors: [{ family: 'Fleischman', given: 'T.' }],
      title: 'Stabilizing molecule could pave way for lithium-air fuel cell',
      siteName: 'CNN.com',
      accessDate: '30 April 2017',
      url: 'https://www.news.cornell.edu/stories/2017/04/stabilizing-molecule-could-pave-way-lithium-air-fuel-cell',
    },
    expected: '[1] T. Fleischman, "Stabilizing molecule could pave way for lithium-air fuel cell," CNN.com, 2017. [Online]. Available: https://www.news.cornell.edu/stories/2017/04/stabilizing-molecule-could-pave-way-lithium-air-fuel-cell. [Accessed: Apr. 30, 2017].',
  },
  {
    name: 'IEEE online news from captured VnExpress example',
    style: 'ieee',
    source: 'newspaper-online',
    data: {
      authors: [{ family: 'VnExpress', given: '', isOrganisation: true }],
      year: '2026',
      month: 'April',
      day: '22',
      title: 'Techcombank lãi kỷ lục trong quý I',
      siteName: 'VnExpress',
      accessDate: '28 April 2026',
      url: 'https://vnexpress.net/techcombank-lai-ky-luc-5065494.html',
    },
    expected: '[1] VnExpress, "Techcombank lãi kỷ lục trong quý I," VnExpress, 2026. [Online]. Available: https://vnexpress.net/techcombank-lai-ky-luc-5065494.html. [Accessed: Apr. 28, 2026].',
  },
  {
    name: 'IEEE wiki/webpage uses access year when no publication year exists',
    style: 'ieee',
    source: 'wiki-entry',
    data: {
      title: 'Pretender',
      siteName: 'TYPE-MOON Wiki',
      accessDate: '28 April 2026',
      url: 'https://typemoon.fandom.com/wiki/Pretender',
    },
    expected: '[1] TYPE-MOON Wiki, "Pretender," TYPE-MOON Wiki, 2026. [Online]. Available: https://typemoon.fandom.com/wiki/Pretender. [Accessed: Apr. 28, 2026].',
  },
  {
    name: 'IEEE AI-generated content with share URL',
    style: 'ieee',
    source: 'ai-chat',
    data: {
      year: '2026',
      month: 'February',
      day: '2',
      toolName: 'ChatGPT',
      publisher: 'OpenAI',
      accessDate: '2 February 2026',
      url: 'https://chat.openai.com/share/1234567812345',
    },
    expected: '[1] ChatGPT (2026), OpenAI. Accessed: Feb. 2, 2026. [Online]. Available: https://chat.openai.com/share/1234567812345',
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
