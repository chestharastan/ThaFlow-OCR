/* Document view: the page as an editable document. window.DocView.render(page, opts) -> HTMLElement
   The text comes from ThaOCR.pipeline.compose (ocr/pipeline.js), the same reading layout the Word / PDF export uses:
   a paragraph the layout model split over several blocks is one paragraph again, every paragraph is ONE editable text
   that wraps, list items keep their bullets, a table is a real table with an editable text in every cell (empty ones
   too), and the alignment of the scan is kept (centred, right, justified, first-line and hanging indents).
   Desktop (default): every element sits where it is on the scan (indents, gaps, widths); a paragraph keeps the width of
   its lines on the scan, and the font size starts from the font model's em size: one factor for all body text (see
   scheduleFit), and a paragraph shrinks by up to 10% when it would otherwise wrap into more lines than on the scan; a
   single line keeps to one line. Table cells use the body size and wrap inside their cell.
   Phone (opts.flow): the same document reflowed to the screen at a reading size (left-aligned, not justified).
   Edits are written back line by line: every source line is a span (data-k = "block:order") in its paragraph; while
   the spans are intact each line takes its span's text, otherwise lineDiff maps the change onto the lines it touches.
   opts: {scale, editable, flow, fontPx (phone body size), columnWidth(blockId), reviewed ({key: status}),
          onLines(changes) - changes: [{block, order, text} | {block, order, bullet} | {block, cell: [row, col], text}];
          for a new cell line it returns [{order}] so later edits of that cell go to the new line} */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const KHMER = /[ក-៿]/;
  const FONT_FILES = {"Khmer OS": ["KhmerOS.ttf"], "Khmer OS System": ["KhmerOSsys.ttf"], "Khmer OS Battambang": ["KhmerOSbattambang.ttf", "Battambang-Bold.ttf"], "Khmer OS Content": ["KhmerOScontent.ttf", "Content-Bold.ttf"], "Khmer OS Siemreap": ["KhmerOSsiemreap.ttf"], "Khmer OS Muol": ["KhmerOSmuol.ttf"], "Khmer OS Muol Light": ["KhmerOSmuollight.ttf"], "Khmer OS Muol Pali": ["KhmerOSmuolpali.ttf"], "Khmer OS Bokor": ["KhmerOSbokor.ttf"], "Khmer OS Metal Chrieng": ["KhmerOSmetalchrieng.ttf"], "Khmer OS Fasthand": ["KhmerOSfasthand.ttf"], "Khmer OS Freehand": ["KhmerOSfreehand.ttf"], "Noto Sans Khmer": ["NotoSansKhmer-Regular.ttf", "NotoSansKhmer-Bold.ttf"], "Noto Serif Khmer": ["NotoSerifKhmer-Regular.ttf", "NotoSerifKhmer-Bold.ttf"], "Khmer Digital": ["KhmerDigital-Regular.ttf", "KhmerDigital-Bold.ttf"], "Hanuman": ["Hanuman[wght].ttf"], "Kantumruy Pro": ["KantumruyPro[wght].ttf"], "Nokora": ["Nokora[wght].ttf"], "Odor Mean Chey": ["OdorMeanChey-Regular.ttf"], "Chenla": ["Chenla.ttf"], "Preahvihear": ["Preahvihear-Regular.ttf"], "Suwannaphum": ["Suwannaphum-Regular.ttf", "Suwannaphum-Bold.ttf"], "Koulen": ["Koulen-Regular.ttf"], "Dangrek": ["Dangrek-Regular.ttf"], "Bayon": ["Bayon-Regular.ttf"], "Angkor": ["Angkor-Regular.ttf"], "Taprom": ["Taprom-Regular.ttf"]};
  const LATIN = {"Latin serif": '"Liberation Serif","Times New Roman",serif', "Latin sans": '"Liberation Sans",Arial,sans-serif'};
  const loaded = new Map();  // family -> Promise (resolves when its faces are usable)
  function ensureFont(fam) {
    if (!fam || !FONT_FILES[fam] || !window.FontFace) return;
    if (loaded.has(fam)) return loaded.get(fam);
    const files = FONT_FILES[fam];
    // Only variable fonts ([wght]) may claim a weight range. A static regular face that claims "100 900" makes the
    // browser use it for bold too (no synthetic bold), which is why bold runs used to render as regular text.
    const pr = Promise.allSettled(files.map((f, i) => {
      const weight = /\[wght\]/.test(f) ? "100 900" : (files.length > 1 && i ? "700" : "400");
      const ff = new FontFace(fam, `url("fonts/${encodeURIComponent(f)}")`, {weight});
      return ff.load().then(x => document.fonts.add(x));
    }));
    loaded.set(fam, pr);
    return pr;
  }
  // no typeface from the font model: the bundled Noto Sans Khmer, so a device without a Khmer font still shapes the text
  function family(st) { const fam = st && st.family; if (!fam) { ensureFont("Noto Sans Khmer"); return '"Noto Sans Khmer","Khmer OS",sans-serif'; } if (LATIN[fam]) return LATIN[fam]; ensureFont(fam); return `"${fam}","Noto Sans Khmer",sans-serif`; }
  // font_px from the font model (size_model) is the em size of the printed line: use it as is. The ink-core fallback
  // underestimates Khmer set in a fallback web font (x1.15) and Noto's small bodies (x1.2).
  function sizePx(st, text, scale, body) { let px = st && st.font_px ? st.font_px : body; if (!(st && st.size_model)) { if (KHMER.test(text || "") && !(st && st.family && FONT_FILES[st.family])) px *= 1.15; if (st && /^Noto/.test(st.family || "")) px *= 1.2; } return Math.max(6, px * scale); }
  function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const read = el => el.innerText.replace(/ /g, " ").replace(/\n$/, "");

  /** The text of an element went from oldT to newT: which source lines changed, and to what. model: {src: [{block, order,
      key, text}], glue: [between src k-1 and k], lead: text before the first line}. The changed span (common prefix and
      suffix cut off) goes to the line where it starts, followed by the rest of the line where it ends; the lines in
      between are emptied (their text was deleted or joined). The model is updated to match newT. -> [{block, order, key, text}] */
  function lineDiff(model, oldT, newT) {
    const src = model.src; if (!src.length) return [];
    const mx = Math.min(oldT.length, newT.length); let p = 0, s = 0;
    while (p < mx && oldT[p] === newT[p]) p++;
    while (s < mx - p && oldT[oldT.length - 1 - s] === newT[newT.length - 1 - s]) s++;
    const q = oldT.length - s, R = newT.slice(p, newT.length - s), a = [], b = [];
    let pos = model.lead.length; src.forEach((x, k) => { a.push(pos); pos += x.text.length; b.push(pos); if (k < src.length - 1) pos += model.glue[k].length; });
    if (p < model.lead.length) { model.lead = oldT.slice(0, p); a[0] = p; }  // the marker before the first line was edited too
    let i = 0, j = src.length - 1;
    for (let k = 0; k < src.length; k++) if (a[k] <= p) i = k;
    for (let k = src.length - 1; k >= 0; k--) if (b[k] >= q) j = k;
    if (j < i) j = i;
    const out = [], put = (k, t, joined) => { if (src[k].text === t) return; src[k].text = t; out.push({block: src[k].block, order: src[k].order, key: src[k].key, text: t, joined: joined || undefined}); };
    put(i, oldT.slice(a[i], Math.max(a[i], p)) + R + oldT.slice(q, b[j]), j > i);  // joined: the text of several scanned lines in one
    for (let k = i + 1; k <= j; k++) put(k, "");
    if (j > i) { src.splice(i + 1, j - i); model.glue.splice(i, j - i); }
    return out;
  }
  /** el shows piece (fill): typing in it is saved line by line, after a short pause and when it loses focus. While every
      line's span is still in place with only the glue between them, each line's new text is its span's text (any number
      of edits in different lines); otherwise (typed between two lines, deleted across lines) lineDiff maps the change. */
  function editor(el, piece, save) {
    el.contentEditable = "true"; el.spellcheck = false; el.classList.add("dv-ed");
    const model = {src: piece.src.map(s => ({block: s.block, order: s.order, key: s.key, text: s.text})), glue: piece.glue.slice(), lead: piece.lead || ""};
    const full = () => model.lead + model.src.map((s, i) => (i ? model.glue[i - 1] : "") + s.text).join("");
    const spanTexts = () => { const out = []; let k = 0, gap = "";
      for (const nd of el.childNodes) {
        if (nd.nodeType === 3) { gap += nd.data; continue; }
        if (nd.nodeType !== 1 || !model.src[k] || nd.dataset.k !== model.src[k].key || gap !== (k ? model.glue[k - 1] : model.lead)) return null;
        out.push(nd.innerText.replace(/\u00a0/g, " ")); gap = ""; k++; }
      return k === model.src.length && !gap ? out : null; };
    let base = null, timer = 0;
    const commit = () => {
      clearTimeout(timer); const now = read(el); if (now === (base ?? full())) return; base = now;
      if (!model.src.length) {  // an empty table cell: the app makes a line for it
        if (piece.cell && now.trim()) { const res = save([{block: piece.cell.block, cell: [piece.cell.row, piece.cell.col], text: now}]) || [];
          if (res[0] && res[0].order != null) model.src.push({block: piece.cell.block, order: res[0].order, key: piece.cell.block + ":" + res[0].order, text: now}); }
        return;
      }
      const st = spanTexts(); let ch = [];
      if (st) st.forEach((t, k) => { const x = model.src[k]; if (x.text !== t) { x.text = t; ch.push({block: x.block, order: x.order, key: x.key, text: t}); } });
      else ch = lineDiff(model, full(), now);
      if (!ch.length) return;
      save(ch);
      for (const c of ch) { const sp = c.key && el.querySelector(`[data-k="${c.key}"]`); if (sp) sp.classList.remove("dv-low"); }
    };
    el.addEventListener("focus", () => { if (base == null) base = read(el); });
    el.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(commit, 700); });
    el.addEventListener("blur", commit);
  }
  function bulletEditor(el, it, save) {
    el.contentEditable = "true"; el.spellcheck = false; el.classList.add("dv-ed"); let shown = it.bullet || "";
    const commit = () => { const now = read(el).trim(); if (now === shown) return; shown = now; save([{block: it.bulletSrc.block, order: it.bulletSrc.order, bullet: now}]); };
    el.addEventListener("blur", commit); el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
  }
  function tabEditor(tl, tr, s, save) {  // a dot-leader line: the text before and after the leader are one line ("before\tafter")
    let shown = s.text;
    const commit = () => { const now = read(tl).replace(/\t/g, " ") + "\t" + read(tr).replace(/\t/g, " "); if (now === shown) return; shown = now; save([{block: s.block, order: s.order, key: s.key, text: now}]); tl.classList.remove("dv-low"); tr.classList.remove("dv-low"); };
    for (const el of [tl, tr]) { el.contentEditable = "true"; el.spellcheck = false; el.classList.add("dv-ed"); let t = 0;
      el.addEventListener("input", () => { clearTimeout(t); t = setTimeout(commit, 700); }); el.addEventListener("blur", commit); }
  }
  /** the piece's text into el: one span per source line (data-k "block:order", .dv-low when it still needs a check), bold runs as <b> */
  function fill(el, p) {
    el.textContent = ""; const heavy = p.style && p.style.heavy;
    if (Array.isArray(p.fixed)) { el.textContent = p.text || ""; return; }  // no line data: shown, not editable
    if (p.lead) el.append(p.lead);
    p.src.forEach((s, i) => { if (i && p.glue[i - 1]) el.append(p.glue[i - 1]);
      const sp = document.createElement("span"); sp.className = "dv-ln" + (s.low ? " dv-low" : ""); sp.dataset.k = s.key;
      for (const r of s.runs) { if (!r.text) continue; if (r.bold && !heavy) { const b = document.createElement("b"); b.textContent = r.text; sp.append(b); } else sp.append(r.text); }
      el.append(sp); });
  }

  function render(page, opts) {
    opts = opts || {};
    const TP = window.ThaOCR && window.ThaOCR.pipeline, doc = page.document, root = document.createElement("div");
    const els = doc && TP && TP.compose ? TP.compose(page, {columnWidth: opts.columnWidth, reviewed: opts.reviewed}) : null;
    if (!els) { root.className = "dv-page dv-flow"; root.textContent = "No document structure for this page: use the Overlay view."; return root; }
    const W = page.width, m = doc.margins || {left: 0.08 * W, right: 0.08 * W, top: 0.06 * page.height, bottom: 0.06 * page.height};
    const FLOW = !!opts.flow, scale = FLOW ? 1 : (opts.scale || 1), BASE = opts.fontPx || 17, fits = [], canEdit = !!opts.editable;
    const save = ch => (opts.onLines ? opts.onLines(ch) : null);
    const S = v => (v * scale).toFixed(2) + "px";
    // sizes in page px: the font model's em size; text within 15% of the body size is body text and gets the body size
    const texts = [], walk = e => { if (e.columns) e.columns.forEach(c => c.elements.forEach(walk)); else if (e.items) e.items.forEach(walk); else if (e.src) texts.push(e); }; els.forEach(walk);
    const rawEm = p => sizePx(p.style, p.text, 1, 0.75 * (p.lineH || 20));
    const bodyEm = median(texts.filter(p => p.type !== "heading" && !(p.style && p.style.heavy)).map(rawEm)) || median(texts.map(rawEm)) || 0.016 * W;
    const emOf = p => { const e = rawEm(p); return p.type !== "heading" && Math.abs(e - bodyEm) < 0.08 * bodyEm ? bodyEm : e; };
    const pxOf = em => (FLOW ? BASE * clamp(em / bodyEm, 0.8, 2.2) : em * scale);  // CSS px
    const fontCss = (st, px) => { const s = st || {}; return `font-family:${family(s)};font-size:${px.toFixed(2)}px;color:${s.color || "#1a1a1a"};${s.slant === "italic" ? "font-style:italic;" : ""}${s.weight === "bold" && !s.heavy ? "font-weight:700;" : ""}`; };
    // line height: the scan's line pitch (kept within what Khmer needs), so a paragraph is as tall as on the scan
    const lineH = (p, px) => (FLOW ? 0 : p.boxes.length >= 2 && p.pitch ? clamp(p.pitch * scale, 1.45 * px, 2.4 * px) : clamp(p.lineH * scale * 1.2, 1.6 * px, 2.2 * px));
    const scanW = p => p.boxes.reduce((a, b) => a + b.width, 0) * scale * (p.align === "justify" ? 0.97 : 1);  // justified lines were stretched
    const ems = v => Math.max(0, v / bodyEm), fpx = (v, lo, hi) => (clamp(v, lo, hi) * BASE).toFixed(1) + "px";
    const extent = e => { if (e.ext) return e.ext; if (e.columns) { const xs = e.columns.flatMap(c => c.elements.map(extent)); if (xs.length) return [Math.min(...xs.map(b => b[0])), Math.min(...xs.map(b => b[1])), Math.max(...xs.map(b => b[2])), Math.max(...xs.map(b => b[3]))]; }
      const b = e.box || [0, 0, 0, 0]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; };

    if (FLOW) { root.className = "dv-page dv-flow"; place(root, els, m.left, W - m.right, m.top); return root; }
    root.className = "dv-page";
    root.style.cssText = `width:${S(W)};min-height:${S(page.height)};padding:${S(m.top)} ${S(m.right)} ${S(m.bottom)} ${S(m.left)}`;
    place(root, sideBySide(els), m.left, W - m.right, m.top);
    scheduleFit(root, fits);
    return root;

    // elements one below the other in a container spanning page-x [x0, x1], content from page-y y0; the gaps of the scan
    function place(box, elements, x0, x1, y0) {
      let prev = null, prevLead = 0;
      for (const e of elements) {
        const ext = extent(e), node = one(e, x0, x1); if (!node) continue;
        const lead = node.__lead || 0;
        node.style.marginTop = FLOW ? (prev == null ? "0" : fpx(ems(ext[1] - prev), 0.25, 2.2)) : Math.max(0, Math.max(0, ext[1] - (prev ?? y0)) * scale - prevLead - lead).toFixed(2) + "px";
        prev = Math.max(prev ?? -Infinity, ext[3]); prevLead = lead; box.append(node);
      }
    }
    function one(e, x0, x1) {
      if (e.columns) return rowNode(e, x0, x1);
      if (e.type === "figure" || e.type === "decoration") return figureNode(e, x0, x1);
      if (e.type === "table" && e.table) return tableNode(e, x0, x1);
      if (e.items) return listNode(e, x0, x1);
      if (e.src) return e.tab ? tabNode(e, x0, x1) : textNode(e, x0, x1);
      return null;
    }
    // Elements printed side by side (a letterhead, the emblem, the motto with its ornament; two text columns) become one row of
    // columns: within a run between tables, elements are swept top-down into bands of overlapping height; a band whose
    // elements fall into 2+ columns (x ranges that do not overlap) is one row, each column stacking its elements.
    function sideBySide(elements) {
      const out = []; let run = [];
      const flush = () => {
        const items = run.map((e, k) => ({e, k, ex: extent(e)})).sort((a, b) => a.ex[1] - b.ex[1] || a.k - b.k), bands = [];
        for (const it of items) { const b = bands[bands.length - 1], h = it.ex[3] - it.ex[1];
          if (b && it.ex[1] < b.bot - Math.min(0.25 * h, 0.25 * (b.bot - b.top))) { b.items.push(it); b.bot = Math.max(b.bot, it.ex[3]); } else bands.push({top: it.ex[1], bot: it.ex[3], items: [it]}); }
        for (const b of bands) {
          const cols = []; for (const g of b.items.slice().sort((p, q) => p.ex[0] - q.ex[0])) { const c = cols.find(c => Math.min(c.x1, g.ex[2]) - Math.max(c.x0, g.ex[0]) > 0); if (c) { c.items.push(g); c.x0 = Math.min(c.x0, g.ex[0]); c.x1 = Math.max(c.x1, g.ex[2]); } else cols.push({x0: g.ex[0], x1: g.ex[2], items: [g]}); }
          for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) if (Math.min(cols[i].x1, cols[j].x1) - Math.max(cols[i].x0, cols[j].x0) > 0) { cols[i].items.push(...cols[j].items); cols[i].x0 = Math.min(cols[i].x0, cols[j].x0); cols[i].x1 = Math.max(cols[i].x1, cols[j].x1); cols.splice(j, 1); j = i; }  // a member that bridged two columns merges them
          if (cols.length < 2) { out.push(...b.items.sort((p, q) => p.k - q.k).map(g => g.e)); continue; }
          out.push({type: "row", block: b.items[0].e.block, columns: cols.sort((p, q) => p.x0 - q.x0).map(c => ({x0: c.x0, x1: c.x1, elements: c.items.sort((p, q) => p.ex[1] - q.ex[1] || p.k - q.k).map(g => g.e)}))}); }
        run = []; };
      for (const e of elements) { if (e.columns || e.type === "table") { flush(); out.push(e); } else run.push(e); }
      flush(); return out;
    }
    function rowNode(e, x0, x1) {  // side-by-side columns: at their measured x positions (desktop), wrapping columns (phone)
      const row = document.createElement("div"); row.className = FLOW ? "dv-frow" : e.type === "footer_row" ? "dv-footer-row" : "dv-row";
      const cols = e.columns.map(c => { const xs = c.elements.map(extent); return {c, cx0: c.x0 ?? Math.min(...xs.map(b => b[0])), cx1: c.x1 ?? Math.max(...xs.map(b => b[2])), cy0: Math.min(...xs.map(b => b[1]))}; }).sort((a, b) => a.cx0 - b.cx0);
      const top = Math.min(...cols.map(k => k.cy0)), span = Math.max(1, x1 - x0);
      let px = x0;
      for (const k of cols) {
        const col = document.createElement("div"); col.className = FLOW ? "dv-fcol" : "dv-col";
        if (FLOW) { col.style.flex = `1 1 ${(100 * (k.cx1 - k.cx0) / span).toFixed(1)}%`; place(col, k.c.elements, k.cx0, k.cx1, k.cy0); }
        else { const left = Math.max(k.cx0, px); col.style.cssText = `flex:none;width:${S(Math.max(10, k.cx1 - left))};margin-left:${S(left - px)};min-width:0`; place(col, k.c.elements, left, k.cx1, top); px = k.cx1; }
        row.append(col);
      }
      return row;
    }
    function figureNode(e, x0, x1) {
      const ext = extent(e), w = Math.max(8, ext[2] - ext[0]), h = Math.max(4, ext[3] - ext[1]), f = document.createElement("div"); f.className = e.type === "figure" ? "dv-figure" : "dv-rule";
      if (FLOW) { const frac = Math.min(1, w / Math.max(1, x1 - x0)), c = (ext[0] + ext[2]) / 2, centred = Math.abs(c - (x0 + x1) / 2) < 0.06 * (x1 - x0) && ext[0] - x0 > 0.08 * (x1 - x0);
        const pos = centred ? "margin:0 auto;" : ext[0] - x0 > 0.5 * (x1 - x0) ? "margin-left:auto;" : `margin-left:${(100 * Math.max(0, ext[0] - x0) / Math.max(1, x1 - x0)).toFixed(1)}%;`;
        if (e.mask && e.crop) { maskNode(f, e, ext, `width:${(100 * frac).toFixed(1)}%;max-width:100%;${pos}`); return f; }
        f.innerHTML = e.crop ? `<img src="${esc(e.crop)}" alt="${esc(e.role || "")}" style="display:block;width:${(100 * frac).toFixed(1)}%;max-width:100%;height:auto;${pos}">` : e.type === "figure" ? `<div class="dv-ph" style="width:${(100 * frac).toFixed(1)}%;aspect-ratio:${w}/${h};${pos}">${esc(e.role)}</div>` : `<hr style="width:${(100 * frac).toFixed(1)}%;${pos}">`;
        return f; }
      f.style.cssText = `margin-left:${S(Math.max(0, ext[0] - x0))};line-height:0`;
      if (e.mask && e.crop) { maskNode(f, e, ext, `width:${S(w)};height:${S(h)}`); return f; }
      f.innerHTML = e.crop ? `<img src="${esc(e.crop)}" style="width:${S(w)};height:${S(h)};object-fit:contain" alt="${esc(e.role || "")}">` : e.type === "figure" ? `<div class="dv-ph" style="width:${S(w)};height:${S(h)}">${esc(e.role)}</div>` : `<hr style="width:${S(w)}">`;
      return f;
    }
    // a picture with the areas of the elements inside it (shown on their own) painted out
    function maskNode(f, e, ext, css) {
      const w = Math.max(1, ext[2] - ext[0]), h = Math.max(1, ext[3] - ext[1]), pc = v => (100 * v).toFixed(2) + "%";
      f.innerHTML = `<div class="dv-masked" style="position:relative;line-height:0;${css}"><img src="${esc(e.crop)}" alt="${esc(e.role || "")}" style="display:block;width:100%;height:auto">${e.mask.map(b => `<i style="left:${pc((b[0] - ext[0]) / w)};top:${pc((b[1] - ext[1]) / h)};width:${pc((b[2] - b[0]) / w)};height:${pc((b[3] - b[1]) / h)}"></i>`).join("")}</div>`;
    }
    // where a paragraph sits and how it is aligned
    function paraCss(p, x0, x1) {
      const n = p.boxes.length, lead = Math.min(p.boxes[0].x, p.bodyLeft), right = p.ext[2], w = Math.max(1, right - lead);
      if (FLOW) {
        if (p.align === "center") return "text-align:center;";
        if (p.align === "right") return "text-align:right;";
        let s = `margin-left:min(${fpx(ems(lead - x0), 0, 8)},30%);`;
        if (p.indent > 0.01 * w) s += `text-indent:${Math.min(4, ems(p.indent)).toFixed(2)}em;`;
        else if (p.indent < -0.01 * w) { const h = Math.min(4, ems(-p.indent)).toFixed(2); s += `padding-left:${h}em;text-indent:-${h}em;`; }
        return s;  // not justified: on a phone's short lines Khmer (few spaces to stretch) would get wide gaps
      }
      if (p.align === "center") { const c = (p.ext[0] + p.ext[2]) / 2, half = Math.max((p.ext[2] - p.ext[0]) / 2, Math.min(c - x0, x1 - c)); return `text-align:center;margin-left:${S(c - half - x0)};width:${S(2 * half)};`; }
      if (p.align === "right") return `text-align:right;width:${S(Math.max(right - x0, p.ext[2] - p.ext[0]))};`;
      let s = `margin-left:${S(lead - x0)};`;
      if (p.indent > 0) s += `text-indent:${S(p.indent)};`; else if (p.indent < 0) s += `padding-left:${S(-p.indent)};text-indent:${S(p.indent)};`;
      s += n >= 2 ? `width:${S(w)};` : `min-width:${S(w)};`;  // several lines: wrap where the scan wraps; one line: room up to the column edge
      return s + (p.align === "justify" ? "text-align:justify;" : "");
    }
    function textNode(p, x0, x1) {
      const el = document.createElement(p.type === "heading" ? "h" + Math.min(3, p.heading || 1) : "p"), px = pxOf(emOf(p)), lh = lineH(p, px);
      el.className = "dv-" + p.type;
      el.style.cssText = fontCss(p.style, px) + (lh ? `line-height:${lh.toFixed(2)}px;` : "") + paraCss(p, x0, x1);
      fill(el, p); if (canEdit && !p.fixed) editor(el, p, save);
      if (!FLOW) { fits.push({el, n: p.boxes.length, wraps: p.glue.some(g => g !== "\n"), scanW: scanW(p), base: px, lh, kind: p.type === "heading" || (p.style && p.style.heavy) || Math.abs(emOf(p) - bodyEm) > 0.01 * bodyEm ? "head" : "body"}); el.__lead = Math.max(0, (lh - p.lineH * scale) / 2); }
      return el;
    }
    function tabNode(p, x0, x1) {  // dot-leader line: title ........ page number
      const s = p.src[0], parts = s.text.split("\t"), px = pxOf(emOf(p)), lh = lineH(p, px), el = document.createElement("p");
      el.className = "dv-" + p.type + " dv-tabline";
      el.style.cssText = fontCss(p.style, px) + (lh ? `line-height:${lh.toFixed(2)}px;` : "") + (FLOW ? `margin-left:min(${fpx(ems(p.ext[0] - x0), 0, 8)},30%);` : `margin-left:${S(p.ext[0] - x0)};width:${S(Math.max(x1, p.ext[2]) - p.ext[0])};`);
      const tl = document.createElement("span"), ld = document.createElement("span"), tr = document.createElement("span");
      tl.className = "dv-tl" + (s.low ? " dv-low" : ""); ld.className = "dv-leader"; tr.className = "dv-tr" + (s.low ? " dv-low" : ""); tl.dataset.k = s.key;
      tl.textContent = parts[0]; tr.textContent = parts.slice(1).join(" "); el.append(tl, ld, tr);
      if (canEdit) tabEditor(tl, tr, s, save);
      if (!FLOW) { fits.push({el, base: px, kind: "fixed"}); el.__lead = Math.max(0, (lh - p.lineH * scale) / 2); }
      return el;
    }
    function listNode(e, x0, x1) {
      const ul = document.createElement("div"); ul.className = "dv-list"; let prev = null, prevLead = 0;
      for (const it of e.items) {
        const em = emOf(it), px = pxOf(em), lh = lineH(it, px), n = it.boxes.length, textX = it.textX ?? it.boxes[0].x;
        const bx = Math.min(it.bullet_box ? it.bullet_box.x : textX, textX - 1.3 * em), lead = FLOW ? 0 : Math.max(0, (lh - it.lineH * scale) / 2);
        const li = document.createElement("div"); li.className = "dv-li";
        li.style.cssText = fontCss(it.style, px) + (lh ? `line-height:${lh.toFixed(2)}px;` : "") + (FLOW ? `margin-left:min(${fpx(ems(bx - x0), 0, 8)},30%);margin-top:${prev == null ? "0" : fpx(ems(it.ext[1] - prev), 0.15, 1.6)};`
          : `margin-left:${S(bx - x0)};margin-top:${prev == null ? "0px" : Math.max(0, (it.ext[1] - prev) * scale - prevLead - lead).toFixed(2) + "px"};`);
        const bu = document.createElement("span"), tx = document.createElement("span"); bu.className = "dv-bullet"; tx.className = "dv-text"; bu.textContent = it.bullet || "";
        if (!FLOW) { bu.style.width = S(textX - bx); if (n >= 2) { tx.style.flex = "none"; tx.style.width = S(it.ext[2] - textX); } }
        if (it.align === "justify" && !FLOW) tx.style.textAlign = "justify";
        fill(tx, it); li.append(bu, tx);
        if (canEdit && !it.fixed) { editor(tx, it, save); if (it.bulletSrc) bulletEditor(bu, it, save); }
        if (!FLOW) fits.push({el: li, text: tx, n, wraps: it.glue.some(g => g !== "\n"), scanW: scanW(it), base: px, lh, kind: Math.abs(em - bodyEm) > 0.01 * bodyEm ? "head" : "body"});
        ul.append(li); prev = Math.max(prev ?? -Infinity, it.ext[3]); prevLead = lead;
        if (ul.childNodes.length === 1) ul.__lead = lead;
      }
      return ul;
    }
    // a real table: the scan's columns (relative widths), one body size in every cell, text wraps in its cell
    function tableNode(e, x0, x1) {
      // body size; a table measured a little smaller on the scan keeps its size (down to 85% of the body)
      const tem = e.style && e.style.font_px ? clamp(sizePx(e.style, e.text, 1, bodyEm), 0.85 * bodyEm, bodyEm) : bodyEm;
      const t = e.table, nc = t.cols.length, cx0 = t.cols[0].x0, cx1 = t.cols[nc - 1].x1, total = Math.max(1, cx1 - cx0), px = pxOf(tem);
      const tbl = document.createElement("table"); tbl.className = "dv-table" + (t.borders ? " bordered" : "");
      tbl.style.cssText = fontCss(e.style, px) + (FLOW ? `min-width:max(100%,${(nc * 3.6).toFixed(1)}em);` : `margin-left:${S(Math.max(0, cx0 - x0))};width:${S(total)};`);
      const cg = document.createElement("colgroup");
      if (!FLOW) { for (const c of t.cols) { const col = document.createElement("col"); col.style.width = S(c.x1 - c.x0); cg.append(col); } tbl.append(cg); }  // phone: columns sized by their text
      for (const r of t.rows) { const tr = document.createElement("tr");
        for (const c of r.cells) { const td = document.createElement("td"), col = t.cols[c.col];
          if (c.colspan > 1) { td.colSpan = c.colspan; td.className = "dv-span"; }
          const al = c.colspan > 1 ? "left" : (col && col.align) || "left"; if (al !== "left") td.style.textAlign = al;
          fill(td, c); if (canEdit && !c.fixed) editor(td, Object.assign({}, c, {cell: {block: e.block, row: c.row, col: c.col}}), save);
          tr.append(td); }
        tbl.append(tr); }
      if (!FLOW) fits.push({el: tbl, base: px, kind: "fixed"});
      const wrap = document.createElement("div"); wrap.className = "dv-twrap"; wrap.append(tbl); return wrap;
    }
  }

  // After the fonts load (desktop). Body text gets ONE size factor: the median, over the body paragraphs and lines, of
  // (width of its lines on the scan) / (width of its text set on one line) - the factor at which the web font is as wide
  // as the print. A paragraph that would then wrap into more lines than on the scan shrinks (by up to 10%) to keep its
  // line count; it never grows, so text of one style keeps one size. A single line shrinks (to 80%) rather than wrap.
  // Headings, titles and other sizes are fitted to their own width on the scan (one line never wraps). Tables and
  // dot-leader lines take the body factor. Bounded, so a misread size can't explode.
  function scheduleFit(root, fits) {
    let tries = 0;
    const go = () => {
      if (!root.isConnected) { if (++tries < 60) setTimeout(go, 100); return; }
      const setK = (f, k) => { f.el.style.fontSize = (f.base * k).toFixed(2) + "px"; f.k = k; };
      const lines = f => Math.max(1, Math.round((f.text || f.el).getBoundingClientRect().height / f.lh));
      const kmax = (f, lo, hi, n) => { setK(f, hi); if (lines(f) <= n) return hi; setK(f, lo); if (lines(f) > n) return lo;
        for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; setK(f, mid); if (lines(f) <= n) lo = mid; else hi = mid; } return lo; };
      const natW = f => { const t = f.text || f.el, sp = document.createElement("span"); sp.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;text-indent:0";
        sp.innerHTML = t.innerHTML; t.append(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return w; };
      for (const f of fits) if (f.scanW) { setK(f, 1); const w = natW(f), n = ((f.text || f.el).textContent || "").length; f.ratio = w > 0 && n >= 6 ? f.scanW / w : null; }
      const body = fits.filter(f => f.kind === "body"), rs = body.map(f => f.ratio).filter(Boolean);
      const kb = rs.length ? clamp(median(rs), 0.75, 1.25) : 1;
      for (const f of body) { const n = f.n; setK(f, kb); if (lines(f) > n) setK(f, kmax(f, (f.wraps ? 0.9 : 0.8) * kb, kb, n)); }
      for (const f of fits) if (f.kind === "head") { const k = f.ratio ? clamp(f.ratio, 0.7, 1.2) : 1; setK(f, k); if (lines(f) > f.n) setK(f, kmax(f, 0.8 * k, k, f.n)); }
      for (const f of fits) if (f.kind === "fixed") setK(f, kb);
      for (const f of fits) if (f.lh && f.lh < 1.45 * f.base * f.k) f.el.style.lineHeight = (1.45 * f.base * f.k).toFixed(2) + "px";  // a grown size keeps room for Khmer vowels and subscripts
      root.dataset.fit = kb.toFixed(3);
    };
    let ran = false; const run = () => { if (!ran) { ran = true; go(); } };  // a frame, or a timer in a tab in the background
    Promise.allSettled([...loaded.values()]).then(() => (document.fonts ? document.fonts.ready : null)).then(() => { requestAnimationFrame(run); setTimeout(run, 250); });
  }

  const CSS = `
.dv-page{background:#fff;box-sizing:border-box;margin:0 auto;box-shadow:0 6px 24px rgba(16,24,40,.12);line-height:1.75;color:#1a1a1a;font-family:"Noto Sans Khmer","Khmer OS",sans-serif;overflow:hidden}
.dv-page p,.dv-page h1,.dv-page h2,.dv-page h3{margin:0;font-weight:400;box-sizing:border-box;letter-spacing:normal}
.dv-page .dv-ed{white-space:pre-wrap;overflow-wrap:break-word;outline:none;cursor:text;min-height:1em}
.dv-page .dv-ed:focus{box-shadow:0 0 0 2px #99f6e4;border-radius:2px}
.dv-page .dv-list{margin:0}.dv-page .dv-li{display:flex;align-items:baseline;margin:0}.dv-page .dv-bullet{flex:none;min-width:1em;white-space:nowrap}.dv-page .dv-text{flex:1;min-width:0}
.dv-page .dv-figure,.dv-page .dv-rule{margin:0}.dv-page .dv-figure img,.dv-page .dv-rule img{display:block;max-width:none}.dv-page .dv-ph{border:1px dashed #bbb;color:#999;font:12px system-ui;display:grid;place-items:center}
.dv-page .dv-rule hr{border:0;border-top:1px solid #999;margin:0}.dv-page .dv-masked i{position:absolute;background:#fff}
.dv-page .dv-row,.dv-page .dv-footer-row{display:flex;align-items:flex-start}.dv-page .dv-col>*{max-width:none}
.dv-page .dv-low{background:#fff3cd;border-radius:2px;box-shadow:0 1px 0 #f2c14e}
.dv-page .dv-table{border-collapse:collapse;table-layout:fixed;line-height:1.55}.dv-page .dv-table td{padding:.1em .35em;vertical-align:top;white-space:pre-wrap;overflow-wrap:break-word;min-width:1em;height:1.55em}.dv-page .dv-table.bordered td{border:1px solid #333}.dv-page .dv-table td.dv-span{font-weight:600}
.dv-page .dv-table td.dv-ed:focus{box-shadow:inset 0 0 0 2px #5eead4;border-radius:0}
.dv-page .dv-tabline{display:flex;align-items:baseline;white-space:nowrap}.dv-page .dv-tabline .dv-tl{flex:0 1 auto;min-width:1em}.dv-page .dv-tabline .dv-leader{flex:1;min-width:1em;border-bottom:1px dotted currentColor;margin:0 .3em;transform:translateY(-.3em)}.dv-page .dv-tabline .dv-tr{flex:none;min-width:1em}
.dv-page b{font-weight:700}
.dv-page.dv-flow{width:100%;max-width:100%;padding:clamp(20px,6%,64px) clamp(18px,7%,76px);line-height:1.85;overflow:visible;overflow-wrap:break-word;border-radius:3px}
.dv-flow .dv-frow{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0 2em}.dv-flow .dv-fcol{min-width:min(14em,100%)}
.dv-flow h1,.dv-flow h2,.dv-flow h3{line-height:inherit}
.dv-flow .dv-li{line-height:1.85;gap:.5em}
.dv-flow .dv-twrap{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}.dv-flow .dv-table{table-layout:auto;line-height:1.6}.dv-flow .dv-table td{padding:.2em .45em;min-width:2.5em;overflow-wrap:normal}
.dv-flow .dv-tabline{white-space:normal}`;
  function injectCss() { const old = document.getElementById("dv-css"); if (old) old.remove(); const st = document.createElement("style"); st.id = "dv-css"; st.textContent = CSS; document.head.appendChild(st); }
  injectCss();
  window.DocView = {render, lineDiff, css: CSS, fonts: FONT_FILES};
})();
