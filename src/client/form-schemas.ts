/**
 * Form schemas describe which CitationData fields appear for each source type.
 * Mirrors the RMIT Easy Cite APA 7th sections as closely as possible.
 */

import type { CitationData, CitationStyle, SourceType } from '../shared/types.js';

export type FieldKey = keyof CitationData;

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint?: string;
  placeholder?: string;
  full?: boolean;
  type?: 'text' | 'number' | 'url' | 'date';
}

const F = {
  year: { key: 'year', label: 'Year', placeholder: '2024 or n.d.', hint: 'Use n.d. if no date is available' } as FieldDef,
  month: { key: 'month', label: 'Month', placeholder: 'March', hint: 'Full English month name' } as FieldDef,
  day: { key: 'day', label: 'Day', placeholder: '15', type: 'number' } as FieldDef,
  title: { key: 'title', label: 'Title / content', placeholder: 'Article, page, post, video, book, or source title', full: true } as FieldDef,
  url: { key: 'url', label: 'URL', placeholder: 'https://...', type: 'url', full: true } as FieldDef,
  accessDate: { key: 'accessDate', label: 'Date accessed', placeholder: '15 March 2024' } as FieldDef,

  quotePage: { key: 'quotePage', label: 'Quote page', placeholder: '12', hint: 'For direct quote output only' } as FieldDef,
  quotePages: { key: 'quotePages', label: 'Quote page range', placeholder: '23-24' } as FieldDef,
  quoteSection: { key: 'quoteSection', label: 'Quote section', placeholder: 'Discussion', hint: 'Use when no page number exists' } as FieldDef,
  quoteParagraph: { key: 'quoteParagraph', label: 'Quote paragraph', placeholder: '3', hint: 'Use with section when no page number exists' } as FieldDef,
  timestamp: { key: 'timestamp', label: 'Timestamp', placeholder: '00:27 or 22:59', hint: 'For audio/video quotes' } as FieldDef,

  siteName: { key: 'siteName', label: 'Website name / platform', placeholder: 'BBC / Canvas@RMIT University / YouTube' } as FieldDef,
  publisher: { key: 'publisher', label: 'Publisher / newspaper / production company', placeholder: 'The Sydney Morning Herald / Routledge' } as FieldDef,
  journal: { key: 'journal', label: 'Journal name', placeholder: 'Nature' } as FieldDef,
  volume: { key: 'volume', label: 'Volume', placeholder: '42' } as FieldDef,
  issue: { key: 'issue', label: 'Issue', placeholder: '3' } as FieldDef,
  pages: { key: 'pages', label: 'Reference page range', placeholder: '183-206', hint: 'For the source/reference entry, not necessarily the quoted page' } as FieldDef,
  articleNumber: { key: 'articleNumber', label: 'Article number', placeholder: 'e70070', hint: 'For online journal articles without page range' } as FieldDef,
  doi: { key: 'doi', label: 'DOI', placeholder: '10.1038/...' } as FieldDef,
  edition: { key: 'edition', label: 'Edition', placeholder: '2nd', hint: 'Leave blank for 1st edition' } as FieldDef,
  place: { key: 'place', label: 'Place of publication', placeholder: 'Melbourne', hint: 'Only used by non-APA fallback styles' } as FieldDef,
  bookTitle: { key: 'bookTitle', label: 'Book / series title', placeholder: 'Chronic illness: Impact and interventions', full: true } as FieldDef,
  editorsText: { key: 'editorsText', label: 'Editors', placeholder: 'Lubkin, I. M.; Larsen, P. D.', hint: 'Separate multiple editors with semicolons', full: true } as FieldDef,
  translatorsText: { key: 'translatorsText', label: 'Translator(s)', placeholder: 'Tomlinson, J.; Tomlinson, A.', hint: 'Separate multiple translators with semicolons', full: true } as FieldDef,
  originalYear: { key: 'originalYear', label: 'Original year', placeholder: '1929' } as FieldDef,
  username: { key: 'username', label: 'Username / handle', placeholder: '@BarackObama' } as FieldDef,
  platform: { key: 'platform', label: 'Platform / source name', placeholder: 'X / Instagram / TikTok / YouTube / Canvas@RMIT' } as FieldDef,
  description: { key: 'description', label: 'Description in brackets', placeholder: 'Image attached / Photograph / Video / Director', hint: 'Do not type square brackets' } as FieldDef,
  postType: { key: 'postType', label: 'Post type', placeholder: 'Post / Tweet / Status update', hint: 'Do not type square brackets' } as FieldDef,
  format: { key: 'format', label: 'Format description', placeholder: 'PowerPoint slides / Practical manual / Doctoral dissertation', hint: 'Do not type square brackets' } as FieldDef,
  seriesTitle: { key: 'seriesTitle', label: 'Series title', placeholder: 'The Rehearsal', full: true } as FieldDef,
  season: { key: 'season', label: 'Season', placeholder: '1' } as FieldDef,
  episode: { key: 'episode', label: 'Episode', placeholder: '1' } as FieldDef,
  productionCompanies: { key: 'productionCompanies', label: 'Production company/-ies', placeholder: 'HBO; Film4 Productions', full: true } as FieldDef,
  writersText: { key: 'writersText', label: 'Writer(s)', placeholder: 'Kemper, C.; Notarnicola, E.', hint: 'Separate multiple writers with semicolons', full: true } as FieldDef,
  directorsText: { key: 'directorsText', label: 'Director(s)', placeholder: 'Fielder, N.', hint: 'Separate multiple directors with semicolons', full: true } as FieldDef,
  producersText: { key: 'producersText', label: 'Executive producer(s)', placeholder: 'Fielder, N.; Smith, C.', hint: 'Separate multiple producers with semicolons', full: true } as FieldDef,
  hostRole: { key: 'hostRole', label: 'Contributor role', placeholder: 'Host / Director / Producer / Executive Producer' } as FieldDef,
  reportNumber: { key: 'reportNumber', label: 'Report number', placeholder: 'Health services series No. 71, Cat. No. HSE 176', full: true } as FieldDef,
  institution: { key: 'institution', label: 'Institution', placeholder: 'RMIT University' } as FieldDef,
  repository: { key: 'repository', label: 'Repository / database', placeholder: 'RMIT Research Repository' } as FieldDef,
  jurisdiction: { key: 'jurisdiction', label: 'Jurisdiction', placeholder: 'Vic / Cth / UK' } as FieldDef,
  section: { key: 'section', label: 'Section', placeholder: '115.1' } as FieldDef,
  reporter: { key: 'reporter', label: 'Reporter abbreviation', placeholder: 'AAR' } as FieldDef,
  volumeLegal: { key: 'volumeLegal', label: 'Legal volume', placeholder: '56' } as FieldDef,
  startingPage: { key: 'startingPage', label: 'Starting page', placeholder: '227' } as FieldDef,
  appendix: { key: 'appendix', label: 'Appendix note', placeholder: 'https://val.rmit.edu.au/. See Appendix A for prompt and output', full: true } as FieldDef,
  toolName: { key: 'toolName', label: 'AI tool/model', placeholder: 'ChatGPT / Val OpenAI GPT-4.1' } as FieldDef,
};

const QUOTE_FIELDS = [F.quotePage, F.quotePages, F.quoteSection, F.quoteParagraph];
const URL_FIELD = [F.url];

/** Schema for each source type — order matters for display. */
export const FORM_SCHEMAS: Record<SourceType, FieldDef[]> = {
  webpage: [F.year, F.month, F.day, F.title, F.siteName, F.accessDate, F.url, ...QUOTE_FIELDS],
  'wiki-entry': [F.year, F.month, F.day, F.title, F.siteName, F.accessDate, F.url, ...QUOTE_FIELDS],
  'webpage-document': [F.year, F.title, F.siteName, F.accessDate, F.url, ...QUOTE_FIELDS],
  'newspaper-online': [F.year, F.month, F.day, F.title, F.publisher, F.accessDate, F.url, ...QUOTE_FIELDS],
  'newspaper-print': [F.year, F.month, F.day, F.title, F.publisher, F.pages, ...QUOTE_FIELDS],
  journal: [F.year, F.title, F.journal, F.volume, F.issue, F.pages, F.articleNumber, F.doi, F.accessDate, F.url, ...QUOTE_FIELDS],
  book: [F.year, F.title, F.edition, F.publisher, F.place, F.doi, F.accessDate, F.url, ...QUOTE_FIELDS],
  'translated-book': [F.year, F.title, F.translatorsText, F.publisher, F.originalYear, F.doi, F.accessDate, F.url, ...QUOTE_FIELDS],
  'book-chapter': [F.year, F.title, F.bookTitle, F.editorsText, F.edition, F.pages, F.publisher, F.doi, F.accessDate, F.url, ...QUOTE_FIELDS],
  report: [F.year, F.title, F.reportNumber, F.publisher, F.accessDate, F.url, ...QUOTE_FIELDS],
  'blog-post': [F.year, F.month, F.day, F.title, F.siteName, F.accessDate, F.url, F.quoteParagraph],
  'social-twitter': [F.year, F.month, F.day, F.title, F.username, F.description, F.postType, F.platform, F.accessDate, F.url],
  'social-facebook': [F.year, F.month, F.day, F.title, F.description, F.postType, F.platform, F.accessDate, F.url],
  'social-instagram': [F.year, F.month, F.day, F.title, F.username, F.description, F.postType, F.platform, F.accessDate, F.url],
  'social-tiktok': [F.year, F.month, F.day, F.title, F.username, F.description, F.postType, F.platform, F.accessDate, F.url],
  'youtube-video': [F.year, F.month, F.day, F.title, F.siteName, F.platform, F.accessDate, F.url, F.timestamp],
  film: [F.year, F.title, F.hostRole, F.productionCompanies, F.timestamp],
  podcast: [F.year, F.month, F.day, F.title, F.seriesTitle, F.producersText, F.publisher, F.platform, F.accessDate, F.url, F.timestamp],
  'streaming-video': [F.year, F.month, F.day, F.title, F.publisher, F.platform, F.accessDate, F.url, F.timestamp],
  'tv-series': [F.year, F.title, F.hostRole, F.productionCompanies, F.timestamp],
  'tv-episode': [F.year, F.month, F.day, F.title, F.season, F.episode, F.seriesTitle, F.writersText, F.directorsText, F.producersText, F.productionCompanies, F.timestamp],
  image: [F.year, F.month, F.day, F.title, F.description, F.publisher, F.accessDate, F.url, ...QUOTE_FIELDS],
  'lecture-recording': [F.year, F.month, F.day, F.title, F.format, F.platform, F.accessDate, F.url, F.timestamp],
  'powerpoint-slides': [F.year, F.title, F.format, F.platform, F.accessDate, F.url, ...QUOTE_FIELDS],
  'lab-manual': [F.year, F.title, F.format, F.platform, F.accessDate, F.url, ...QUOTE_FIELDS],
  thesis: [F.year, F.title, F.format, F.institution, F.repository, F.accessDate, F.url, ...QUOTE_FIELDS],
  'legal-act': [F.year, F.title, F.jurisdiction, F.section, F.url],
  'legal-case': [F.year, F.title, F.volumeLegal, F.reporter, F.startingPage, F.url, ...QUOTE_FIELDS],
  'personal-communication': [F.year, F.month, F.day],
  'ai-chat': [F.year, F.month, F.day, F.title, F.toolName, F.format, F.accessDate, F.url, F.appendix],
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  webpage: 'Webpage',
  'wiki-entry': 'Wiki / webpage article',
  'webpage-document': 'Webpage document / PDF',
  'newspaper-online': 'News (online)',
  'newspaper-print': 'News (print)',
  journal: 'Journal article',
  book: 'Book / E-book',
  'translated-book': 'Translated book',
  'book-chapter': 'Book chapter',
  report: 'Report',
  'blog-post': 'Blog post',
  'social-twitter': 'X (Twitter)',
  'social-facebook': 'Facebook',
  'social-instagram': 'Instagram',
  'social-tiktok': 'TikTok',
  'youtube-video': 'YouTube video',
  film: 'Film / movie',
  podcast: 'Podcast',
  'streaming-video': 'Streaming video',
  'tv-series': 'TV series',
  'tv-episode': 'TV episode',
  image: 'Image / table',
  'lecture-recording': 'Lecture recording',
  'powerpoint-slides': 'PowerPoint slides',
  'lab-manual': 'Practical / lab manual',
  thesis: 'Thesis / dissertation',
  'legal-act': 'Act of Parliament',
  'legal-case': 'Legal case',
  'personal-communication': 'Personal communication',
  'ai-chat': 'AI-generated chat',
};

export const STYLE_LABELS: Record<CitationStyle, string> = {
  apa7: 'APA 7th',
  harvard: 'RMIT Harvard',
  ieee: 'IEEE',
};
