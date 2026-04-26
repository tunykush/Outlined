"use strict";
(() => {
  // src/client/api.ts
  var ApiError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };
  async function extractMetadata(url) {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
    }
    if (!res.ok || !payload || !payload.ok) {
      throw new ApiError(
        payload?.code || "NETWORK_ERROR",
        payload?.message || `Server returned ${res.status}`
      );
    }
    return payload;
  }
  async function generateCitation(style, source, data) {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, source, data })
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
    }
    if (!res.ok || !payload || !payload.ok || !payload.output) {
      throw new ApiError(
        payload?.code || "GENERATE_FAIL",
        payload?.message || "Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c citation."
      );
    }
    return payload.output;
  }

  // src/client/form-schemas.ts
  var F = {
    year: { key: "year", label: "Year", placeholder: "2024", hint: "Use n.d. if unknown" },
    month: { key: "month", label: "Month", placeholder: "March", hint: "Full English name" },
    day: { key: "day", label: "Day", placeholder: "15", type: "number" },
    title: { key: "title", label: "Title", placeholder: "The article or page title", full: true },
    url: { key: "url", label: "URL", placeholder: "https://...", type: "url", full: true },
    accessDate: { key: "accessDate", label: "Date accessed", placeholder: "15 March 2024" },
    siteName: { key: "siteName", label: "Website name", placeholder: "BBC News" },
    publisher: { key: "publisher", label: "Publisher", placeholder: "The Sydney Morning Herald" },
    journal: { key: "journal", label: "Journal name", placeholder: "Nature" },
    volume: { key: "volume", label: "Volume", placeholder: "42" },
    issue: { key: "issue", label: "Issue", placeholder: "3" },
    pages: { key: "pages", label: "Pages", placeholder: "183-206" },
    articleNumber: { key: "articleNumber", label: "Article number", placeholder: "e70070", hint: "For online articles without page range" },
    doi: { key: "doi", label: "DOI", placeholder: "10.1038/..." },
    edition: { key: "edition", label: "Edition", placeholder: "2nd", hint: "Leave blank for 1st edition" },
    place: { key: "place", label: "Place of publication", placeholder: "Melbourne" },
    bookTitle: { key: "bookTitle", label: "Book title", placeholder: "The Handbook of...", full: true },
    username: { key: "username", label: "Username / handle", placeholder: "@BarackObama" },
    platform: { key: "platform", label: "Platform", placeholder: "X / Twitter / TikTok" },
    reportNumber: { key: "reportNumber", label: "Report number", placeholder: "Cat. No. HSE 176" }
  };
  var FORM_SCHEMAS = {
    webpage: [F.year, F.month, F.day, F.title, F.siteName, F.url, F.accessDate],
    "newspaper-online": [F.year, F.month, F.day, F.title, F.publisher, F.url],
    "newspaper-print": [F.year, F.month, F.day, F.title, F.publisher, F.pages],
    journal: [F.year, F.title, F.journal, F.volume, F.issue, F.pages, F.articleNumber, F.doi, F.url],
    book: [F.year, F.title, F.edition, F.publisher, F.place, F.doi, F.url],
    "book-chapter": [F.year, F.title, F.bookTitle, F.edition, F.pages, F.publisher],
    report: [F.year, F.title, F.reportNumber, F.publisher, F.url],
    "blog-post": [F.year, F.month, F.day, F.title, F.siteName, F.url],
    "social-twitter": [F.year, F.month, F.day, F.title, F.username, F.url],
    "social-facebook": [F.year, F.month, F.day, F.title, F.url],
    "social-instagram": [F.year, F.month, F.day, F.title, F.username, F.url]
  };
  var SOURCE_TYPE_LABELS = {
    webpage: "Webpage",
    "newspaper-online": "News (online)",
    "newspaper-print": "News (print)",
    journal: "Journal article",
    book: "Book / E-book",
    "book-chapter": "Book chapter",
    report: "Report / PDF",
    "blog-post": "Blog post",
    "social-twitter": "X (Twitter)",
    "social-facebook": "Facebook",
    "social-instagram": "Instagram"
  };
  var STYLE_LABELS = {
    apa7: "APA 7th",
    harvard: "RMIT Harvard",
    chicagoA: "Chicago A",
    chicagoB: "Chicago B",
    ieee: "IEEE",
    vancouver: "Vancouver",
    aglc4: "AGLC4"
  };

  // src/client/main.ts
  function emptyData() {
    return {
      authors: [{ family: "", given: "" }],
      year: "",
      month: "",
      day: "",
      title: "",
      url: "",
      accessDate: "",
      siteName: "",
      publisher: "",
      journal: "",
      volume: "",
      issue: "",
      pages: "",
      articleNumber: "",
      doi: "",
      edition: "",
      place: "",
      bookTitle: "",
      editors: [],
      username: "",
      platform: "",
      reportNumber: ""
    };
  }
  var state = {
    style: "apa7",
    source: "webpage",
    data: emptyData()
  };
  function $(id) {
    const el2 = document.getElementById(id);
    if (!el2)
      throw new Error(`Missing #${id}`);
    return el2;
  }
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class")
        node.className = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (typeof v === "string") {
        node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null)
        continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }
  function setStatus(msg, kind) {
    const box = $("statusBox");
    box.className = `status status--${kind} status--show`;
    box.innerHTML = msg;
  }
  function clearStatus() {
    const box = $("statusBox");
    box.className = "status";
    box.innerHTML = "";
  }
  function renderStyleBar() {
    const bar = $("styleBar");
    bar.innerHTML = "";
    Object.keys(STYLE_LABELS).forEach((s) => {
      const btn = el(
        "button",
        {
          class: "style-btn" + (state.style === s ? " style-btn--active" : ""),
          type: "button",
          "data-style": s,
          onclick: () => {
            state.style = s;
            renderStyleBar();
            regenerate();
          }
        },
        STYLE_LABELS[s]
      );
      bar.appendChild(btn);
    });
  }
  function renderSourceTabs() {
    const tabs = $("sourceTabs");
    tabs.innerHTML = "";
    Object.keys(SOURCE_TYPE_LABELS).forEach((t) => {
      const btn = el(
        "button",
        {
          class: "source-tab" + (state.source === t ? " source-tab--active" : ""),
          type: "button",
          onclick: () => {
            state.source = t;
            renderSourceTabs();
            renderForm();
            regenerate();
          }
        },
        SOURCE_TYPE_LABELS[t]
      );
      tabs.appendChild(btn);
    });
  }
  function renderForm() {
    const grid = $("formGrid");
    grid.innerHTML = "";
    const authBlock = el("div", { class: "field field--full" });
    authBlock.appendChild(el("label", { class: "field__label" }, "Authors / creators"));
    const list = el("div", { class: "authors", id: "authorsList" });
    authBlock.appendChild(list);
    authBlock.appendChild(
      el(
        "button",
        {
          type: "button",
          class: "btn btn--text btn--mini",
          onclick: () => {
            state.data.authors.push({ family: "", given: "" });
            renderForm();
          }
        },
        "+ Add author"
      )
    );
    authBlock.appendChild(
      el(
        "div",
        { class: "field__hint" },
        "For organisational authors (e.g. WHO), put the full name in Family and tick the org box."
      )
    );
    grid.appendChild(authBlock);
    state.data.authors.forEach((_, idx) => renderAuthorRow(list, idx));
    const fields = FORM_SCHEMAS[state.source];
    for (const def of fields)
      renderField(grid, def);
  }
  function renderAuthorRow(list, idx) {
    const row = el("div", { class: "author-row" });
    const a = state.data.authors[idx];
    const famInput = el("input", {
      type: "text",
      placeholder: "Family name (Smith)",
      value: a.family
    });
    famInput.addEventListener("input", () => {
      state.data.authors[idx].family = famInput.value;
      debouncedGenerate();
    });
    const givInput = el("input", {
      type: "text",
      placeholder: "Given names (John A.)",
      value: a.given
    });
    givInput.addEventListener("input", () => {
      state.data.authors[idx].given = givInput.value;
      debouncedGenerate();
    });
    const orgLabel = el("label", { class: "org-toggle" });
    const orgChk = el("input", { type: "checkbox" });
    if (a.isOrganisation)
      orgChk.checked = true;
    orgChk.addEventListener("change", () => {
      state.data.authors[idx].isOrganisation = orgChk.checked;
      debouncedGenerate();
    });
    orgLabel.appendChild(orgChk);
    orgLabel.appendChild(document.createTextNode(" Org"));
    const rm = el(
      "button",
      {
        class: "icon-btn",
        type: "button",
        title: "Remove",
        onclick: () => {
          if (state.data.authors.length <= 1) {
            state.data.authors[0] = { family: "", given: "" };
          } else {
            state.data.authors.splice(idx, 1);
          }
          renderForm();
          debouncedGenerate();
        }
      },
      "\xD7"
    );
    row.appendChild(famInput);
    row.appendChild(givInput);
    row.appendChild(orgLabel);
    row.appendChild(rm);
    list.appendChild(row);
  }
  function renderField(grid, def) {
    const wrap = el("div", { class: "field" + (def.full ? " field--full" : "") });
    wrap.appendChild(el("label", { class: "field__label" }, def.label));
    const isLong = def.key === "title" || def.key === "bookTitle";
    const tag = isLong ? "textarea" : "input";
    const input = document.createElement(tag);
    if (input instanceof HTMLInputElement) {
      input.type = def.type || "text";
    } else {
      input.rows = 2;
    }
    input.placeholder = def.placeholder || "";
    const currentValue = state.data[def.key];
    input.value = typeof currentValue === "string" ? currentValue : "";
    input.addEventListener("input", () => {
      state.data[def.key] = input.value;
      debouncedGenerate();
    });
    wrap.appendChild(input);
    if (def.hint)
      wrap.appendChild(el("div", { class: "field__hint" }, def.hint));
    grid.appendChild(wrap);
  }
  var genTimer = null;
  function debouncedGenerate() {
    if (genTimer)
      window.clearTimeout(genTimer);
    genTimer = window.setTimeout(() => {
      void regenerate();
    }, 250);
  }
  async function regenerate() {
    const hasAnything = state.data.title.trim() || state.data.authors.some((a) => a.family.trim() || a.given.trim()) || state.data.url.trim();
    const refOut = $("referenceOut");
    const intextOut = $("intextOut");
    const quoteOut = $("quoteOut");
    const notesOut = $("notesOut");
    if (!hasAnything) {
      refOut.innerHTML = '<span class="placeholder">Citation s\u1EBD hi\u1EC7n \u1EDF \u0111\xE2y sau khi b\u1EA1n fetch URL ho\u1EB7c \u0111i\u1EC1n th\xF4ng tin.</span>';
      intextOut.innerHTML = '<span class="placeholder">\u2014</span>';
      quoteOut.innerHTML = '<span class="placeholder">\u2014</span>';
      notesOut.innerHTML = "";
      return;
    }
    try {
      const out = await generateCitation(state.style, state.source, state.data);
      refOut.innerHTML = out.reference;
      intextOut.innerHTML = out.intextParaphrase;
      quoteOut.innerHTML = out.intextQuote;
      notesOut.innerHTML = out.notes.length ? out.notes.map((n) => `<li>${n}</li>`).join("") : "";
    } catch (e) {
      if (e instanceof ApiError) {
        refOut.innerHTML = `<span class="placeholder">\u26A0 ${e.message}</span>`;
      }
    }
  }
  async function handleFetch() {
    const input = $("urlInput");
    const url = input.value.trim();
    if (!url) {
      setStatus("H\xE3y paste m\u1ED9t URL.", "warn");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setStatus("URL ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng http:// ho\u1EB7c https://", "warn");
      return;
    }
    const btn = $("fetchBtn");
    btn.disabled = true;
    btn.classList.add("is-loading");
    setStatus('<span class="spinner"></span> \u0110ang \u0111\u1ECDc trang web\u2026', "info");
    try {
      const result = await extractMetadata(url);
      if (!result.data) {
        setStatus("\u26A0 Kh\xF4ng tr\xEDch xu\u1EA5t \u0111\u01B0\u1EE3c d\u1EEF li\u1EC7u. Vui l\xF2ng \u0111i\u1EC1n th\u1EE7 c\xF4ng.", "warn");
        return;
      }
      Object.assign(state.data, result.data);
      if (result.data.authors && result.data.authors.length > 0) {
        state.data.authors = result.data.authors;
      }
      if (result.guessedType) {
        state.source = result.guessedType;
        renderSourceTabs();
      }
      renderForm();
      void regenerate();
      const filledFields = [];
      if (result.data.title)
        filledFields.push("title");
      if (result.data.authors?.length)
        filledFields.push(`${result.data.authors.length} author(s)`);
      if (result.data.year)
        filledFields.push("date");
      if (result.data.siteName)
        filledFields.push("site");
      if (result.data.journal)
        filledFields.push("journal");
      if (result.data.doi)
        filledFields.push("DOI");
      setStatus(
        `\u2713 Tr\xEDch xu\u1EA5t th\xE0nh c\xF4ng: <strong>${filledFields.join(", ") || "partial \u2014 vui l\xF2ng ki\u1EC3m tra"}</strong>. Auto-detected source: <strong>${SOURCE_TYPE_LABELS[result.guessedType || "webpage"]}</strong>.`,
        "success"
      );
    } catch (e) {
      const err = e;
      const map = {
        INVALID_URL: "URL kh\xF4ng h\u1EE3p l\u1EC7",
        INVALID_PROTOCOL: "Ch\u1EC9 ch\u1EA5p nh\u1EADn http/https",
        BLOCKED_HOST: "URL n\u1ED9i b\u1ED9 b\u1ECB ch\u1EB7n",
        DNS_FAIL: "Kh\xF4ng t\xECm th\u1EA5y domain",
        TIMEOUT: "Qu\xE1 th\u1EDDi gian ph\u1EA3n h\u1ED3i",
        TOO_LARGE: "Trang qu\xE1 l\u1EDBn",
        NOT_HTML: "Kh\xF4ng ph\u1EA3i trang HTML",
        FETCH_FAIL: "Trang web kh\xF4ng ph\u1EA3n h\u1ED3i"
      };
      const title = map[err.code || ""] || "L\u1ED7i kh\xF4ng x\xE1c \u0111\u1ECBnh";
      setStatus(`\u26A0 ${title} \u2014 ${err.message || ""}`, "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }
  async function copyHtmlAndText(elementId) {
    const target = $(elementId);
    const html = target.innerHTML;
    const text = target.textContent || "";
    try {
      if ("ClipboardItem" in window && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setStatus("\u2713 \u0110\xE3 copy (gi\u1EEF \u0111\u1ECBnh d\u1EA1ng italic).", "success");
      window.setTimeout(clearStatus, 1800);
    } catch {
      setStatus("\u26A0 Kh\xF4ng th\u1EC3 truy c\u1EADp clipboard.", "error");
    }
  }
  function init() {
    renderStyleBar();
    renderSourceTabs();
    renderForm();
    $("fetchBtn").addEventListener("click", () => void handleFetch());
    $("urlInput").addEventListener("keydown", (e) => {
      const ke = e;
      if (ke.key === "Enter") {
        e.preventDefault();
        void handleFetch();
      }
    });
    $("clearBtn").addEventListener("click", () => {
      state.data = emptyData();
      $("urlInput").value = "";
      clearStatus();
      renderForm();
      void regenerate();
    });
    $("copyRefBtn").addEventListener("click", () => void copyHtmlAndText("referenceOut"));
    $("copyIntextBtn").addEventListener("click", () => void copyHtmlAndText("intextOut"));
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
//# sourceMappingURL=app.js.map
