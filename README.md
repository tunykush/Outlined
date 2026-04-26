# Outlined — TypeScript Full-Stack

A citation reference generator built end-to-end in TypeScript, with separate style modules for:

- APA 7th edition, based on the uploaded RMIT APA 7th Style Guide PDF
- RMIT Harvard, based only on the uploaded RMIT Harvard Style Guide PDF

The app lets a user paste a public URL, auto-extract metadata where possible, choose a supported source type, manually refine missing fields, and generate a reference-list entry plus in-text citations.

## What changed in this refactor

The citation engine is now split by style instead of mixing everything into one file:

```text
src/shared/citation/
  index.ts                  # chooses APA 7th or RMIT Harvard
  styles/
    apa7.ts                 # APA 7th-only rules
    harvard.ts              # RMIT Harvard-only rules
src/shared/citation-engine.ts # compatibility wrapper for existing imports
```

This matters because APA 7th and RMIT Harvard share an author-date idea, but their punctuation, DOI, access-date, quote, newspaper, social media, and web rules are different.

## Supported styles

Only these two styles are exposed in the UI:

```text
APA 7th
RMIT Harvard
```

Unsupported styles such as IEEE, Chicago, Vancouver, and AGLC were removed from the picker so the app does not pretend to generate styles that have not been validated.

## RMIT Harvard implementation notes

The Harvard module includes rules for the existing source types in the app, including:

- webpage and webpage document / PDF
- wiki-style webpage article
- online and print newspaper / magazine article
- journal article, including DOI and article-number support
- book, e-book, translated book, and edited book chapter
- report
- blog post
- X/Twitter, Facebook, Instagram, and TikTok social posts
- YouTube video, film/movie, podcast, streaming video, TV series, and TV episode
- image/table
- lecture recording, PowerPoint slides, and practical/lab manual
- thesis/dissertation
- Act of Parliament and legal case
- personal communication
- AI-generated chat/tool output

RMIT Harvard output uses author-date in-text citations without the APA comma, for example:

```text
(Papadopoulou 2020)
(Papadopoulou 2020:686)
```

Digital sources use `accessed Day Month Year` where the RMIT Harvard PDF requires it.

## Install and run

```bash
npm install
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

## API

```text
POST /api/extract
body: { "url": "https://example.com" }
```

```text
POST /api/generate
body: { "style": "apa7" | "harvard", "source": "webpage", "data": CitationData }
```

## Important limitation

Auto-extraction is best-effort. Many websites expose incomplete or misleading metadata. The app now gives cleaner source-type detection and formatting, but users should still review author, title, date, website name, and access date before copying the final reference.
