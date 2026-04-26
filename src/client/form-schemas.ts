/**
 * Form schemas describe which CitationData fields appear for each source type.
 * Mirrors the right-hand menu structure in RMIT Easy Cite.
 */

import type { CitationData, SourceType } from '../shared/types.js';

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
  year: { key: 'year', label: 'Year', placeholder: '2024', hint: 'Use n.d. if unknown' } as FieldDef,
  month: { key: 'month', label: 'Month', placeholder: 'March', hint: 'Full English name' } as FieldDef,
  day: { key: 'day', label: 'Day', placeholder: '15', type: 'number' } as FieldDef,
  title: { key: 'title', label: 'Title', placeholder: 'The article or page title', full: true } as FieldDef,
  url: { key: 'url', label: 'URL', placeholder: 'https://...', type: 'url', full: true } as FieldDef,
  accessDate: { key: 'accessDate', label: 'Date accessed', placeholder: '15 March 2024' } as FieldDef,
  siteName: { key: 'siteName', label: 'Website name', placeholder: 'BBC News' } as FieldDef,
  publisher: { key: 'publisher', label: 'Publisher', placeholder: 'The Sydney Morning Herald' } as FieldDef,
  journal: { key: 'journal', label: 'Journal name', placeholder: 'Nature' } as FieldDef,
  volume: { key: 'volume', label: 'Volume', placeholder: '42' } as FieldDef,
  issue: { key: 'issue', label: 'Issue', placeholder: '3' } as FieldDef,
  pages: { key: 'pages', label: 'Pages', placeholder: '183-206' } as FieldDef,
  articleNumber: { key: 'articleNumber', label: 'Article number', placeholder: 'e70070', hint: 'For online articles without page range' } as FieldDef,
  doi: { key: 'doi', label: 'DOI', placeholder: '10.1038/...' } as FieldDef,
  edition: { key: 'edition', label: 'Edition', placeholder: '2nd', hint: 'Leave blank for 1st edition' } as FieldDef,
  place: { key: 'place', label: 'Place of publication', placeholder: 'Melbourne' } as FieldDef,
  bookTitle: { key: 'bookTitle', label: 'Book title', placeholder: 'The Handbook of...', full: true } as FieldDef,
  username: { key: 'username', label: 'Username / handle', placeholder: '@BarackObama' } as FieldDef,
  platform: { key: 'platform', label: 'Platform', placeholder: 'X / Twitter / TikTok' } as FieldDef,
  reportNumber: { key: 'reportNumber', label: 'Report number', placeholder: 'Cat. No. HSE 176' } as FieldDef,
};

/** Schema for each source type — order matters for display */
export const FORM_SCHEMAS: Record<SourceType, FieldDef[]> = {
  webpage: [F.year, F.month, F.day, F.title, F.siteName, F.url, F.accessDate],
  'newspaper-online': [F.year, F.month, F.day, F.title, F.publisher, F.url],
  'newspaper-print': [F.year, F.month, F.day, F.title, F.publisher, F.pages],
  journal: [F.year, F.title, F.journal, F.volume, F.issue, F.pages, F.articleNumber, F.doi, F.url],
  book: [F.year, F.title, F.edition, F.publisher, F.place, F.doi, F.url],
  'book-chapter': [F.year, F.title, F.bookTitle, F.edition, F.pages, F.publisher],
  report: [F.year, F.title, F.reportNumber, F.publisher, F.url],
  'blog-post': [F.year, F.month, F.day, F.title, F.siteName, F.url],
  'social-twitter': [F.year, F.month, F.day, F.title, F.username, F.url],
  'social-facebook': [F.year, F.month, F.day, F.title, F.url],
  'social-instagram': [F.year, F.month, F.day, F.title, F.username, F.url],
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  webpage: 'Webpage',
  'newspaper-online': 'News (online)',
  'newspaper-print': 'News (print)',
  journal: 'Journal article',
  book: 'Book / E-book',
  'book-chapter': 'Book chapter',
  report: 'Report / PDF',
  'blog-post': 'Blog post',
  'social-twitter': 'X (Twitter)',
  'social-facebook': 'Facebook',
  'social-instagram': 'Instagram',
};

export const STYLE_LABELS: Record<string, string> = {
  apa7: 'APA 7th',
  harvard: 'RMIT Harvard',
  chicagoA: 'Chicago A',
  chicagoB: 'Chicago B',
  ieee: 'IEEE',
  vancouver: 'Vancouver',
  aglc4: 'AGLC4',
};
