/**
 * Outlined — Client app (TypeScript).
 *
 * Flow:
 *   1. User picks style + source type
 *   2. User pastes URL → /api/extract fills the form
 *   3. User reviews / edits fields
 *   4. /api/generate returns the formatted reference + in-text citations
 */

import { ApiError, extractMetadata, generateCitation } from './api.js';
import {
  FORM_SCHEMAS,
  SOURCE_TYPE_LABELS,
  STYLE_LABELS,
  type FieldDef,
} from './form-schemas.js';
import type {
  Author,
  CitationData,
  CitationStyle,
  SourceType,
} from '../shared/types.js';

/* ============================================================
 * STATE
 * ============================================================ */

interface AppState {
  style: CitationStyle;
  source: SourceType;
  data: CitationData;
}

function emptyData(): CitationData {
  return {
    authors: [{ family: '', given: '' }],
    year: '',
    month: '',
    day: '',
    title: '',
    url: '',
    accessDate: '',
    quotePage: '',
    quotePages: '',
    quoteSection: '',
    quoteParagraph: '',
    timestamp: '',
    siteName: '',
    publisher: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    articleNumber: '',
    doi: '',
    edition: '',
    place: '',
    bookTitle: '',
    editors: [{ family: '', given: '' }],
    editorsText: '',
    translatorsText: '',
    originalYear: '',
    username: '',
    platform: '',
    description: '',
    postType: '',
    format: '',
    seriesTitle: '',
    season: '',
    episode: '',
    productionCompanies: '',
    writersText: '',
    directorsText: '',
    producersText: '',
    hostRole: '',
    reportNumber: '',
    institution: '',
    repository: '',
    jurisdiction: '',
    section: '',
    reporter: '',
    volumeLegal: '',
    startingPage: '',
    appendix: '',
    toolName: '',
  };
}

const state: AppState = {
  style: 'apa7',
  source: 'webpage',
  data: emptyData(),
};

/* ============================================================
 * DOM HELPERS
 * ============================================================ */

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | EventListener> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v as string;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (typeof v === 'string') {
      node.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function setStatus(msg: string, kind: 'info' | 'success' | 'warn' | 'error'): void {
  const box = $('statusBox') as HTMLDivElement;
  box.className = `status status--${kind} status--show`;
  box.innerHTML = msg;
}

function clearStatus(): void {
  const box = $('statusBox') as HTMLDivElement;
  box.className = 'status';
  box.innerHTML = '';
}

/* ============================================================
 * RENDER STYLE PICKER
 * ============================================================ */

function renderStyleBar(): void {
  const bar = $('styleBar');
  bar.innerHTML = '';
  (Object.keys(STYLE_LABELS) as CitationStyle[]).forEach((s) => {
    const btn = el(
      'button',
      {
        class: 'style-btn' + (state.style === s ? ' style-btn--active' : ''),
        type: 'button',
        'data-style': s,
        onclick: () => {
          state.style = s;
          renderStyleBar();
          regenerate();
        },
      },
      STYLE_LABELS[s]
    );
    bar.appendChild(btn);
  });
}

/* ============================================================
 * RENDER SOURCE TABS
 * ============================================================ */

function renderSourceTabs(): void {
  const tabs = $('sourceTabs');
  tabs.innerHTML = '';
  (Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).forEach((t) => {
    const btn = el(
      'button',
      {
        class: 'source-tab' + (state.source === t ? ' source-tab--active' : ''),
        type: 'button',
        onclick: () => {
          state.source = t;
          renderSourceTabs();
          renderForm();
          regenerate();
        },
      },
      SOURCE_TYPE_LABELS[t]
    );
    tabs.appendChild(btn);
  });
}

/* ============================================================
 * RENDER FORM
 * ============================================================ */

function renderForm(): void {
  const grid = $('formGrid');
  grid.innerHTML = '';
  if (!state.data.authors || state.data.authors.length === 0) {
    state.data.authors = [{ family: '', given: '' }];
  }

  // Authors block — always at top
  const authBlock = el('div', { class: 'field field--full' });
  authBlock.appendChild(el('label', { class: 'field__label' }, 'Authors / creators'));
  const list = el('div', { class: 'authors', id: 'authorsList' });
  authBlock.appendChild(list);
  authBlock.appendChild(
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn--text btn--mini',
        onclick: () => {
          state.data.authors.push({ family: '', given: '' });
          renderForm();
        },
      },
      '+ Add author'
    )
  );
  authBlock.appendChild(
    el(
      'div',
      { class: 'field__hint' },
      'For organisational authors (e.g. WHO), put the full name in Family and tick the org box.'
    )
  );
  grid.appendChild(authBlock);

  state.data.authors.forEach((_, idx) => renderAuthorRow(list, idx));

  // Other fields per schema
  const fields = FORM_SCHEMAS[state.source];
  for (const def of fields) renderField(grid, def);
}

function renderAuthorRow(list: HTMLElement, idx: number): void {
  const row = el('div', { class: 'author-row' });
  const a = state.data.authors[idx];

  const famInput = el('input', {
    type: 'text',
    placeholder: 'Family name (Smith)',
    value: a.family,
  }) as HTMLInputElement;
  famInput.addEventListener('input', () => {
    state.data.authors[idx].family = famInput.value;
    debouncedGenerate();
  });

  const givInput = el('input', {
    type: 'text',
    placeholder: 'Given names (John A.)',
    value: a.given,
  }) as HTMLInputElement;
  givInput.addEventListener('input', () => {
    state.data.authors[idx].given = givInput.value;
    debouncedGenerate();
  });

  const orgLabel = el('label', { class: 'org-toggle' });
  const orgChk = el('input', { type: 'checkbox' }) as HTMLInputElement;
  if (a.isOrganisation) orgChk.checked = true;
  orgChk.addEventListener('change', () => {
    state.data.authors[idx].isOrganisation = orgChk.checked;
    debouncedGenerate();
  });
  orgLabel.appendChild(orgChk);
  orgLabel.appendChild(document.createTextNode(' Org'));

  const rm = el(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      title: 'Remove',
      onclick: () => {
        if (state.data.authors.length <= 1) {
          state.data.authors[0] = { family: '', given: '' };
        } else {
          state.data.authors.splice(idx, 1);
        }
        renderForm();
        debouncedGenerate();
      },
    },
    '×'
  );

  row.appendChild(famInput);
  row.appendChild(givInput);
  row.appendChild(orgLabel);
  row.appendChild(rm);
  list.appendChild(row);
}

function renderField(grid: HTMLElement, def: FieldDef): void {
  const wrap = el('div', { class: 'field' + (def.full ? ' field--full' : '') });
  wrap.appendChild(el('label', { class: 'field__label' }, def.label));

  const isLong = [
    'title', 'bookTitle', 'reportNumber', 'productionCompanies', 'writersText',
    'directorsText', 'producersText', 'editorsText', 'translatorsText', 'appendix'
  ].includes(String(def.key));
  const tag = isLong ? 'textarea' : 'input';
  const input = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
  if (input instanceof HTMLInputElement) {
    input.type = def.type || 'text';
  } else {
    input.rows = 2;
  }
  input.placeholder = def.placeholder || '';
  const currentValue = state.data[def.key];
  input.value = typeof currentValue === 'string' ? currentValue : '';
  input.addEventListener('input', () => {
    // Use indexed assignment with type assertion for known field
    (state.data as unknown as Record<string, unknown>)[def.key] = input.value;
    debouncedGenerate();
  });
  wrap.appendChild(input);
  if (def.hint) wrap.appendChild(el('div', { class: 'field__hint' }, def.hint));
  grid.appendChild(wrap);
}

/* ============================================================
 * GENERATE — call backend
 * ============================================================ */

let genTimer: number | null = null;
function debouncedGenerate(): void {
  if (genTimer) window.clearTimeout(genTimer);
  genTimer = window.setTimeout(() => {
    void regenerate();
  }, 250);
}

async function regenerate(): Promise<void> {
  // Skip if nothing meaningful entered yet
  const hasAnything =
    state.data.title.trim() ||
    state.data.authors.some((a) => a.family.trim() || a.given.trim()) ||
    state.data.url.trim();
  const refOut = $('referenceOut') as HTMLDivElement;
  const intextOut = $('intextOut') as HTMLDivElement;
  const narrativeOut = $('narrativeOut') as HTMLDivElement | null;
  const quoteOut = $('quoteOut') as HTMLDivElement;
  const notesOut = $('notesOut') as HTMLDivElement;

  if (!hasAnything) {
    refOut.innerHTML = '<span class="placeholder">Citation sẽ hiện ở đây sau khi bạn fetch URL hoặc điền thông tin.</span>';
    intextOut.innerHTML = '<span class="placeholder">—</span>';
    if (narrativeOut) narrativeOut.innerHTML = '<span class="placeholder">--</span>';
    quoteOut.innerHTML = '<span class="placeholder">--</span>';
    notesOut.innerHTML = '';
    return;
  }

  try {
    const out = await generateCitation(state.style, state.source, state.data);
    refOut.innerHTML = out.reference;
    intextOut.innerHTML = out.intextParaphrase;
    if (narrativeOut) narrativeOut.innerHTML = out.intextNarrative;
    quoteOut.innerHTML = out.intextQuote;
    notesOut.innerHTML = out.notes.length
      ? out.notes.map((n) => `<li>${n}</li>`).join('')
      : '';
  } catch (e: unknown) {
    if (e instanceof ApiError) {
      refOut.innerHTML = `<span class="placeholder">⚠ ${e.message}</span>`;
    }
  }
}

/* ============================================================
 * EXTRACT — fetch + parse from URL
 * ============================================================ */

async function handleFetch(): Promise<void> {
  const input = $('urlInput') as HTMLInputElement;
  const url = input.value.trim();
  if (!url) {
    setStatus('Hãy paste một URL.', 'warn');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    setStatus('URL phải bắt đầu bằng http:// hoặc https://', 'warn');
    return;
  }

  const btn = $('fetchBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.classList.add('is-loading');
  setStatus('<span class="spinner"></span> Đang đọc trang web…', 'info');

  try {
    const result = await extractMetadata(url);
    if (!result.data) {
      setStatus('⚠ Không trích xuất được dữ liệu. Vui lòng điền thủ công.', 'warn');
      return;
    }

    // Merge fetched data into state
    Object.assign(state.data, result.data);
    if (result.data.authors) {
      const fetchedAuthors = result.data.authors as Author[];
      state.data.authors = fetchedAuthors.length > 0 ? fetchedAuthors : [{ family: '', given: '' }];
    }

    // Switch source type to guess
    if (result.guessedType) {
      state.source = result.guessedType;
      renderSourceTabs();
    }

    renderForm();
    void regenerate();

    const filledFields: string[] = [];
    if (result.data.title) filledFields.push('title');
    const realAuthorCount = (result.data.authors || []).filter((a) => a.family?.trim() || a.given?.trim()).length;
    if (realAuthorCount) filledFields.push(`${realAuthorCount} author(s)`);
    if (result.data.year) filledFields.push('date');
    if (result.data.siteName) filledFields.push('site');
    if (result.data.journal) filledFields.push('journal');
    if (result.data.doi) filledFields.push('DOI');

    setStatus(
      `✓ Trích xuất thành công: <strong>${filledFields.join(', ') || 'partial — vui lòng kiểm tra'}</strong>. Auto-detected source: <strong>${SOURCE_TYPE_LABELS[result.guessedType || 'webpage']}</strong>.`,
      'success'
    );
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const map: Record<string, string> = {
      INVALID_URL: 'URL không hợp lệ',
      INVALID_PROTOCOL: 'Chỉ chấp nhận http/https',
      BLOCKED_HOST: 'URL nội bộ bị chặn',
      DNS_FAIL: 'Không tìm thấy domain',
      TIMEOUT: 'Quá thời gian phản hồi',
      TOO_LARGE: 'Trang quá lớn',
      NOT_HTML: 'Không phải trang HTML',
      FETCH_FAIL: 'Trang web không phản hồi',
    };
    const title = map[err.code || ''] || 'Lỗi không xác định';
    setStatus(`⚠ ${title} — ${err.message || ''}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

/* ============================================================
 * COPY HANDLERS
 * ============================================================ */

async function copyHtmlAndText(elementId: string): Promise<void> {
  const target = $(elementId);
  const html = target.innerHTML;
  const text = target.textContent || '';

  try {
    if ('ClipboardItem' in window && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    setStatus('✓ Đã copy (giữ định dạng italic).', 'success');
    window.setTimeout(clearStatus, 1800);
  } catch {
    setStatus('⚠ Không thể truy cập clipboard.', 'error');
  }
}

/* ============================================================
 * INIT
 * ============================================================ */

function init(): void {
  renderStyleBar();
  renderSourceTabs();
  renderForm();

  $('fetchBtn').addEventListener('click', () => void handleFetch());

  ($('urlInput') as HTMLInputElement).addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter') {
      e.preventDefault();
      void handleFetch();
    }
  });

  $('clearBtn').addEventListener('click', () => {
    state.data = emptyData();
    ($('urlInput') as HTMLInputElement).value = '';
    clearStatus();
    renderForm();
    void regenerate();
  });

  $('copyRefBtn').addEventListener('click', () => void copyHtmlAndText('referenceOut'));
  $('copyIntextBtn').addEventListener('click', () => void copyHtmlAndText('intextOut'));
  const copyQuoteBtn = document.getElementById('copyQuoteBtn');
  if (copyQuoteBtn) copyQuoteBtn.addEventListener('click', () => void copyHtmlAndText('quoteOut'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
