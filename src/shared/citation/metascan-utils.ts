import type { Author, CitationData } from '../types.js';

type MetascanSeverity = 'repair' | 'warning' | 'info';

export interface MetascanFinding {
  code: string;
  severity: MetascanSeverity;
  message: string;
  cost: number;
}

export function clean(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function has(s: unknown): boolean {
  return clean(s).length > 0;
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

export function escHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));
}

export function escRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function removeFinalPeriodAfterUrl(s: string): string {
  return s.trim().replace(/(https?:\/\/\S+)\.$/i, '$1');
}

export function canonicalDoi(raw: string): string {
  return clean(raw)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/\s+/g, '');
}

export function includesUrl(referenceText: string, url: string): boolean {
  const expected = clean(url).replace(/\.$/, '');
  if (!expected) return true;
  return referenceText.includes(expected) || referenceText.includes(expected.replace(/\/$/, ''));
}

export function hasAuthor(data: CitationData): boolean {
  return (data.authors || []).some((a: Author) => has(a.family) || has(a.given));
}

export function metascanConfidence(findings: MetascanFinding[]): number {
  return Math.max(20, Math.min(100, 100 - findings.reduce((sum, f) => sum + f.cost, 0)));
}
