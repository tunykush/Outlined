/**
 * RMIT Harvard validation and repair pass.
 *
 * 
 */

import type { CitationData, CitationOutput, SourceType } from '../types.js';

function clean(s: string = ''): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

function has(s: string | undefined | null): boolean {
  return clean(s || '').length > 0;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function noFinalPeriodAfterUrl(s: string): string {
  return s.trim().replace(/(https?:\/\/\S+)\.$/i, '$1');
}

function removeWebTitleItalics(source: SourceType, reference: string): string {
  if (source !== 'webpage') return reference;
  // RMIT Harvard website examples show page titles as plain text, not italicised.
  return reference.replace(/<i>(.*?)<\/i>/g, '$1');
}

function normaliseSpacing(reference: string): string {
  return reference
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/([,.:;])(?!\/\/)(\S)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\.\s+\./g, '.')
    .trim();
}

function validateAccessDateShape(reference: string): string[] {
  const notes: string[] = [];
  const m = stripHtml(reference).match(/accessed\s+([^.]*)\./i);
  if (!m) return notes;
  const date = m[1].trim();
  if (/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/.test(date)) {
    notes.push('RMIT Harvard access date should be Day Month Year, not Month Day, Year.');
  }
  return notes;
}

function metadataQualityNotes(source: SourceType, data: CitationData): string[] {
  const notes: string[] = [];
  const isOnline = ['webpage', 'webpage-document', 'blog-post', 'newspaper-online', 'social-twitter', 'social-facebook', 'social-instagram', 'social-tiktok', 'youtube-video', 'streaming-video', 'podcast', 'image', 'report', 'thesis'].includes(source);
  if (source === 'webpage' || source === 'blog-post') {
    if (!data.authors?.some((a) => has(a.family) || has(a.given))) {
      notes.push('Validator warning: no web author/byline was detected. Check the page manually before submitting.');
    }
    if (!has(data.year)) {
      notes.push('Validator warning: no publication year was detected; output uses n.d. until you add a date.');
    }
    if (!has(data.siteName) && !has(data.publisher)) {
      notes.push('Validator warning: no website name was detected. Add the website name manually.');
    }
  }
  if (isOnline && !has(data.accessDate)) {
    notes.push('Validator warning: online RMIT Harvard sources normally need an accessed date.');
  }
  return notes;
}

export function validateAndRepairHarvard(source: SourceType, data: CitationData, output: CitationOutput): CitationOutput {
  let reference = output.reference;
  reference = removeWebTitleItalics(source, reference);
  reference = normaliseSpacing(reference);
  reference = noFinalPeriodAfterUrl(reference);

  const validationNotes = [
    ...validateAccessDateShape(reference),
    ...metadataQualityNotes(source, data),
  ];

  return {
    ...output,
    reference,
    notes: [...(output.notes || []), ...validationNotes],
  };
}
