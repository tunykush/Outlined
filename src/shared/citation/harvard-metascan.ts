/**
 * Harvard metascan evaluator.
 *
 * This is not an ML model. It is a deterministic, evidence-scored guardrail:
 * it inspects the generated reference against RMIT Harvard template families,
 * repairs only low-risk style-shape issues, and emits reason-coded findings.
 */

import type { CitationData, CitationOutput, SourceType } from '../types.js';
import {
  canonicalDoi,
  clean,
  escRegExp,
  has,
  includesUrl,
  metascanConfidence,
  removeFinalPeriodAfterUrl,
  stripHtml,
  type MetascanFinding,
} from './metascan-utils.js';

const ONLINE = new Set<SourceType>([
  'webpage',
  'webpage-document',
  'wiki-entry',
  'newspaper-online',
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
  'ai-chat',
]);

const WEB_TEMPLATE = new Set<SourceType>(['webpage', 'webpage-document', 'wiki-entry']);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_LOOKUP: Record<string, string> = Object.fromEntries(
  MONTHS.flatMap((m) => [[m.toLowerCase(), m], [m.slice(0, 3).toLowerCase(), m]])
);
const LQ = '‘';
const RQ = '’';

function normaliseMonth(month: string): string {
  const m = clean(month).replace(/\.$/, '');
  return MONTH_LOOKUP[m.toLowerCase()] || m;
}

function smartSingleQuotes(raw: string): string {
  return clean(raw)
    .replace(/(^|[\s([{])'/g, `$1${LQ}`)
    .replace(/'/g, RQ);
}

function harvardDateFromApaParts(year: string, rest = ''): string {
  const y = clean(year);
  const r = clean(rest).replace(/,$/, '');
  if (!r) return y;

  const monthDay = r.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (monthDay) return `${Number(monthDay[2])} ${normaliseMonth(monthDay[1])} ${y}`;

  const monthOnly = r.match(/^([A-Za-z]+)$/i);
  if (monthOnly) return `${normaliseMonth(monthOnly[1])} ${y}`;

  return y;
}

function hasAccessedDate(referenceText: string): boolean {
  return /\baccessed\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\b/.test(referenceText);
}

function hasHarvardDate(referenceText: string): boolean {
  return /\((?:n\.d\.|\d{4}[a-z]?|\d{1,2}\s+[A-Z][a-z]+\s+\d{4}[a-z]?|[A-Z][a-z]+\s+\d{4}[a-z]?)\)/i.test(referenceText);
}

function sourceSuggestion(source: SourceType, data: CitationData): { suggested: SourceType; reasons: string[] } | null {
  const reasons: string[] = [];
  const url = clean(data.url);

  if (/\.pdf(?:\?|$)/i.test(url) && source !== 'webpage-document') {
    return { suggested: 'webpage-document', reasons: ['URL ends in PDF and the uploaded Harvard examples treat online documents as accessed web documents.'] };
  }

  if (has(data.journal) && has(data.doi) && source !== 'journal') {
    return { suggested: 'journal', reasons: ['journal title plus DOI is strongest evidence for journal article.'] };
  }

  if (has(data.bookTitle) && source !== 'book-chapter') {
    return { suggested: 'book-chapter', reasons: ['book title field indicates a chapter inside an edited/book container.'] };
  }

  if (
    source === 'newspaper-online' &&
    has(data.url) &&
    has(data.accessDate) &&
    (has(data.siteName) || has(data.publisher)) &&
    !has(data.pages)
  ) {
    reasons.push('uploaded Harvard reference lists format many online news/site articles with the webpage pattern.');
    return { suggested: 'webpage', reasons };
  }

  return null;
}

function repairReference(reference: string, findings: MetascanFinding[]): string {
  let out = reference;

  const addRepair = (code: string, message: string, before: string): void => {
    if (out !== before) findings.push({ code, severity: 'repair', message, cost: 3 });
  };

  let before = out;
  out = out.replace(/https?:\/\/(?:dx\.)?doi\.org\//gi, 'doi:').replace(/\bdoi:\s+/gi, 'doi:');
  addRepair('HARVARD_DOI_PREFIX_REPAIRED', 'Converted DOI URL/prefix shape to RMIT Harvard doi: format.', before);

  before = out;
  out = out.replace(/\baccessed\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\b/g, (_m, month: string, day: string, year: string) => {
    return `accessed ${Number(day)} ${normaliseMonth(month)} ${year}`;
  });
  addRepair('HARVARD_ACCESS_DATE_REPAIRED', 'Converted accessed date from Month Day, Year to Day Month Year.', before);

  before = out;
  out = out.replace(
    /^(.{2,180}?)\.\s+\((n\.d\.|\d{4}[a-z]?)(?:,\s*([^)]+))?\)\.\s+/i,
    (_m, lead: string, year: string, rest = '') => `${clean(lead)} (${harvardDateFromApaParts(year, rest)}) `
  );
  addRepair('HARVARD_APA_LEAD_REPAIRED', 'Removed APA-style full stops around the author/date lead.', before);

  before = out;
  out = removeFinalPeriodAfterUrl(out);
  addRepair('HARVARD_URL_PERIOD_REPAIRED', 'Removed final full stop after URL.', before);

  before = out;
  out = out.replace(/'([^']+)'/g, (_m, inner: string) => `${LQ}${smartSingleQuotes(inner)}${RQ}`);
  addRepair('HARVARD_TITLE_QUOTES_REPAIRED', 'Converted straight single quotation marks to Harvard curly single quotation marks.', before);

  return out;
}

function repairWebTemplate(reference: string, source: SourceType, data: CitationData, findings: MetascanFinding[]): string {
  if (!WEB_TEMPLATE.has(source)) return reference;
  const site = clean(data.siteName || data.publisher || data.platform);
  if (!site || /\bwebsite\b/i.test(site)) return reference;

  const before = reference;
  const re = new RegExp(`,\\s*(${escRegExp(site)})\\s*,\\s*accessed\\b`, 'i');
  const out = reference.replace(re, (_m, matchedSite: string) => `, ${matchedSite} website, accessed`);
  if (out !== before) {
    findings.push({
      code: 'HARVARD_WEBSITE_LABEL_REPAIRED',
      severity: 'repair',
      message: 'Added the website label used by the uploaded Harvard webpage examples.',
      cost: 3,
    });
  }
  return out;
}

function inspectTemplate(source: SourceType, data: CitationData, reference: string, findings: MetascanFinding[]): void {
  const plain = stripHtml(reference);

  if (/^.{2,180}?\.\s+\((?:n\.d\.|\d{4}[a-z]?)(?:,\s*[^)]*)?\)\./i.test(plain)) {
    findings.push({
      code: 'HARVARD_APA_SHAPE',
      severity: 'warning',
      message: 'Reference still looks APA-like near the author/date lead.',
      cost: 20,
    });
  }

  if (/\((?:n\.d\.|\d{4}),\s+[A-Z][a-z]+/i.test(plain)) {
    findings.push({
      code: 'HARVARD_APA_DATE_SHAPE',
      severity: 'warning',
      message: 'Harvard date should not use APA-style comma inside parentheses.',
      cost: 12,
    });
  }

  if (!hasHarvardDate(plain) && source !== 'personal-communication') {
    findings.push({
      code: 'HARVARD_DATE_MISSING',
      severity: 'warning',
      message: 'Could not detect a Harvard-style date immediately in the reference.',
      cost: 15,
    });
  }

  if (ONLINE.has(source)) {
    if (!hasAccessedDate(plain)) {
      findings.push({
        code: 'HARVARD_ACCESSED_DATE_MISSING_OR_WEAK',
        severity: 'warning',
        message: 'Online Harvard sources should include accessed Day Month Year where required.',
        cost: 15,
      });
    }
    if (has(data.url) && !includesUrl(plain, data.url)) {
      findings.push({
        code: 'HARVARD_URL_MISSING',
        severity: 'warning',
        message: 'The generated reference does not contain the extracted URL.',
        cost: 20,
      });
    }
  }

  if (source === 'journal') {
    if (has(data.title)) {
      const title = clean(data.title);
      const smartTitle = smartSingleQuotes(title);
      const hasQuotedTitle = plain.includes(`${LQ}${smartTitle}${RQ}`);
      if (!hasQuotedTitle) {
        findings.push({
          code: 'HARVARD_JOURNAL_TITLE_QUOTES',
          severity: 'warning',
          message: 'Journal article titles should be enclosed in curly single quotation marks in the Harvard reference list.',
          cost: 10,
        });
      }
    }
    if (has(data.doi) && !new RegExp(`\\bdoi:${escRegExp(canonicalDoi(data.doi))}\\b`, 'i').test(plain)) {
      findings.push({
        code: 'HARVARD_JOURNAL_DOI_MISSING',
        severity: 'warning',
        message: 'Journal article has DOI metadata but the reference does not contain the matching doi: value.',
        cost: 15,
      });
    }
  }

  if ((source === 'book' || source === 'translated-book' || source === 'book-chapter') && /\bn\.p\.\b/i.test(plain)) {
    findings.push({
      code: 'HARVARD_PLACE_INVENTED',
      severity: 'warning',
      message: 'Do not invent n.p. for Harvard book references when place is unavailable.',
      cost: 10,
    });
  }

  if (/\bRetrieved\b.+\bfrom\b/i.test(plain)) {
    findings.push({
      code: 'HARVARD_RETRIEVED_APA_SHAPE',
      severity: 'warning',
      message: 'Retrieved-from wording is APA-like; Harvard examples use accessed Day Month Year.',
      cost: 12,
    });
  }

  if (/'[^']+'/.test(plain)) {
    findings.push({
      code: 'HARVARD_STRAIGHT_TITLE_QUOTES',
      severity: 'warning',
      message: 'Harvard clean references use curly single quotation marks ‘...’ for article/chapter titles.',
      cost: 8,
    });
  }
}

export function metascanHarvard(source: SourceType, data: CitationData, output: CitationOutput): CitationOutput {
  const findings: MetascanFinding[] = [];
  let reference = repairReference(output.reference, findings);
  reference = repairWebTemplate(reference, source, data, findings);
  inspectTemplate(source, data, reference, findings);

  const suggestion = sourceSuggestion(source, data);
  if (suggestion) {
    findings.push({
      code: 'HARVARD_SOURCE_EVIDENCE',
      severity: 'info',
      message: `Source evidence also fits ${suggestion.suggested}: ${suggestion.reasons.join(' ')}`,
      cost: 5,
    });
  }

  const confidence = metascanConfidence(findings);
  const notes = [
    `RMIT Harvard metascan confidence: ${confidence}%.`,
    ...findings.map((f) => `RMIT Harvard metascan ${f.severity} [${f.code}]: ${f.message}`),
  ];

  return {
    ...output,
    reference,
    notes: [...(output.notes || []), ...notes],
  };
}
