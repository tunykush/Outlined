/**
 * Citation engine entry point.
 * The style-specific rules live in separate modules so APA 7 and RMIT Harvard
 * can evolve independently without mixing citation conventions.
 */

import type { CitationData, CitationOutput, CitationStyle, SourceType } from '../types.js';
import { generateApa7, apa7Internals } from './styles/apa7.js';
import { generateHarvard, harvardInternals } from './styles/harvard.js';
import { validateAndRepairHarvard } from './harvard-validation.js';
import { validateAndRepairApa7 } from './apa-validation.js';
import { normalizeCitationData } from './normalize.js';

function clean(s: string = ''): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

function has(s: string | undefined | null): boolean {
  return clean(s || '').length > 0;
}

function styleNotes(style: CitationStyle, source: SourceType, data: CitationData): string[] {
  const notes: string[] = [];
  const validPeople = style === 'harvard' ? harvardInternals.validPeople : apa7Internals.validPeople;
  const hasAuthor = validPeople(data.authors).length > 0;

  if (!hasAuthor && source !== 'legal-act' && source !== 'legal-case' && source !== 'personal-communication') {
    notes.push(style === 'harvard'
      ? 'No author detected — RMIT Harvard starts the reference with the title or source name, depending on source type.'
      : 'No author detected — APA 7 uses the title in the author position and the title in the in-text citation.');
  }

  if (!has(data.year) && source !== 'personal-communication') {
    notes.push(style === 'harvard'
      ? 'No publication year — RMIT Harvard uses n.d. for no date.'
      : 'No publication year — APA 7 uses n.d. for no date.');
  }

  if (style === 'harvard') {
    notes.push('RMIT Harvard in-text citations use author/date without a comma, e.g. (Author 2024).');
    notes.push('Digital RMIT Harvard sources normally need an accessed date plus URL where the guide requests it.');
  } else if (style === 'apa7') {
    notes.push('Apply hanging indent and double spacing to the final reference list in Word/Google Docs.');
    notes.push('Arrange reference-list entries alphabetically by author family name or by title when no author exists.');
  }

  if (source === 'book-chapter' && !has(data.editorsText) && validPeople(data.editors).length === 0) {
    notes.push('Book chapters in edited books require editor name(s) after “In”. Add editors if available.');
  }
  if (source === 'personal-communication') {
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
  } else {
    const fallback = generateApa7(source, normalizedData);
    output = {
      ...fallback,
      reference: `(Style "${style}" is not implemented yet) ${fallback.reference.replace(/<\/?i>/g, '')}`,
      notes: [`${style} is not implemented. Use APA 7th or RMIT Harvard for validated output.`],
    };
  }

  return {
    ...output,
    notes: [...styleNotes(style, source, normalizedData), ...(output.notes || [])],
  };
}
