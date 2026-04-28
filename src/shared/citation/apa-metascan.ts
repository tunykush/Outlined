/**
 * APA 7 metascan evaluator.
 *
 * Deterministic post-generation guardrail for APA 7. It checks the generated
 * reference against APA template families, repairs low-risk shape errors, and
 * emits reason-coded findings. It does not invent missing bibliographic facts.
 */

import type { CitationData, CitationOutput, SourceType } from '../types.js';
import {
  canonicalDoi,
  clean,
  escHtml,
  escRegExp,
  has,
  hasAuthor,
  includesUrl,
  metascanConfidence,
  removeFinalPeriodAfterUrl,
  stripHtml,
  type MetascanFinding,
} from './metascan-utils.js';

const URL_SOURCES = new Set<SourceType>([
  'webpage',
  'webpage-document',
  'wiki-entry',
  'newspaper-online',
  'journal',
  'report',
  'blog-post',
  'social-twitter',
  'social-facebook',
  'social-instagram',
  'social-tiktok',
  'youtube-video',
  'podcast',
  'streaming-video',
  'image',
  'lecture-recording',
  'powerpoint-slides',
  'lab-manual',
  'thesis',
  'legal-act',
  'legal-case',
  'ai-chat',
]);

const ITALIC_NO_AUTHOR_IN_TEXT = new Set<SourceType>([
  'webpage',
  'webpage-document',
  'book',
  'translated-book',
  'report',
  'image',
  'lecture-recording',
  'powerpoint-slides',
  'lab-manual',
  'thesis',
  'ai-chat',
]);

function apaDoiUrl(raw: string): string {
  const doi = canonicalDoi(raw);
  return doi ? `https://doi.org/${doi}` : '';
}

function apaDate(data: CitationData, includeMonthDay: boolean): string {
  const year = clean(data.year) || 'n.d.';
  if (!includeMonthDay) return `(${year}).`;
  const month = clean(data.month);
  const day = clean(data.day);
  if (month && day) return `(${year}, ${month} ${day}).`;
  if (month) return `(${year}, ${month}).`;
  return `(${year}).`;
}

function accessDateApa(raw: string): string {
  const s = clean(raw).replace(/,/g, '');
  const dayMonthYear = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayMonthYear) return `${dayMonthYear[2]} ${Number(dayMonthYear[1])}, ${dayMonthYear[3]}`;
  return clean(raw);
}

function firstWords(text: string, n = 3): string {
  return clean(text).split(/\s+/).filter(Boolean).slice(0, n).join(' ') || 'Title';
}

function noAuthorInTextTitle(data: CitationData, source: SourceType): string {
  const title = escHtml(firstWords(data.title));
  return ITALIC_NO_AUTHOR_IN_TEXT.has(source) ? `<i>${title}</i>` : `&quot;${title}&quot;`;
}

function repairDoiAndUrl(reference: string, findings: MetascanFinding[]): string {
  let out = reference;
  const addRepair = (code: string, message: string, before: string): void => {
    if (out !== before) findings.push({ code, severity: 'repair', message, cost: 3 });
  };

  let before = out;
  out = out
    .replace(/\bdoi:\s*(10\.\S+)/gi, 'https://doi.org/$1')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/doi:/gi, 'https://doi.org/')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/https?:\/\/(?:dx\.)?doi\.org\//gi, 'https://doi.org/');
  addRepair('APA_DOI_URL_REPAIRED', 'Converted DOI to APA 7 https://doi.org/... shape.', before);

  before = out;
  out = removeFinalPeriodAfterUrl(out);
  addRepair('APA_URL_PERIOD_REPAIRED', 'Removed final full stop after URL/DOI.', before);

  return out;
}

function repairNoAuthorNewspaper(reference: string, source: SourceType, data: CitationData, findings: MetascanFinding[]): string {
  if (source !== 'newspaper-online' && source !== 'newspaper-print') return reference;
  if (hasAuthor(data) || !has(data.title)) return reference;

  const container = clean(data.publisher || data.siteName);
  if (!container) return reference;

  const plain = stripHtml(reference);
  const title = clean(data.title);
  const startsWithTitle = new RegExp(`^${escRegExp(title)}\\.\\s+\\(`, 'i').test(plain);
  if (startsWithTitle) return reference;

  const date = apaDate(data, true);
  const pages = clean(data.pages);
  let repaired = `${escHtml(title)}. ${date} <i>${escHtml(container)}</i>`;
  if (source === 'newspaper-print' && pages) repaired += `, ${escHtml(pages)}`;
  repaired += '.';
  if (source === 'newspaper-online' && has(data.url)) repaired += ` ${clean(data.url)}`;

  findings.push({
    code: 'APA_NO_AUTHOR_NEWS_REPAIRED',
    severity: 'repair',
    message: 'Moved no-author newspaper article to title-first APA 7 shape instead of using the masthead as author.',
    cost: 3,
  });
  return removeFinalPeriodAfterUrl(repaired);
}

function repairNoAuthorInText(source: SourceType, data: CitationData, output: CitationOutput): CitationOutput {
  if (hasAuthor(data) || source === 'legal-act' || source === 'legal-case' || source === 'personal-communication') return output;
  if (!has(data.title)) return output;

  const title = noAuthorInTextTitle(data, source);
  const year = clean(data.year) || 'n.d.';
  return {
    ...output,
    intextParaphrase: `(${title}, ${escHtml(year)})`,
    intextNarrative: `${title} (${escHtml(year)})`,
    intextQuote: output.intextQuote.replace(/^\([^,]+,\s*/, `(${title}, `),
  };
}

function inspectTemplate(source: SourceType, data: CitationData, reference: string, findings: MetascanFinding[]): void {
  const plain = stripHtml(reference);

  if (/^.{2,180}?\s+\((?:n\.d\.|\d{4}[a-z]?)(?:,\s*[^)]*)?\)\s+/.test(plain) && !/^.+\.\s+\(/.test(plain)) {
    findings.push({
      code: 'APA_LEAD_PERIOD_MISSING',
      severity: 'warning',
      message: 'APA references should place a full stop before the parenthesized date.',
      cost: 12,
    });
  }

  if (/^.{2,180}?\s+\((?:n\.d\.|\d{4}[a-z]?)\)\s+['‘]/i.test(plain)) {
    findings.push({
      code: 'APA_HARVARD_ARTICLE_TITLE_SHAPE',
      severity: 'warning',
      message: 'Reference still looks Harvard-like because the article title is quoted after an author-date lead.',
      cost: 15,
    });
  }

  if (has(data.doi) && !plain.includes(apaDoiUrl(data.doi))) {
    findings.push({
      code: 'APA_DOI_MISSING_OR_WEAK',
      severity: 'warning',
      message: 'DOI metadata exists but the reference does not contain the matching https://doi.org/... value.',
      cost: 15,
    });
  }

  if (/\bdoi:10\./i.test(plain)) {
    findings.push({
      code: 'APA_DOI_PREFIX_SHAPE',
      severity: 'warning',
      message: 'APA 7 references should render DOI as https://doi.org/...',
      cost: 12,
    });
  }

  if (URL_SOURCES.has(source) && has(data.url) && !includesUrl(plain, data.url) && !has(data.doi)) {
    findings.push({
      code: 'APA_URL_MISSING',
      severity: 'warning',
      message: 'The generated reference does not contain the extracted URL.',
      cost: 20,
    });
  }

  if (source === 'journal') {
    if (has(data.journal) && !plain.toLowerCase().includes(clean(data.journal).toLowerCase())) {
      findings.push({
        code: 'APA_JOURNAL_NAME_MISSING',
        severity: 'warning',
        message: 'Journal title metadata is missing from the generated reference.',
        cost: 15,
      });
    }
    if (has(data.volume) && !new RegExp(`\\b${escRegExp(clean(data.volume))}(?:\\(|,|\\b)`).test(plain)) {
      findings.push({
        code: 'APA_JOURNAL_VOLUME_MISSING',
        severity: 'warning',
        message: 'Journal volume metadata is missing from the generated reference.',
        cost: 10,
      });
    }
  }

  if ((source === 'webpage' || source === 'wiki-entry') && /^n\.d\.$/i.test(clean(data.year)) && has(data.accessDate) && !/\bRetrieved\b.+\bfrom\b/i.test(plain)) {
    findings.push({
      code: 'APA_RETRIEVAL_DATE_CONSIDER',
      severity: 'info',
      message: `The uploaded APA reference list uses retrieval dates for some n.d. web pages; consider Retrieved ${accessDateApa(data.accessDate)}, from URL when the page is designed to change.`,
      cost: 4,
    });
  }

  if (!hasAuthor(data) && (source === 'newspaper-online' || source === 'newspaper-print')) {
    const title = clean(data.title);
    if (title && !new RegExp(`^${escRegExp(title)}\\.\\s+\\(`, 'i').test(plain)) {
      findings.push({
        code: 'APA_NO_AUTHOR_NEWS_WEAK',
        severity: 'warning',
        message: 'No-author newspaper articles should begin with the article title, not the masthead.',
        cost: 15,
      });
    }
  }
}

function sourceSuggestion(source: SourceType, data: CitationData): { suggested: SourceType; reason: string } | null {
  const url = clean(data.url);
  if (/\.pdf(?:\?|$)/i.test(url) && source === 'webpage') {
    return { suggested: 'webpage-document', reason: 'URL ends in PDF; APA examples in the uploaded reference list cite PDF-like reports/documents as online documents or reports.' };
  }
  if (has(data.journal) && (has(data.doi) || has(data.volume)) && source !== 'journal') {
    return { suggested: 'journal', reason: 'journal title plus DOI/volume is strongest evidence for journal article.' };
  }
  if (has(data.bookTitle) && source !== 'book-chapter') {
    return { suggested: 'book-chapter', reason: 'book title field indicates a chapter inside a book container.' };
  }
  return null;
}

export function metascanApa7(source: SourceType, data: CitationData, output: CitationOutput): CitationOutput {
  const findings: MetascanFinding[] = [];
  let reference = repairDoiAndUrl(output.reference, findings);
  reference = repairNoAuthorNewspaper(reference, source, data, findings);
  inspectTemplate(source, data, reference, findings);

  const suggestion = sourceSuggestion(source, data);
  if (suggestion) {
    findings.push({
      code: 'APA_SOURCE_EVIDENCE',
      severity: 'info',
      message: `Source evidence also fits ${suggestion.suggested}: ${suggestion.reason}`,
      cost: 5,
    });
  }

  const confidence = metascanConfidence(findings);
  const notes = [
    `APA 7 metascan confidence: ${confidence}%.`,
    ...findings.map((f) => `APA 7 metascan ${f.severity} [${f.code}]: ${f.message}`),
  ];

  return repairNoAuthorInText(source, data, {
    ...output,
    reference,
    notes: [...(output.notes || []), ...notes],
  });
}
