import type {
  CitationData,
  CitationOutput,
  CitationStyle,
  ExtractResult,
  SourceType,
} from '../shared/types.js';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function extractMetadata(url: string): Promise<ExtractResult> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  let payload: ExtractResult | null = null;
  try {
    payload = (await res.json()) as ExtractResult;
  } catch {
    /* ignore */
  }
  if (!res.ok || !payload || !payload.ok) {
    throw new ApiError(
      payload?.code || 'NETWORK_ERROR',
      payload?.message || `Server returned ${res.status}`
    );
  }
  return payload;
}

interface GenerateResponse {
  ok: boolean;
  output?: CitationOutput;
  code?: string;
  message?: string;
}

export async function generateCitation(
  style: CitationStyle,
  source: SourceType,
  data: CitationData
): Promise<CitationOutput> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style, source, data }),
  });
  let payload: GenerateResponse | null = null;
  try {
    payload = (await res.json()) as GenerateResponse;
  } catch {
    /* ignore */
  }
  if (!res.ok || !payload || !payload.ok || !payload.output) {
    throw new ApiError(
      payload?.code || 'GENERATE_FAIL',
      payload?.message || 'Không tạo được citation.'
    );
  }
  return payload.output;
}
