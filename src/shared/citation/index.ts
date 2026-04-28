/**
 * Citation engine entry point.
 * The style-specific rules live in separate modules so APA 7, RMIT Harvard,
 * and IEEE can evolve independently without mixing citation conventions.
 */

import type { CitationData, CitationOutput, CitationStyle, SourceType } from '../types.js';
import { generateApa7, apa7Internals } from './styles/apa7.js';
import { generateHarvard, harvardInternals } from './styles/harvard.js';
import { generateIeee, ieeeInternals } from './styles/ieee.js';
import { validateAndRepairHarvard } from './harvard-validation.js';
import { validateAndRepairApa7 } from './apa-validation.js';
import { normalizeCitationData } from './normalize.js';

function clean(s: string = ''): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

function has(s: string | undefined | null): boolean {
  return clean(s || '').length > 0;
}

function validPeopleForStyle(style: CitationStyle): (authors: CitationData['authors']) => CitationData['authors'] {
  if (style === 'harvard') return harvardInternals.validPeople;
  if (style === 'ieee') return ieeeInternals.validPeople;
  return apa7Internals.validPeople;
}

function hasHarvardLeadFallback(source: SourceType, data: CitationData): boolean {
  if (source === 'journal') return has(data.journal);
  if (source === 'newspaper-online' || source === 'newspaper-print') return has(data.publisher) || has(data.siteName);
  if (
    source === 'webpage' ||
    source === 'webpage-document' ||
    source === 'wiki-entry' ||
    source === 'blog-post' ||
    source === 'report' ||
    source === 'image'
  ) return has(data.siteName) || has(data.publisher) || has(data.institution);
  if (
    source === 'youtube-video' ||
    source === 'podcast' ||
    source === 'streaming-video' ||
    source === 'lecture-recording' ||
    source === 'powerpoint-slides' ||
    source === 'lab-manual' ||
    source === 'ai-chat'
  ) return has(data.siteName) || has(data.publisher) || has(data.platform) || has(data.toolName) || has(data.institution);
  return false;
}

function styleNotes(style: CitationStyle, source: SourceType, data: CitationData): string[] {
  const notes: string[] = [];
  const validPeople = validPeopleForStyle(style);
  const hasAuthor = validPeople(data.authors).length > 0 || has(data.referenceAuthorText);
  const hasStyleLead = style === 'harvard' && hasHarvardLeadFallback(source, data);

  if (!hasAuthor && !hasStyleLead && source !== 'legal-act' && source !== 'legal-case' && source !== 'personal-communication') {
    if (style === 'harvard') {
      notes.push('No author detected - RMIT Harvard starts the reference with the title or source name, depending on source type.');
    } else if (style === 'ieee') {
      notes.push('No author detected - IEEE often uses the organisation, website, publisher, or creator in the author position. Check the entry before copying.');
    } else {
      notes.push('No author detected - APA 7 uses the title in the author position and the title in the in-text citation.');
    }
  }

  const ieeeAccessOnlySources = new Set<SourceType>([
    'webpage',
    'wiki-entry',
    'newspaper-online',
    'social-twitter',
    'social-facebook',
    'social-instagram',
    'social-tiktok',
  ]);
  const needsYearNote = style !== 'ieee' || !ieeeAccessOnlySources.has(source);
  if (!has(data.year) && source !== 'personal-communication' && needsYearNote) {
    if (style === 'harvard') {
      notes.push('No publication year - RMIT Harvard uses n.d. for no date.');
    } else if (style === 'ieee') {
      notes.push('No publication year - IEEE usually requires the publication, release, or access year for this source type.');
    } else {
      notes.push('No publication year - APA 7 uses n.d. for no date.');
    }
  }

  if (style === 'harvard') {
    notes.push('RMIT Harvard in-text citations use author/date without a comma, e.g. (Author 2024).');
    notes.push('Digital RMIT Harvard sources normally need an accessed date plus URL where the guide requests it.');
  } else if (style === 'ieee') {
    notes.push('IEEE in-text citations are numbers in square brackets, e.g. [1], placed before punctuation.');
    notes.push('IEEE reference lists are ordered numerically by first appearance, not alphabetically.');
  } else if (style === 'apa7') {
    notes.push('Apply hanging indent and double spacing to the final reference list in Word/Google Docs.');
    notes.push('Arrange reference-list entries alphabetically by author family name or by title when no author exists.');
  }

  if (source === 'book-chapter' && !has(data.editorsText) && validPeople(data.editors).length === 0) {
    notes.push('Book chapters in edited books require editor name(s) after "In". Add editors if available.');
  }
  if (source === 'personal-communication' && style !== 'ieee') {
    notes.push('Personal communication is not included in the reference list; cite it in-text only.');
  }

  return notes;
}

export function generate(
  style: CitationStyle,
  source: SourceType,
  data: CitationData
): CitationOutput {
  const normalizedData = normalizeCitationData(style, source, data);
  let output: CitationOutput;

  if (style === 'apa7') {
    output = validateAndRepairApa7(source, normalizedData, generateApa7(source, normalizedData));
  } else if (style === 'harvard') {
    output = validateAndRepairHarvard(source, normalizedData, generateHarvard(source, normalizedData));
  } else if (style === 'ieee') {
    output = generateIeee(source, normalizedData);
  } else {
    const fallback = generateApa7(source, normalizedData);
    output = {
      ...fallback,
      reference: `(Style "${style}" is not implemented yet) ${fallback.reference.replace(/<\/?i>/g, '')}`,
      notes: [`${style} is not implemented. Use APA 7th, RMIT Harvard, or IEEE for validated output.`],
    };
  }

  return {
    ...output,
    notes: [...styleNotes(style, source, normalizedData), ...(output.notes || [])],
  };
}
