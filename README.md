# Outlined — Ref gen

A citation reference generator built **end-to-end in TypeScript**, with the rules transcribed
directly from RMIT Library's *Easy Cite APA 7th Edition Style Guide*.

Paste any public URL → the system fetches the page, parses metadata, infers the source type,
and produces a citation that follows the RMIT rules — to the comma, to the italics, to the DOI prefix.

---

## Why this exists

Most citation generators on the web mangle the rules. This one is small, traceable, and faithful:
every rule in the engine is mapped to a specific page in the RMIT Easy Cite PDF, with a comment.

---

## Features

### Backend (Node + TypeScript + Express)
- `POST /api/extract` — given a URL, fetches HTML and returns normalised `CitationData`.
- `POST /api/generate` — given style + source type + data, returns `{ reference, intextParaphrase, intextQuote, notes }`.
- **Metadata extraction** in priority order:
  1. JSON-LD (Article / NewsArticle / ScholarlyArticle / Book / WebPage)
  2. Highwire `citation_*` tags (the strongest signal for academic content)
  3. Open Graph
  4. Twitter Cards
  5. Dublin Core (`dc.*`, `DC.*`)
  6. Generic meta + fallback to `<title>` / `<h1>`
- **Source-type detection** — picks the right RMIT category (journal / news / blog / social / etc.) from metadata signals.
- **SSRF protection** — blocks `localhost`, RFC 1918 private ranges, link-local, loopback, multicast, IPv6 private. DNS rebinding defence (re-checks resolved IPs).
- **Robust fetch** — 8s timeout, 5MB response cap, content-type check, follows redirects.

### Citation Engine (TypeScript, shared between client & server)
APA 7th rules implemented per source type:
- **Webpage** (PDF p. 32-35) — author handling, italicised title, site-name omission when equal to author.
- **Newspaper online / print** (p. 22-25) — article title plain, periodical italicised.
- **Journal article** (p. 17-22) — italicised journal & volume, parenthetical issue, DOI normalisation, article-number rule for online articles without page ranges, 1-2-3-20-21+ author thresholds.
- **Book / E-book** (p. 11-16) — edition handling, DOI for e-books, "1st" edition omitted.
- **Book chapter** (p. 14-15) — In + editor list, page range in parens.
- **Report** (p. 56-57) — report number after title, publisher omitted if equal to author.
- **Blog post** (p. 35-36) — italicised blog name, plain post title.
- **Twitter / Facebook / Instagram** (p. 36-40) — first 20 words of post as italicised title, descriptors `[Post]`, `[Status update]`, `[Photograph]`.
- **In-text** parenthetical and direct-quote forms with et al. rule, n.d. fallback, and section/paragraph locator support.

Plus minimal RMIT Harvard support (showing the architecture supports multiple styles).

### Frontend (TypeScript, bundled with esbuild)
- **Claude design system** — parchment background, terracotta brand, serif headlines.
- **7-style picker** at the top (APA 7th, RMIT Harvard, Chicago A/B, IEEE, Vancouver, AGLC4).
- **11 source types** with tab switcher.
- **Auto-fetch** button → metadata fills the form, source type auto-selected.
- **Live regeneration** — every keystroke updates the citation (debounced 250ms).
- **Copy as rich text** — italics preserved when pasting into Word.
- **Status messages** for loading / success / partial / error states.
- **In-line guidance notes** from the engine (e.g. "Apply hanging indent in Word").

---

## Project structure

```
refgen-ts/
├── package.json
├── tsconfig.json              # client + shared config
├── tsconfig.server.json       # server-specific overrides
├── README.md
├── src/
│   ├── shared/
│   │   ├── types.ts           # CitationData, CitationStyle, SourceType, ...
│   │   └── citation-engine.ts # APA rules transcribed from PDF
│   ├── server/
│   │   ├── index.ts           # Express entry
│   │   ├── safety.ts          # SSRF protection
│   │   ├── fetcher.ts         # Safe HTML fetcher
│   │   └── extractor.ts       # cheerio-based metadata parser
│   └── client/
│       ├── main.ts            # App orchestration
│       ├── api.ts             # Typed fetch wrappers
│       └── form-schemas.ts    # Field schema per source type
└── public/
    ├── index.html             # Claude-styled UI
    ├── styles.css             # Claude design tokens
    └── app.js                 # Built bundle (generated)
```

---

## Setup

Requires **Node.js 18+** (uses native `fetch`, `AbortController`).

```bash
npm install
npm run build         # bundles client + typechecks server
npm start             # runs server with tsx
```

For development:
```bash
npm run dev           # auto-reload + watch client bundle
# (or in two terminals)
npm run watch:client
npm run dev:server
```

Then open <http://localhost:3000>.

---

## API reference

### `POST /api/extract`
**Request:** `{ url: string }`

**Response (success):**
```json
{
  "ok": true,
  "guessedType": "journal",
  "data": {
    "title": "...",
    "authors": [{"family": "Smith", "given": "John A."}],
    "year": "2024",
    "journal": "Nature",
    "volume": "615",
    "issue": "3",
    "pages": "183-206",
    "doi": "10.1038/...",
    "url": "https://..."
  }
}
```

### `POST /api/generate`
**Request:**
```json
{
  "style": "apa7",
  "source": "journal",
  "data": { /* CitationData */ }
}
```

**Response:**
```json
{
  "ok": true,
  "output": {
    "reference": "Smith, J. A. (2024). Title. <i>Nature</i>, <i>615</i>(3), 183-206. https://doi.org/...",
    "intextParaphrase": "(Smith, 2024)",
    "intextQuote": "(Smith, 2024, p. 183)",
    "notes": ["In Word: select the entry and apply a hanging indent..."]
  }
}
```

### Error codes
| Code | Status | Meaning |
|------|--------|---------|
| `MISSING_URL` | 400 | URL not provided |
| `INVALID_URL` | 400 | Malformed URL |
| `INVALID_PROTOCOL` | 400 | Not http/https |
| `BLOCKED_HOST` | 403 | Private/internal host blocked |
| `DNS_FAIL` | 404 | Could not resolve hostname |
| `FETCH_FAIL` | 502 | Target site refused / non-200 |
| `NOT_HTML` | 415 | Content-Type isn't HTML |
| `TOO_LARGE` | 413 | Response exceeds 5MB |
| `TIMEOUT` | 504 | Took longer than 8s |

---

## How the rules were encoded

The APA section of `citation-engine.ts` is structured by source type, with each function:
1. Has a doc comment naming the PDF page(s) the rule comes from.
2. Implements the formatting *exactly* as the examples in the PDF.
3. Handles edge cases mentioned in the rules (1/2/3-20/21+ authors, n.d., DOI normalisation, omission rules, article-number locator, etc.).

This makes the code auditable: a reviewer can open the PDF on one screen and the function on another to verify correctness.

---

## Adding a new style

1. Add the style key to the `CitationStyle` union in `src/shared/types.ts`.
2. Add a label in `src/client/form-schemas.ts` `STYLE_LABELS`.
3. Implement the generator function(s) in `src/shared/citation-engine.ts` and dispatch from `generate()`.

The architecture is designed so adding a new style is purely additive — no changes to the form, server, or extractor.
