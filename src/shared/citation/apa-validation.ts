/**
 * APA 7th validation and safe repair pass.
 *
 * The formatter builds the reference; this pass checks strict APA/RMIT Easy Cite
 * constraints that are easy to regress: DOI URL shape, URL punctuation, missing
 * quote locators, no-author handling, and required fields by source type.
 */

import type { CitationData, CitationOutput, SourceType } from '../types.js';

function clean(s: string = ''): string { return String(s).replace(/\s+/g, ' ').trim(); }
function has(s: string | undefined | null): boolean { return clean(s || '').length > 0; }
function stripHtml(s: string): string { return s.replace(/<[^>]+>/g, ''); }
function validAuthors(d: CitationData): boolean { return (d.authors || []).some((a) => has(a.family) || has(a.given)); }
function hasLocator(d: CitationData): boolean { return has(d.quotePage) || has(d.quotePages) || has(d.quoteSection) || has(d.quoteParagraph) || has(d.timestamp); }

const REQUIRED: Partial<Record<SourceType, Array<keyof CitationData>>> = {
  webpage: ['title', 'url'],
  'webpage-document': ['title', 'url'],
  'wiki-entry': ['title', 'siteName', 'url'],
  'newspaper-online': ['title', 'publisher', 'url'],
  'newspaper-print': ['title', 'publisher'],
  journal: ['title', 'journal'],
  book: ['title', 'publisher'],
  'book-chapter': ['title', 'bookTitle', 'publisher'],
  report: ['title'],
  'blog-post': ['title', 'siteName', 'url'],
  'youtube-video': ['title', 'url'],
  thesis: ['title', 'institution'],
  'ai-chat': ['title', 'toolName'],
};

const DIRECT_QUOTE_SOURCE_TYPES = new Set<SourceType>([
  'webpage', 'webpage-document', 'wiki-entry', 'newspaper-online', 'newspaper-print', 'journal', 'book',
  'book-chapter', 'translated-book', 'report', 'blog-post', 'youtube-video', 'film', 'podcast',
  'streaming-video', 'tv-series', 'tv-episode', 'image', 'lecture-recording', 'powerpoint-slides',
  'lab-manual', 'thesis', 'legal-case',
]);

function normaliseSpacing(reference: string): string {
  return reference
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/([,;])(\S)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim();
}

function repairDoiUrl(reference: string): string {
  return reference
    .replace(/\bdoi:\s*(10\.\S+)/gi, 'https://doi.org/$1')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/https?:\/\/(?:dx\.)?doi\.org\//gi, 'https://doi.org/')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/doi:/gi, 'https://doi.org/');
}

function removeFinalFullStopAfterUrl(reference: string): string {
  return reference.trim().replace(/(https?:\/\/\S+)\.$/i, '$1');
}

function requiredFieldNotes(source: SourceType, data: CitationData): string[] {
  const notes: string[] = [];
  for (const field of REQUIRED[source] || []) {
    if (!has(String(data[field] || ''))) notes.push(`APA validator warning: missing ${String(field)} for ${source}.`);
  }
  if (!validAuthors(data) && source !== 'legal-act' && source !== 'legal-case' && source !== 'personal-communication') {
    notes.push('APA validator warning: no author detected; APA will place the title in the author position. Check this manually.');
  }
  if (!has(data.year) && source !== 'personal-communication') {
    notes.push('APA validator warning: no publication date detected; output uses n.d. until you add a date.');
  }
  if (source === 'journal' && !has(data.doi) && !has(data.url)) {
    notes.push('APA validator warning: journal articles should include a DOI when available; otherwise include the journal homepage URL if required by your educator.');
  }
  if (DIRECT_QUOTE_SOURCE_TYPES.has(source) && !hasLocator(data)) {
    notes.push('APA direct-quote warning: add a page, page range, paragraph, section, or timestamp before using the direct quote citation.');
  }
  return notes;
}

function confidence(source: SourceType, data: CitationData): number {
  let score = 100;
  if (!validAuthors(data) && source !== 'personal-communication' && source !== 'legal-act' && source !== 'legal-case') score -= 25;
  if (!has(data.year) && source !== 'personal-communication') score -= 20;
  for (const field of REQUIRED[source] || []) if (!has(String(data[field] || ''))) score -= 15;
  if (source === 'journal' && !has(data.doi) && !has(data.url)) score -= 10;
  if ((source === 'webpage' || source === 'blog-post' || source === 'newspaper-online') && !has(data.siteName) && !has(data.publisher)) score -= 10;
  return Math.max(20, Math.min(100, score));
}

export function validateAndRepairApa7(source: SourceType, data: CitationData, output: CitationOutput): CitationOutput {
  let reference = output.reference;
  reference = repairDoiUrl(reference);
  reference = normaliseSpacing(reference);
  reference = removeFinalFullStopAfterUrl(reference);

  const notes = [
    `APA validation confidence: ${confidence(source, data)}%.`,
    ...requiredFieldNotes(source, data),
  ];

  // Guardrail: APA should not end DOI/URL references with a full stop.
  if (/https?:\/\/\S+\.$/i.test(stripHtml(output.reference))) {
    notes.push('APA validator repaired final full stop after DOI/URL.');
  }

  return { ...output, reference, notes: [...(output.notes || []), ...notes] };
}
