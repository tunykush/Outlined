/**
 * Shared types between server and client.
 * Models the data needed to produce APA 7th citations per RMIT Easy Cite.
 */

/** Citation styles supported (RMIT offers 7) */
export type CitationStyle =
  | 'apa7'
  | 'harvard'
  | 'chicagoA'
  | 'chicagoB'
  | 'ieee'
  | 'vancouver'
  | 'aglc4';

/**
 * Source type categories. Matches the right-hand menu in RMIT Easy Cite
 * (Books, Journal articles, Newspaper articles, Webpages, Social media, etc.)
 */
export type SourceType =
  | 'webpage'           // generic public webpage
  | 'newspaper-online'  // newspaper article from website
  | 'newspaper-print'   // newspaper article in print
  | 'journal'           // journal article (scholarly)
  | 'book'              // book or e-book
  | 'book-chapter'      // chapter in edited book
  | 'report'            // government / corporate / NGO report (PDF)
  | 'blog-post'         // blog post
  | 'social-twitter'    // X / Twitter post
  | 'social-facebook'   // Facebook post
  | 'social-instagram'; // Instagram post

/** A single author or contributor */
export interface Author {
  /** Family name (last name). For organisations, put org name here and leave given empty */
  family: string;
  /** Given names — used to extract initials per APA */
  given: string;
  /** Is this an organisational author? (skips initial-extraction) */
  isOrganisation?: boolean;
}

/**
 * Normalized citation data — populated from auto-extraction OR manual entry.
 * Every field is optional because real-world web pages have wildly varying metadata.
 */
export interface CitationData {
  // ---- common ----
  authors: Author[];
  /** Year of publication, e.g. "2024" or "n.d." */
  year: string;
  /** Month full name, e.g. "March" — used for newspapers, blogs, social */
  month: string;
  /** Day of month, e.g. "15" */
  day: string;
  title: string;
  /** URL of the source */
  url: string;
  /** Date the user accessed/retrieved the source — only used by some styles */
  accessDate: string;

  // ---- webpage / news ----
  siteName: string;       // e.g. "BBC News", "RMIT Library"
  publisher: string;      // e.g. "The Sydney Morning Herald", "Australian Institute of Health"

  // ---- journal ----
  journal: string;
  volume: string;
  issue: string;
  pages: string;          // e.g. "183-206"
  articleNumber: string;  // e.g. "e70070" — APA 7th rule for online journals w/o page numbers
  doi: string;

  // ---- book ----
  edition: string;        // e.g. "2nd"
  place: string;          // place of publication (Harvard / Chicago)
  // book chapter
  bookTitle: string;
  editors: Author[];

  // ---- social ----
  username: string;       // e.g. "@BarackObama"
  platform: string;       // "X", "Twitter", "Facebook", "Instagram", "TikTok"

  // ---- report ----
  reportNumber: string;
}

/** Result returned from /api/extract */
export interface ExtractResult {
  ok: boolean;
  /** When ok, partial CitationData populated from page metadata */
  data?: Partial<CitationData>;
  /** Best guess of source type, useful as default UI selection */
  guessedType?: SourceType;
  /** Error code when !ok */
  code?: string;
  /** Error message when !ok */
  message?: string;
}

/** Output from a citation generator */
export interface CitationOutput {
  /** Reference list entry (HTML — italics preserved with <i>) */
  reference: string;
  /** In-text paraphrase citation */
  intextParaphrase: string;
  /** In-text direct quote citation (author, year, p. X) */
  intextQuote: string;
  /** Style-specific notes / tips for the user (e.g. "Add hanging indent in Word") */
  notes: string[];
}
