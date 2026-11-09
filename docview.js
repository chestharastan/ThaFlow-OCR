/* Document view: renders page.document (structured elements) as an editable, word-processor-like page that keeps the
   ORIGINAL page geometry — every element sits at its measured position with the measured gaps, widths, line spacing,
   indents and alignment (justified when the photo is), single-line elements keep one line, and each paragraph is
   fitted (font size) so it wraps into the same number of lines as the photo. Typefaces / sizes / colours / bold runs /
   figures come from the backend. Text stays editable (opts.editable).
   Shared by the classic demo and the ThaOCR app: window.DocView.render(page, opts) -> HTMLElement */
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
  function family(st) { const fam = st && st.family; if (!fam) return '"Noto Sans Khmer","Khmer OS",sans-serif'; if (LATIN[fam]) return LATIN[fam]; ensureFont(fam); return `"${fam}","Noto Sans Khmer",sans-serif`; }
  // font_px from the font model (size_model) is the em size of the printed line: use it as is. The ink-core fallback
  // underestimates Khmer set in a fallback web font (x1.15) and Noto's small bodies (x1.2).
  function sizePx(st, text, scale, body) { let px = st && st.font_px ? st.font_px : body; if (!(st && st.size_model)) { if (KHMER.test(text || "") && !(st && st.family && FONT_FILES[st.family])) px *= 1.15; if (st && /^Noto/.test(st.family || "")) px *= 1.2; } return Math.max(6, px * scale); }
  function runsHtml(runs, heavy, low) { const h = (runs || []).map(r => r.bold && !heavy ? `<b>${esc(r.text)}</b>` : esc(r.text)).join(""); return low ? `<span class="dv-low">${h}</span>` : h; }
  function style(st, text, scale, body) { const s = st || {}; return `font-family:${family(s)};font-size:${sizePx(s, text, scale, body).toFixed(2)}px;color:${s.color || "#1a1a1a"};${s.slant === "italic" ? "font-style:italic;" : ""}${s.weight === "bold" && !s.heavy ? "font-weight:700;" : ""}`; }
  function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  /** page: backend page result with .document; opts: {scale (px multiplier), editable, onEdit(blockId, lineOrders, newText), flow (true = old free reflow)} */
  function render(page, opts) {
    opts = opts || {};
    const doc = page.document, W = page.width, scale = opts.scale || 1;
    const S = v => (v * scale).toFixed(2) + "px";
    const blocks = Object.fromEntries((page.blocks || []).map(b => [b.id, b]));
    const allEls = doc.elements.flatMap(e => e.columns ? e.columns.flatMap(c => c.elements) : [e]);
    const bodyPx = median(allEls.filter(e => e.type === "paragraph").map(e => e.style && e.style.font_px).filter(Boolean)) || 0.016 * W;
    const fits = [];  // text elements to fit once fonts are loaded

    // ---- geometry from the photo (page pixels)
    const lineBoxes = e => { const b = blocks[e.block]; if (!b || !b.lines || !e.lines) return []; const want = new Set(e.lines);
      return b.lines.filter(l => want.has(l.reading_order)).map(l => l.box).filter(Boolean); };
    function extent(e) {  // [x0, y0, x1, y1]
      if (e.columns) { const xs = e.columns.flatMap(c => c.elements.map(extent)); return xs.length ? [Math.min(...xs.map(b => b[0])), Math.min(...xs.map(b => b[1])), Math.max(...xs.map(b => b[2])), Math.max(...xs.map(b => b[3]))] : [0, 0, 0, 0]; }
      if (e.items) { const xs = e.items.map(extent).filter(b => b[2] > b[0]); if (xs.length) return [Math.min(...xs.map(b => b[0])), Math.min(...xs.map(b => b[1])), Math.max(...xs.map(b => b[2])), Math.max(...xs.map(b => b[3]))]; }
      const lb = lineBoxes(e);
      if (lb.length) return [Math.min(...lb.map(b => b.x)), Math.min(...lb.map(b => b.y)), Math.max(...lb.map(b => b.x + b.width)), Math.max(...lb.map(b => b.y + b.height))];
      const b = e.box || [0, 0, 0, 0]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]];
    }
    const pitch = lb => { if (lb.length < 2) return 0; const ys = lb.map(b => b.y + b.height / 2).sort((a, b) => a - b); return median(ys.slice(1).map((y, i) => y - ys[i])); };

    const root = document.createElement("div"); root.className = "dv-page";
    root.style.cssText = `width:${S(W)};min-height:${S(page.height)};padding:${S(doc.margins.top)} ${S(doc.margins.right)} ${S(doc.margins.bottom)} ${S(doc.margins.left)};--dv-body:${S(bodyPx)}`;
    const edit = (el, e) => { if (!opts.editable) return; el.contentEditable = "true"; el.spellcheck = false; el.addEventListener("blur", () => { const t = el.innerText.replace(/\s+$/, ""); if (t !== e.text && opts.onEdit) opts.onEdit(e.block, e.lines, t); }); };
    renderInto(root, doc.elements, doc.margins.left, W - doc.margins.right, doc.margins.top);
    scheduleFit(root, fits);
    return root;

    // container spans page-x [x0, x1]; its content starts at page-y y0
    function renderInto(box, elements, x0, x1, y0) {
      let prevBottom = y0;
      for (const e of elements) {
        const ext = extent(e);
        const node = renderOne(e, ext, x0, x1);
        if (!node) continue;
        node.style.marginTop = S(Math.max(0, ext[1] - prevBottom));
        prevBottom = Math.max(prevBottom, ext[3]);
        box.appendChild(node);
      }
    }

    function columnsRow(e, cls, x0, x1) {  // side-by-side columns placed at their measured x positions
      const row = document.createElement("div"); row.className = cls;
      const cols = e.columns.map(c => { const xs = c.elements.map(extent); return {c, cx0: c.x0 ?? Math.min(...xs.map(b => b[0])), cx1: c.x1 ?? Math.max(...xs.map(b => b[2])), cy0: Math.min(...xs.map(b => b[1]))}; })
        .sort((a, b) => a.cx0 - b.cx0);
      const top = Math.min(...cols.map(k => k.cy0));
      let px = x0;
      for (const k of cols) {
        const col = document.createElement("div"); col.className = "dv-col";
        const left = Math.max(k.cx0, px);  // never overlap the previous column
        col.style.cssText = `flex:none;width:${S(Math.max(10, k.cx1 - left))};margin-left:${S(left - px)};min-width:0;${k.c.align ? alignCss(k.c.align) : ""}`;
        renderInto(col, k.c.elements, left, k.cx1, top);
        row.appendChild(col); px = k.cx1;
      }
      return row;
    }

    function alignCss(a) { return a === "center" ? "text-align:center;" : a === "right" ? "text-align:right;" : a === "justify" ? "text-align:justify;" : ""; }

    function renderOne(e, ext, x0, x1) {
      if (e.type === "row") return columnsRow(e, "dv-row", x0, x1);
      if (e.type === "footer_row") return columnsRow(e, "dv-footer-row", x0, x1);
      if (e.type === "figure" || e.type === "decoration") {
        const w = Math.max(8, ext[2] - ext[0]), h = Math.max(4, ext[3] - ext[1]);
        const f = document.createElement("div"); f.className = e.type === "figure" ? "dv-figure" : "dv-rule";
        f.style.cssText = `margin-left:${S(Math.max(0, ext[0] - x0))};line-height:0`;
        f.innerHTML = e.crop ? `<img src="${esc(e.crop)}" style="width:${S(w)};height:${S(h)};object-fit:contain" alt="${esc(e.role || "")}">`
                             : e.type === "figure" ? `<div class="dv-ph" style="width:${S(w)};height:${S(h)}">${esc(e.role)}</div>` : `<hr style="width:${S(w)}">`;
        return f;
      }
      if (e.type === "table" && e.table) {
        const t = e.table, cx0 = t.cols[0].x0, cx1 = t.cols[t.cols.length - 1].x1;
        const tbl = document.createElement("table"); tbl.className = "dv-table" + (t.borders ? " bordered" : "");
        tbl.style.cssText = style(e.style, e.text, scale, bodyPx) + `margin-left:${S(Math.max(0, cx0 - x0))};width:${S(cx1 - cx0)};`;
        const cg = document.createElement("colgroup"); for (const c of t.cols) { const col = document.createElement("col"); col.style.width = S(c.x1 - c.x0); cg.appendChild(col); } tbl.appendChild(cg);
        for (const r of t.rows) { const tr = document.createElement("tr"); if (r.y1 > r.y0) tr.style.height = S(r.y1 - r.y0);
          r.cells.forEach((c, i) => { const td = document.createElement("td"); if (c.colspan > 1) { td.colSpan = c.colspan; td.className = "dv-span"; } td.style.cssText = alignCss(c.colspan > 1 ? "left" : (t.cols[i].align || "left")); td.textContent = c.text || ""; if (c.text) edit(td, {block: e.block, lines: c.lines, text: c.text}); tr.appendChild(td); });
          tbl.appendChild(tr); }
        return tbl;
      }
      if (e.type === "list") {
        const ul = document.createElement("div"); ul.className = "dv-list";
        let prev = ext[1];
        for (const it of e.items) {
          const ie = extent(it), lb = lineBoxes(it);
          const li = document.createElement("div"); li.className = "dv-li";
          const pt = pitch(lb), st = style(it.style, it.text, scale, bodyPx);
          const bx = it.bullet_box ? it.bullet_box.x : ie[0];
          li.style.cssText = st + `margin-left:${S(Math.max(0, bx - x0))};margin-top:${S(Math.max(0, ie[1] - prev))};` + (pt ? `line-height:${S(pt)};` : "");
          li.innerHTML = `<span class="dv-bullet">${esc(it.bullet)}</span><span class="dv-text">${runsHtml(it.runs, it.style && it.style.heavy, it.low)}</span>`;
          edit(li.lastElementChild, it); ul.appendChild(li); prev = Math.max(prev, ie[3]);
          fits.push({el: li.lastElementChild, sizeEl: li, lines: Math.max(1, lb.length), width: (ie[2] - ie[0]) * scale, lh: pt * scale, tight: !!(it.style && it.style.size_model)});
        }
        return ul;
      }
      // headings, paragraphs, header, footer, page_number, caption, footnote, table_row
      const lb = lineBoxes(e), n = Math.max(1, lb.length), pt = pitch(lb);
      const p = document.createElement(e.type === "heading" ? "h" + Math.min(3, e.heading || 1) : "p");
      p.className = "dv-" + e.type;
      const w = ext[2] - ext[0];
      let css = style(e.style, e.text, scale, bodyPx);
      let align = e.align || "left";
      if (n >= 2 && align === "left") {  // justified in the photo? (non-last lines reach the right edge)
        const full = lb.slice(0, -1).filter(b => ext[2] - (b.x + b.width) < 0.03 * w).length;
        if (full >= Math.max(1, 0.7 * (n - 1))) align = "justify";
      }
      if (align === "left" || align === "justify") css += `margin-left:${S(ext[0] - x0)};width:${S(w)};`;
      else css += `margin-left:auto;margin-right:auto;max-width:none;`;
      if (align === "center") { const cx = (ext[0] + ext[2]) / 2, mid = (x0 + x1) / 2; css += `position:relative;left:${S(cx - mid)};width:${S(Math.max(w, 1))};`; }
      if (align === "right") css += `width:${S(w)};margin-right:${S(Math.max(0, x1 - ext[2]))};margin-left:auto;`;
      css += alignCss(align);
      if (n === 1) css += "white-space:nowrap;";
      if (pt) css += `line-height:${S(pt)};`;
      else if (lb.length === 1) css += `line-height:${S(Math.max(lb[0].height, (e.style && e.style.font_px || bodyPx) * 1.3))};`;
      if (lb.length >= 2) { const ind = lb[0].x - ext[0]; if (ind > 0.01 * w) css += `text-indent:${S(ind)};`; }
      p.style.cssText = css;
      if ((e.text || "").includes("\t") && n === 1) { // dot-leader line: title ... page number
        const [before, after] = e.text.split("\t"); p.className += " dv-tabline"; p.style.width = S(x1 - x0 - Math.max(0, ext[0] - x0)); p.style.textAlign = "left";
        p.innerHTML = `<span class="dv-tl">${esc(before)}</span><span class="dv-leader"></span><span class="dv-tr">${esc(after)}</span>`;
        fits.push({el: p, sizeEl: p, lines: 1, width: w * scale, lh: 0, tight: true}); return p; }
      p.innerHTML = runsHtml(e.runs, e.style && e.style.heavy, e.low); edit(p, e);
      fits.push({el: p, sizeEl: p, lines: n, width: w * scale, lh: (pt || 0) * scale, tight: !!(e.style && e.style.size_model)});
      return p;
    }
  }

  // After the fonts load: scale each element's font so it takes the same number of lines (multi-line) or the same
  // width (single line) as in the photo. Bounded to 0.7-1.3x so a misread size can't explode; when the size comes
  // from the font model (tight) only 0.92-1.08x is allowed - metric differences between the real and the web font -
  // so every paragraph of one style keeps the same size instead of being stretched to its box.
  function scheduleFit(root, fits) {
    const go = () => {
      if (!root.isConnected) { if ((go.tries = (go.tries || 0) + 1) < 50) setTimeout(go, 100); return; }
      for (const f of fits) {
        const el = f.sizeEl, base = parseFloat(el.style.fontSize) || 14;
        const lh = f.lh || parseFloat(getComputedStyle(el).lineHeight) || base * 1.6;
        const linesAt = k => { el.style.fontSize = (base * k).toFixed(2) + "px"; return Math.round(f.el.getBoundingClientRect().height / lh); };
        const LO = f.tight ? 0.92 : 0.7, HI = f.tight ? 1.08 : 1.3;
        if (f.lines === 1) {
          el.style.fontSize = base + "px";
          const span = document.createElement("span"); span.innerHTML = f.el.innerHTML; span.style.cssText = "white-space:nowrap;visibility:hidden;position:absolute";
          el.appendChild(span); const tw = span.getBoundingClientRect().width; span.remove();
          if (tw > 0 && f.width > 0) { const k = Math.min(HI, Math.max(LO, f.width / tw)); el.style.fontSize = (base * k).toFixed(2) + "px"; }
          continue;
        }
        if (!f.lh) continue;
        let lo = LO, hi = HI;  // largest scale that still fits in the photo's line count
        if (linesAt(1) === f.lines) { lo = 1; } else if (linesAt(lo) > f.lines) { el.style.fontSize = (base * lo).toFixed(2) + "px"; continue; }
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (linesAt(mid) <= f.lines) lo = mid; else hi = mid; }
        el.style.fontSize = (base * lo).toFixed(2) + "px";
      }
    };
    Promise.allSettled([...loaded.values()]).then(() => (document.fonts ? document.fonts.ready : null)).then(() => requestAnimationFrame(go));
  }

  const CSS = `
.dv-page{background:#fff;box-sizing:border-box;margin:0 auto;box-shadow:0 6px 24px rgba(16,24,40,.12);line-height:1.75;color:#1a1a1a;font-family:"Noto Sans Khmer","Khmer OS",sans-serif;overflow:hidden}
.dv-page p,.dv-page h1,.dv-page h2,.dv-page h3{margin:0;font-weight:400;box-sizing:border-box}
.dv-page .dv-list{margin:0}.dv-page .dv-li{display:flex;gap:.6em;margin:0}.dv-page .dv-bullet{flex:none;min-width:1.1em;text-align:center}.dv-page .dv-text{flex:1;min-width:0}
.dv-page .dv-figure,.dv-page .dv-rule{margin:0}.dv-page .dv-figure img,.dv-page .dv-rule img{display:block;max-width:none}.dv-page .dv-ph{border:1px dashed #bbb;color:#999;font:12px system-ui;display:grid;place-items:center}
.dv-page .dv-rule hr{border:0;border-top:1px solid #999;margin:0}
.dv-page .dv-row,.dv-page .dv-footer-row{display:flex;align-items:flex-start}.dv-page .dv-col>*{max-width:none}
.dv-page .dv-low{background:#fff3cd;border-radius:2px}
.dv-page .dv-table{border-collapse:collapse;table-layout:fixed;line-height:1.5}.dv-page .dv-table td{padding:.05em .35em;white-space:pre-line;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.dv-page .dv-table.bordered td{border:1px solid #333}.dv-page .dv-table td.dv-span{font-weight:600}
.dv-page .dv-tabline{display:flex;align-items:baseline;white-space:nowrap}.dv-page .dv-tabline .dv-leader{flex:1;min-width:1em;border-bottom:1px dotted currentColor;margin:0 .3em;transform:translateY(-.3em)}.dv-page .dv-tabline .dv-tr{flex:none}
.dv-page [contenteditable]:focus{outline:2px solid #99f6e4;outline-offset:2px;border-radius:2px}
.dv-page b{font-weight:700}`;
  function injectCss() { const old = document.getElementById("dv-css"); if (old) old.remove(); const st = document.createElement("style"); st.id = "dv-css"; st.textContent = CSS; document.head.appendChild(st); }
  injectCss();
  window.DocView = {render, css: CSS};
})();
