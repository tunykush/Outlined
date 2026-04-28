# Outlined - TypeScript Citation Generator

Outlined is a full-stack TypeScript citation generator. It fetches reference metadata from public sources, normalizes it into a shared `CitationData` model, and renders reference-list entries plus in-text citations for:

- APA 7th
- RMIT Harvard
- IEEE

The citation rules are split into separate style modules so APA, Harvard, and IEEE can evolve independently without mixing punctuation, DOI, access-date, title, author, and in-text conventions.

## Current Capabilities

### Frontend workflow

- Choose citation style: `APA 7th`, `RMIT Harvard`, or `IEEE`.
- Choose source type manually when needed.
- Paste a public URL into the main URL field.
- The same URL field also accepts DOI and PubMed identifiers without changing the UI:
  - `10.3390/soc14040051`
  - `doi:10.3390/soc14040051`
  - `https://doi.org/10.3390/soc14040051`
  - `38218182`
  - `pmid:38218182`
  - `https://pubmed.ncbi.nlm.nih.gov/38218182/`
- Auto-fetch metadata from URL, DOI, DOI URL, PubMed ID, or PubMed URL.
- Manually refine extracted metadata before copying.
- Regenerate citations as fields change.
- Copy:
  - reference-list entry
  - in-text paraphrase citation
  - in-text narrative citation
  - in-text direct-quote citation
- Display style notes, validation warnings, and metascan findings.

There is intentionally no citation history, user profile, tracking, or `localStorage` reference history.

### Backend API

`POST /api/extract`

```json
{
  "url": "https://example.com/article",
  "style": "harvard"
}
```

The `url` field accepts a URL, DOI, DOI URL, PubMed ID, or PubMed URL. The route returns:

```json
{
  "ok": true,
  "data": {},
  "guessedType": "journal"
}
```

`POST /api/generate`

```json
{
  "style": "apa7",
  "source": "journal",
  "data": {}
}
```

The route returns:

```json
{
  "ok": true,
  "output": {
    "reference": "",
    "intextParaphrase": "",
    "intextQuote": "",
    "intextNarrative": "",
    "notes": []
  }
}
```

The app supports both the local Express server in `src/server/index.ts` and Vercel serverless routes in `api/`.

## Metadata Extraction

URL extraction is best-effort, but it reads multiple metadata layers in priority order:

- JSON-LD: `Article`, `NewsArticle`, `ScholarlyArticle`, `BlogPosting`, `Book`, `Report`
- Highwire Press `citation_*` tags
- Open Graph `og:*`
- Twitter Card metadata
- Dublin Core metadata
- schema.org publication dates
- `<time>` elements
- visible publication-date text
- `@mozilla/readability` title/byline/site-name extraction
- visible DOM byline scanning
- `compromise` NER fallback for author/byline extraction

Extracted fields include:

- authors
- title
- year, month, day
- site name
- publisher
- canonical URL
- journal name
- volume
- issue
- pages
- article number
- DOI
- platform for social/video sources

URL cleanup removes common tracking parameters such as `utm_*`, `fbclid`, `gclid`, `msclkid`, `srsltid`, `mc_cid`, `mc_eid`, `_ga`, `igshid`, `ref`, `source`, and `via`.

Title cleanup removes weak machine titles such as bare URLs, DOI strings, numeric IDs, raw path-like strings, and noisy slug prefixes such as `article-`, `post-`, `chapter-`, `page-`, `entry-`, `node-`, `read-`, `view-`, `blog-`, and `news-`.

## DOI and PubMed Lookup

The reference lookup module is in:

```text
src/server/reference-lookup.ts
```

It detects:

- bare DOI
- `doi:` DOI
- DOI URLs
- bare PubMed IDs
- `pmid:` identifiers
- PubMed URLs

DOI lookup flow:

1. Crossref
2. OpenAlex fallback

PubMed lookup flow:

1. NCBI ESummary

The lookup maps scholarly metadata into `CitationData`, including:

- article title
- authors
- publication date
- journal or container title
- publisher
- volume
- issue
- pages
- article number
- DOI
- DOI URL
- guessed source type

This is most useful for journal articles, where DOI/PubMed metadata is usually cleaner than page HTML.

## Source-Type Detection

The extractor and lookup layers can infer these source types:

- `webpage`
- `webpage-document`
- `wiki-entry`
- `newspaper-online`
- `newspaper-print`
- `journal`
- `book`
- `book-chapter`
- `translated-book`
- `report`
- `blog-post`
- `social-twitter`
- `social-facebook`
- `social-instagram`
- `social-tiktok`
- `youtube-video`
- `film`
- `podcast`
- `streaming-video`
- `tv-series`
- `tv-episode`
- `image`
- `lecture-recording`
- `powerpoint-slides`
- `lab-manual`
- `thesis`
- `legal-act`
- `legal-case`
- `personal-communication`
- `ai-chat`

PDF URLs are detected as `webpage-document`. PDF text extraction/OCR is not yet implemented; the fetcher currently returns a safe pseudo-HTML shell so the user can still generate and refine a document citation.

## URL Safety

URL fetching is protected against SSRF and oversized responses:

- only `http` and `https`
- blocks localhost and private/internal hosts
- blocks private IP ranges
- performs DNS lookup and rejects hosts resolving to private IPs
- 8 second fetch timeout
- 5 MB response cap for text pages
- accepts HTML, XML, text, and PDF URLs
- uses a MediaWiki API fallback for blocked Fandom wiki pages

## Citation Style Modules

```text
src/shared/citation/
  index.ts
  normalize.ts
  styles/
    apa7.ts
    harvard.ts
    ieee.ts
  apa-validation.ts
  harvard-validation.ts
  apa-metascan.ts
  harvard-metascan.ts
  metascan-utils.ts
```

### APA 7

APA support includes:

- APA author formatting: `Last, F. M.`
- no-author title-first references
- title sentence case
- journal references with volume, issue, pages, article number, DOI, and URL fallback
- DOI as `https://doi.org/...`
- no final full stop after DOI/URL
- webpage, news, journal, book, chapter, report, blog, social, AV, image, course material, thesis, legal, personal communication, and AI-chat templates

### RMIT Harvard

RMIT Harvard support includes:

- author format `Family I`
- in-text citations without APA comma, e.g. `(Author 2024)`
- direct quote locators with page, paragraph, section, or timestamp
- article and chapter titles in curly single quotation marks: `U+2018...U+2019`
- webpage/report titles italicized
- `accessed Day Month Year`
- DOI as `doi:10...`
- no invented `n.p.` when publication place is missing
- Harvard-specific handling for online news/site articles calibrated from the uploaded reference-list examples

### IEEE

IEEE support includes:

- numbered in-text citation placeholder `[1]`
- initials-first author format
- journal/book/web/news/course/legal/AI templates
- URL/access-date handling
- notes reminding users to renumber final reference lists by first appearance

## Metascan

Metascan is not a machine-learning model. It is a deterministic, evidence-scored post-generation guardrail.

### Harvard metascan

Repairs or flags:

- APA-like lead shape: `Author. (2024).` -> `Author (2024)`
- APA accessed date shape -> Harvard `Day Month Year`
- DOI URL/prefix -> `doi:`
- final full stop after URL
- straight single quotes -> curly Harvard quotes
- missing/weak accessed date
- missing URL for online sources
- missing DOI for journal metadata with DOI
- `n.p.` invented place warning
- APA `Retrieved from` wording
- source-type evidence warnings

### APA metascan

Repairs or flags:

- `doi:10...` -> `https://doi.org/10...`
- final full stop after DOI/URL
- no-author newspaper references into title-first APA shape
- no-author in-text citations
- Harvard-like article-title quoting
- missing DOI URL when DOI metadata exists
- missing URL when URL source has no DOI
- retrieval-date consideration for changing `n.d.` web pages
- source-type evidence warnings

Each metascan emits confidence notes such as:

```text
RMIT Harvard metascan confidence: 92%.
APA 7 metascan confidence: 95%.
```

## Normalization

Before formatting, `normalizeCitationData` repairs safe objective metadata:

- trims whitespace
- strips HTML fragments from string fields
- normalizes DOI shape
- removes URL tracking parameters
- normalizes English month names
- normalizes day values
- deduplicates authors and editors
- derives readable site names from known hosts
- preserves known Harvard site names calibrated from uploaded clean reference lists
- fills AI-tool creator defaults where appropriate

## Install and Run

```bash
npm install
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## Tests

```bash
npm run typecheck
npm run test:reference
npm run test:harvard
npm run test:apa
npm run test:styles
npm run build
```

Current test coverage includes:

- Harvard golden reference smoke tests
- Harvard metascan repair/source-detection tests
- APA metascan repair/evidence tests
- shared style smoke tests for APA, Harvard, and IEEE
- DOI/PubMed/Crossref/OpenAlex metadata mapping tests

## Current Limitations

- URL extraction depends on the quality of page metadata and may need manual review.
- PDF text extraction/OCR is not implemented yet.
- DOI/PubMed lookup depends on public scholarly APIs being reachable.
- IEEE currently uses `[1]` as a placeholder; users must renumber references by final order of appearance.
- The system is rule-based and evidence-scored, not a self-training model.
