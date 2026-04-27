/**
 * RMIT Harvard validation and repair pass.
 *
 * Deterministic guardrail after formatting. It does not invent missing data; it
 * only repairs objectively safe punctuation/shape issues and reports strict
 * warnings so the UI does not silently present a weak reference as final.
 */
function clean(s = '') { return String(s).replace(/\s+/g, ' ').trim(); }
function has(s) { return clean(s || '').length > 0; }
function stripHtml(s) { return s.replace(/<[^>]+>/g, ''); }
function validAuthors(d) { return (d.authors || []).some((a) => has(a.family) || has(a.given)) || has(d.referenceAuthorText); }
const ONLINE = new Set([
    'webpage', 'webpage-document', 'wiki-entry', 'newspaper-online', 'report', 'blog-post', 'social-twitter',
    'social-facebook', 'social-instagram', 'social-tiktok', 'youtube-video', 'podcast', 'streaming-video',
    'image', 'lecture-recording', 'powerpoint-slides', 'lab-manual', 'thesis', 'ai-chat',
]);
const REQUIRED = {
    webpage: ['title', 'siteName', 'accessDate', 'url'],
    'webpage-document': ['title', 'siteName', 'accessDate', 'url'],
    'wiki-entry': ['title', 'siteName', 'accessDate', 'url'],
    'newspaper-online': ['title', 'publisher', 'accessDate', 'url'],
    'newspaper-print': ['title', 'publisher'],
    journal: ['title', 'journal'],
    book: ['title', 'publisher'],
    'book-chapter': ['title', 'bookTitle', 'publisher'],
    report: ['title'],
    'blog-post': ['title', 'siteName', 'accessDate', 'url'],
    'youtube-video': ['title', 'accessDate', 'url'],
    thesis: ['title', 'institution'],
    'ai-chat': ['toolName', 'accessDate'],
};
function noFinalPeriodAfterUrl(s) { return s.trim().replace(/(https?:\/\/\S+)\.$/i, '$1'); }
function removeWebTitleItalics(source, reference) {
    if (source !== 'webpage' && source !== 'wiki-entry')
        return reference;
    // RMIT Harvard website examples show page titles as plain text, not italicised.
    return reference.replace(/<i>(.*?)<\/i>/g, '$1');
}
function normaliseSpacing(reference) {
    return reference
        .replace(/\s+([,.:;])/g, '$1')
        .replace(/([,;])(\S)/g, '$1 $2')
        .replace(/\bdoi:\s+/gi, 'doi:')
        .replace(/\s+/g, ' ')
        .replace(/\.{2,}/g, '.')
        .trim();
}
function repairHarvardDoi(reference) {
    return reference
        .replace(/https?:\/\/(?:dx\.)?doi\.org\//gi, 'doi:')
        .replace(/\bDOI:\s*/g, 'doi:')
        .replace(/\bdoi:\s*/gi, 'doi:');
}
function validateAccessDateShape(reference) {
    const notes = [];
    const m = stripHtml(reference).match(/accessed\s+([^.]*)\./i);
    if (!m)
        return notes;
    const date = m[1].trim();
    if (/^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/.test(date)) {
        notes.push('RMIT Harvard validator warning: access date should be Day Month Year, not Month Day, Year.');
    }
    if (!/^\d{1,2}\s+[A-Z][a-z]+\s+\d{4}$/.test(date) && !/^access date needed$/i.test(date)) {
        notes.push('RMIT Harvard validator warning: check accessed date shape; expected e.g. 19 April 2026.');
    }
    return notes;
}
function requiredNotes(source, data) {
    const notes = [];
    for (const field of REQUIRED[source] || []) {
        if (!has(String(data[field] || '')))
            notes.push(`RMIT Harvard validator warning: missing ${String(field)} for ${source}.`);
    }
    if (!validAuthors(data) && source !== 'legal-act' && source !== 'legal-case' && source !== 'personal-communication') {
        notes.push('RMIT Harvard validator warning: no author/byline detected; reference starts from title/source. Check the page manually.');
    }
    if (!has(data.year) && source !== 'personal-communication') {
        notes.push('RMIT Harvard validator warning: no publication year detected; output uses n.d. until you add a date.');
    }
    if (ONLINE.has(source) && !has(data.accessDate)) {
        notes.push('RMIT Harvard validator warning: online source should include accessed date where the guide requires it.');
    }
    if (source === 'journal' && !has(data.doi) && has(data.url) && !has(data.accessDate)) {
        notes.push('RMIT Harvard validator warning: journal article from a website needs accessed date and URL when no DOI is available.');
    }
    return notes;
}
function confidence(source, data) {
    let score = 100;
    if (!validAuthors(data) && source !== 'personal-communication' && source !== 'legal-act' && source !== 'legal-case')
        score -= 25;
    if (!has(data.year) && source !== 'personal-communication')
        score -= 20;
    for (const field of REQUIRED[source] || [])
        if (!has(String(data[field] || '')))
            score -= 15;
    if (source === 'journal' && !has(data.doi) && !has(data.url))
        score -= 10;
    return Math.max(20, Math.min(100, score));
}
export function validateAndRepairHarvard(source, data, output) {
    let reference = output.reference;
    reference = removeWebTitleItalics(source, reference);
    reference = repairHarvardDoi(reference);
    reference = normaliseSpacing(reference);
    reference = noFinalPeriodAfterUrl(reference);
    const validationNotes = [
        `RMIT Harvard validation confidence: ${confidence(source, data)}%.`,
        ...validateAccessDateShape(reference),
        ...requiredNotes(source, data),
    ];
    return { ...output, reference, notes: [...(output.notes || []), ...validationNotes] };
}
