/**
 * Shared types between server and client.
 * Models the data needed to produce APA 7th citations per RMIT Easy Cite.
 */

/** Citation styles currently implemented and validated against uploaded RMIT PDFs. */
export type CitationStyle = 'apa7' | 'harvard';

/**
 * Source type categories covered by the RMIT Easy Cite APA 7th PDF.
 */
export type SourceType =
  | 'webpage'
  | 'webpage-document'
  | 'wiki-entry'
  | 'newspaper-online'
  | 'newspaper-print'
  | 'journal'
  | 'book'
  | 'book-chapter'
  | 'translated-book'
  | 'report'
  | 'blog-post'
  | 'social-twitter'
  | 'social-facebook'
  | 'social-instagram'
  | 'social-tiktok'
  | 'youtube-video'
  | 'film'
  | 'podcast'
  | 'streaming-video'
  | 'tv-series'
  | 'tv-episode'
  | 'image'
  | 'lecture-recording'
  | 'powerpoint-slides'
  | 'lab-manual'
  | 'thesis'
  | 'legal-act'
  | 'legal-case'
  | 'personal-communication'
  | 'ai-chat';

/** A single author or contributor. */
export interface Author {
  /** Family name (last name). For organisations, put org name here and leave given empty. */
  family: string;
  /** Given names — used to extract initials per APA. */
  given: string;
  /** Is this an organisational author? (skips initial-extraction). */
  isOrganisation?: boolean;
}

/**
 * Normalized citation data — populated from auto-extraction OR manual entry.
 * Every field is optional-ish in the UI, but represented as strings/arrays for predictable rendering.
 */
export interface CitationData {
  // ---- common ----
  authors: Author[];
  year: string;
  month: string;
  day: string;
  title: string;
  url: string;
  accessDate: string;
  /** Optional style-specific author display used by Harvard reference validation when a source accepted reference uses a shortened author label such as Bermudez et al. */
  referenceAuthorText: string;

  // ---- direct quote locator ----
  quotePage: string;
  quotePages: string;
  quoteSection: string;
  quoteParagraph: string;
  timestamp: string;

  // ---- webpage / news / publisher ----
  siteName: string;
  publisher: string;

  // ---- journal ----
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  articleNumber: string;
  doi: string;

  // ---- book / chapter ----
  edition: string;
  place: string;
  bookTitle: string;
  editors: Author[];
  editorsText: string;
  translatorsText: string;
  originalYear: string;

  // ---- social / AV / course materials ----
  username: string;
  platform: string;
  description: string; // e.g. Image attached, Photograph, Video, Audio podcast, Film
  postType: string; // e.g. Post, Tweet, Status update
  format: string; // e.g. PowerPoint slides, Practical manual, Lecture recording, Doctoral dissertation
  seriesTitle: string;
  season: string;
  episode: string;
  productionCompanies: string;
  writersText: string;
  directorsText: string;
  producersText: string;
  hostRole: string; // Host, Producer, Executive Producer, Director, etc.

  // ---- report / thesis / legal / AI ----
  reportNumber: string;
  institution: string;
  repository: string;
  jurisdiction: string;
  section: string;
  reporter: string;
  volumeLegal: string;
  startingPage: string;
  appendix: string;
  toolName: string;
}

/** Result returned from /api/extract. */
export interface ExtractResult {
  ok: boolean;
  data?: Partial<CitationData>;
  guessedType?: SourceType;
  code?: string;
  message?: string;
}

/** Output from a citation generator. */
export interface CitationOutput {
  /** Reference list entry (HTML — italics preserved with <i>). */
  reference: string;
  /** In-text paraphrase citation. */
  intextParaphrase: string;
  /** In-text direct quote citation. */
  intextQuote: string;
  /** Optional narrative citation, useful for presentations/writing. */
  intextNarrative: string;
  /** Style-specific notes / tips for the user. */
  notes: string[];
}
