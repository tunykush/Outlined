const KNOWN_SITE_NAMES: Record<string, string> = {
  'prsa.org': 'PRSA',
  'npr.org': 'National Public Radio',
  'reuters.com': 'Reuters',
  'fortune.com': 'Fortune',
  'forbes.com': 'Forbes',
  'counterpointresearch.com': 'Counterpoint',
  'erm.com': 'ERM',
  'openai.com': 'OpenAI',
  'chatgpt.com': 'ChatGPT',
  'bbc.com': 'BBC News',
  'bbc.co.uk': 'BBC News',
  'vnexpress.net': 'VnExpress',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',

  // Calibrated from the uploaded Harvard reference-list examples.
  'blog.creativeflair.org': 'Creative Flair',
  'creativeflair.org': 'Creative Flair',
  'livinglifefearless.co': 'Living Life Fearless',
  'sociologygroup.com': 'Sociology Group',
  'thanhnien.vn': 'Thanh Nien',
  'saigoneer.com': 'Saigoneer',
  'cand.com.vn': 'CAND',
  'tuoitre.vn': 'Tuoi Tre',
  'nld.com.vn': 'Nguoi Lao Dong',
  'vanhoanghethuat.vn': 'Van hoa Nghe thuat',
  'nhakhoaparis.vn': 'Nha Khoa Paris',
  'statista.com': 'Statista',
  'creativityandmadness.com': 'AIMED',
};

export function knownSiteNameForHost(rawHost: string): string {
  const host = String(rawHost || '').replace(/^www\./i, '').toLowerCase();
  if (!host) return '';
  if (KNOWN_SITE_NAMES[host]) return KNOWN_SITE_NAMES[host];

  const suffix = Object.keys(KNOWN_SITE_NAMES).find((domain) => host.endsWith(`.${domain}`));
  if (suffix) return KNOWN_SITE_NAMES[suffix];

  // RMIT proxy URLs can encode the original host into a proxy subdomain.
  if (/(^|[-.])statista[-.]/i.test(host)) return 'Statista';

  return '';
}

export function hasKnownSiteNameForHost(host: string): boolean {
  return knownSiteNameForHost(host).length > 0;
}
