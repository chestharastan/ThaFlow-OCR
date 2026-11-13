/* Word and PDF export for ThaOCR: window.ThaExport = {docx(docs, opts), pdf(docs, opts), model(docs, opts)}.

   Both formats are built from one intermediate model (model()), so they agree with each other:
   - ONE body font size for the whole file. The size the font model measured differs a little from paragraph to
     paragraph (29.8 px, 30.3 px ...), which used to give every paragraph its own size in Word and made the file
     awkward to edit. The median of the scan is rounded to half a point and used for every paragraph, list item
     and table cell; headings get fixed steps above it.
   - real structure, not positioned boxes: paragraphs (justified / indented as in the scan), lists that keep the
     scanned marker ("១.", "ក.") or become Word bullets, real tables with column widths and spans, side-by-side
     blocks as a borderless table, figures as pictures.
   Word: the docx library (jsDelivr, loaded on first use). No size on any run, so changing the Normal style in Word
   resizes the whole document.
   PDF: the browser lays the model out off-screen (it breaks Khmer lines with its dictionary and justifies), the
   position of every word is read back, each word is shaped with HarfBuzz (WebAssembly, jsDelivr, loaded on first
   use) with the same font file, and the glyphs are written into a PDF with the fonts embedded. The text stays
   real text: every word carries /ActualText, so it can be selected, searched and copied in the right order. */
(function () {
  "use strict";
  const CFG = {
    docx: "https://cdn.jsdelivr.net/npm/docx@9.15.3/dist/index.iife.js",
    harfbuzz: "https://cdn.jsdelivr.net/npm/harfbuzzjs@1.6.4/dist/index.mjs",
    fontBase: "fonts/",
    bodyFont: "Khmer OS Siemreap",   // used when the font model gave no family; has Latin, digits and punctuation too
    minPt: 9, maxPt: 14, defaultPt: 11,
  };
  const A4 = {w: 595.28, h: 841.89};          // points
  const mm = v => v * 72 / 25.4;
  const KHMER = /[ក-៿᧠-᧿]/;
  const BULLET = /^[•◦○●▪■□◆◇▸►➢➤✓✔·*\-–—+]$/;
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fontTable = () => (window.DocView && window.DocView.fonts) || {};

  /* ================================================================== shared model */
  /** docs: stored documents ({result}) or page results. Returns {title, bodyPt, family, pages: [{pageW, pageH, margin, blocks}]}.
   *  Horizontal positions in the model are fractions of the width of the container they sit in. */
  function model(docs, opts) {
    opts = opts || {};
    const sizes = [], families = new Map();
    const pages = docs.map(d => pageModel(d.result || d, sizes, families));
    const pt = opts.bodyPt || (sizes.length ? Math.round(median(sizes) * 2) / 2 : CFG.defaultPt);
    const family = [...families.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || CFG.bodyFont;
    return {title: opts.title || "document", bodyPt: clamp(pt, CFG.minPt, CFG.maxPt), family, pages};
  }

  function pageModel(page, sizes, families) {
    const W = page.width || 1000, H = page.height || 1414, landscape = W > H * 1.1;
    const pageW = landscape ? A4.h : A4.w, pageH = landscape ? A4.w : A4.h, doc = page.document;
    const m = (doc && doc.margins) || {left: 0.08 * W, right: 0.08 * W, top: 0.07 * H, bottom: 0.07 * H};
    // the margins of the scan, kept inside what a printer and a reader expect; the measured bottom "margin" is only
    // the empty rest of the page, so it is not used
    const margin = {left: clamp(m.left / W * pageW, mm(12.7), mm(30)), right: clamp(m.right / W * pageW, mm(12.7), mm(30)), top: clamp(m.top / H * pageH, mm(12.7), mm(30)), bottom: mm(15)};
    const blocksById = Object.fromEntries((page.blocks || []).map(b => [b.id, b]));
    const x0 = m.left, x1 = W - m.right;
    const out = {pageW, pageH, margin, blocks: []};

    if (!doc || !doc.elements) {  // an old result without the structured document: one paragraph per line
      for (const b of [...(page.blocks || [])].sort((a, c) => a.reading_order - c.reading_order)) {
        if (b.crop && b.crop.url) out.blocks.push({k: "img", src: b.crop.url, w: clamp(b.box.width / (x1 - x0), 0.03, 1), ratio: b.box.height / Math.max(1, b.box.width), align: b.align || "left", left: 0});
        else for (const l of (b.lines || [])) if (l.text) out.blocks.push({k: "p", runs: [{text: (l.bullet ? l.bullet + " " : "") + l.text}], align: "left", left: 0, right: 0, first: 0, heading: 0});
      }
      return out;
    }

    const lineBoxes = e => { const b = blocksById[e.block]; if (!b || !b.lines || !e.lines) return []; const want = new Set(e.lines); return b.lines.filter(l => want.has(l.reading_order)).map(l => l.box).filter(Boolean); };
    function extent(e) {  // [x0, y0, x1, y1] in page pixels
      const union = xs => xs.length ? [Math.min(...xs.map(b => b[0])), Math.min(...xs.map(b => b[1])), Math.max(...xs.map(b => b[2])), Math.max(...xs.map(b => b[3]))] : null;
      if (e.columns) return union(e.columns.flatMap(c => c.elements.map(extent))) || [0, 0, 0, 0];
      if (e.items) { const u = union(e.items.map(extent).filter(b => b[2] > b[0])); if (u) return u; }
      if (e.table && e.table.cols && e.table.cols.length) { const c = e.table.cols, b = e.box || [0, 0, 0, 0]; return [c[0].x0, b[1], c[c.length - 1].x1, b[1] + b[3]]; }
      const lb = lineBoxes(e); if (lb.length) return union(lb.map(b => [b.x, b.y, b.x + b.width, b.y + b.height]));
      const b = e.box || [0, 0, 0, 0]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]];
    }
    // near-black is simply "text"; only a real colour is carried into the file
    const colorOf = st => { const c = st && st.color; if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return null; const v = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)); return Math.max(...v) < 0x50 ? null : c.slice(1).toUpperCase(); };
    const snap = f => f < 0.02 ? 0 : Math.min(0.9, f);  // a few pixels of scan noise are not an indent
    const look = st => { const f = st && st.family, known = f && fontTable()[f]; if (known) families.set(f, (families.get(f) || 0) + 1);
      return {family: known ? f : null, latin: f && /^Latin/.test(f) ? (/sans/i.test(f) ? "sans" : "serif") : null, italic: !!(st && st.slant === "italic"), color: colorOf(st)}; };
    const runsOf = (e, forceBold) => { const st = e.style || {}, all = (forceBold || st.weight === "bold") && !st.heavy;
      const rs = (e.runs && e.runs.length ? e.runs : [{text: e.text || "", bold: false}]).filter(r => r.text).map(r => ({text: r.text, bold: (all || (!!r.bold && !st.heavy)) || undefined}));
      return rs.length ? rs : [{text: ""}]; };
    const note = e => { if (e.style && e.style.font_px) sizes.push(e.style.font_px / W * pageW); };

    function conv(e, cx0, cx1, inherit) {  // -> model block (or null); cx0..cx1 is the container in page pixels
      const cw = Math.max(1, cx1 - cx0), ext = extent(e);
      if (e.type === "row" || e.type === "footer_row") {
        const cols = e.columns.map(c => { const xs = c.elements.map(extent); return {c, a: c.x0 ?? Math.min(...xs.map(b => b[0])), b: c.x1 ?? Math.max(...xs.map(b => b[2]))}; }).filter(k => k.b > k.a).sort((p, q) => p.a - q.a);
        if (!cols.length) return null;
        // a column runs from its first text to just before the next column (the last one to the container's edge): a
        // line that only just fitted in the scan must not wrap; every block keeps its own position inside the column
        let px = cx0; const outCols = [], gapPx = 0.02 * cw;
        cols.forEach((k, i) => { const left = Math.max(k.a, px), next = cols[i + 1], right = Math.max(left + 10, next ? Math.max(k.b, next.a - gapPx) : Math.max(k.b, cx1));
          outCols.push({left: Math.max(0, (left - px) / cw), w: Math.min(1, (right - left) / cw), blocks: k.c.elements.map(x => conv(x, left, right, k.c.align)).filter(Boolean)}); px = right; });
        return {k: "cols", cols: outCols};
      }
      if (e.type === "list") {
        const items = e.items.map(it => { note(it); const ie = extent(it), bx = it.bullet_box ? it.bullet_box.x : ie[0], marker = String(it.bullet || "").trim();
          return Object.assign({marker, bullet: BULLET.test(marker), runs: runsOf(it), left: snap((bx - cx0) / cw)}, look(it.style)); });
        return items.length ? {k: "list", items} : null;
      }
      if (e.type === "figure" || e.type === "decoration") {
        const w = Math.max(8, ext[2] - ext[0]), h = Math.max(4, ext[3] - ext[1]);
        if (!e.crop) return e.type === "decoration" ? {k: "rule", left: snap((ext[0] - cx0) / cw), w: clamp(w / cw, 0.05, 1)} : null;
        const mid = (ext[0] + ext[2]) / 2, centered = e.align === "center" || Math.abs(mid - (cx0 + cx1) / 2) < 0.04 * cw;
        return {k: "img", src: e.crop, w: clamp(w / cw, 0.02, 1), ratio: h / w, align: centered ? "center" : "left", left: centered ? 0 : snap((ext[0] - cx0) / cw)};
      }
      if (e.type === "table" && e.table && e.table.cols && e.table.cols.length) {
        note(e); const t = e.table, n = t.cols.length;
        // the column grid starts at the first text; a ruled table reaches out to the frame the layout model found
        let tx0 = t.cols[0].x0, tx1 = t.cols[n - 1].x1; const bx = e.box, slack = 0.15 * (tx1 - tx0);
        if (t.borders && bx) { if (bx[0] < tx0 && tx0 - bx[0] < slack) tx0 = bx[0]; if (bx[0] + bx[2] > tx1 && bx[0] + bx[2] - tx1 < slack) tx1 = bx[0] + bx[2]; }
        tx0 = Math.max(tx0, cx0); tx1 = Math.max(tx0 + 10, Math.min(tx1, cx1 + 0.02 * cw));
        const total = Math.max(1, tx1 - tx0), edge = (c, i) => [i ? c.x0 : tx0, i === n - 1 ? tx1 : c.x1];
        let left = snap((tx0 - cx0) / cw), w = Math.min(1, total / cw); if (left + w > 1) left = Math.max(0, 1 - w);
        // where the text sits in its cell: gaps to the left and right rule, per cell, then a vote per column
        const blk = blocksById[e.block], byOrder = new Map(((blk && blk.lines) || []).map(l => [l.reading_order, l.box]));
        const gaps = c0 => (c, ci) => { const bs = (c.lines || []).map(o => byOrder.get(o)).filter(Boolean); if (!bs.length || (c.colspan || 1) > 1) return null; const [a, b] = edge(t.cols[ci], ci), cwid = Math.max(1, b - a);
          const gl = (Math.min(...bs.map(q => q.x)) - a) / cwid, gr = (b - Math.max(...bs.map(q => q.x + q.width))) / cwid; return {gl, gr, mid: Math.abs(gl - gr) <= 0.14 && gl > 0.1}; };
        const cellGap = gaps(), perCol = t.cols.map(() => []);
        t.rows.forEach(r => { let ci = 0; for (const c of r.cells) { if (ci >= n) break; const g = cellGap(c, ci); if (g) perCol[ci].push(g); ci += clamp(c.colspan || 1, 1, n - ci); } });
        const sd = a => { const m = median(a); return median(a.map(v => Math.abs(v - m))); };  // median deviation: a centred header cell does not count
        const colAlign = t.cols.map((c, i) => { if (c.align && c.align !== "left") return c.align; const g = perCol[i]; if (g.length < 3) return "left";
          if (g.filter(x => x.mid).length >= 0.6 * g.length) return "center";
          // right: the gap to the right rule is small and the same in every row while the left one is much larger
          const sl = sd(g.map(x => x.gl)), sr = sd(g.map(x => x.gr)), ml = median(g.map(x => x.gl)), mr = median(g.map(x => x.gr));
          return sr < 0.03 && sr <= sl + 0.01 && mr < 0.15 && ml > 2.5 * Math.max(mr, 0.02) ? "right" : "left"; });
        const rows = t.rows.map((r, ri) => { const cells = []; let ci = 0;
          for (const c of r.cells) { if (ci >= n) break; const span = clamp(c.colspan || 1, 1, n - ci), g = cellGap(c, ci);
            cells.push({lines: String(c.text || "").split("\n"), span, align: span > 1 ? "left" : (g && g.mid && colAlign[ci] === "left" && !ri ? "center" : colAlign[ci]), bold: span > 1 || undefined}); ci += span; }
          while (ci < n) { cells.push({lines: [""], span: 1, align: "left"}); ci++; }
          return {cells}; });
        return Object.assign({k: "table", borders: !!t.borders, left, w, cols: t.cols.map((c, i) => { const [a, b] = edge(c, i); return Math.max(0.02, (b - a) / total); }), rows}, look(e.style));
      }
      // headings, paragraphs, header, footer, page_number, caption, footnote, table_row
      note(e);
      const lb = lineBoxes(e), w = Math.max(1, ext[2] - ext[0]), heading = e.type === "heading" ? clamp(e.heading || 1, 1, 3) : 0;
      let align = e.align || "left"; if (align === "left" && inherit && inherit !== "left") align = inherit;
      if (lb.length >= 2 && align === "left") {  // justified in the scan: the lines before the last reach the right edge
        const full = lb.slice(0, -1).filter(b => ext[2] - (b.x + b.width) < 0.03 * w).length; if (full >= Math.max(1, 0.7 * (lb.length - 1))) align = "justify"; }
      const flush = align === "left" || align === "justify";
      let first = 0; if (flush && lb.length >= 2) { const ind = lb[0].x - Math.min(...lb.slice(1).map(b => b.x)); if (ind > 0.01 * cw) first = Math.min(0.2, ind / cw); } else if (flush && e.first_line_indent) first = 0.05;
      const bodyLeft = lb.length >= 2 ? Math.min(...lb.slice(1).map(b => b.x)) : ext[0];
      let left = flush ? snap((bodyLeft - cx0) / cw) : 0, right = align === "justify" || align === "right" ? snap((cx1 - ext[2]) / cw) : 0;
      if (align === "center") { const off = ((ext[0] + ext[2]) / 2 - (cx0 + cx1) / 2) / cw; if (off > 0.02) left = Math.min(0.9, 2 * off); else if (off < -0.02) right = Math.min(0.9, -2 * off); }  // centred on its own axis, not the container's
      const p = Object.assign({k: "p", runs: runsOf(e, !!heading), align, heading, left, right, first}, look(e.style));
      if (e.type === "paragraph" && (e.text || "").includes("\t")) { const [before, ...rest] = e.text.split("\t"); p.tab = {before, after: rest.join(" ")}; p.align = "left"; p.first = 0; p.right = 0; }
      return p;
    }
    out.blocks = doc.elements.map(e => conv(e, x0, x1, null)).filter(Boolean);
    return out;
  }

  /* ================================================================== Word (.docx) */
  let docxLib = null;
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("could not load " + src.split("/").slice(-3).join("/"))); document.head.appendChild(s); }); }
  async function loadDocx() { if (!docxLib) { if (!window.docx) await loadScript(CFG.docx); docxLib = window.docx; } return docxLib; }
  const dataUrlBytes = u => { const b = atob(u.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

  function buildDocx(D, M) {
    const {Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, LeaderType, Tab, TableLayoutType, LevelFormat, VerticalAlign, PageOrientation, LineRuleType} = D;
    const tw = pt => Math.round(pt * 20), half = Math.round(M.bodyPt * 2), em = tw(M.bodyPt);
    const align = a => a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
    const none = {style: BorderStyle.NONE, size: 0, color: "auto"}, line = {style: BorderStyle.SINGLE, size: 4, color: "000000"};
    const borders = on => on ? {top: line, bottom: line, left: line, right: line} : {top: none, bottom: none, left: none, right: none};
    const tableBorders = on => Object.assign(borders(on), {insideHorizontal: on ? line : none, insideVertical: on ? line : none});
    // Latin-only text keeps a Latin face Word always has; the Khmer (complex script) slot keeps the document font
    const KHMER_ONLY = /^Noto (Sans|Serif) Khmer/;
    const fontOf = b => b.family && KHMER_ONLY.test(b.family) ? {ascii: /Serif/.test(b.family) ? "Times New Roman" : "Arial", hAnsi: /Serif/.test(b.family) ? "Times New Roman" : "Arial", cs: b.family, eastAsia: b.family} : b.family ? b.family : b.latin ? {ascii: b.latin === "serif" ? "Times New Roman" : "Arial", hAnsi: b.latin === "serif" ? "Times New Roman" : "Arial", cs: M.family, eastAsia: M.family} : undefined;
    // no size here on purpose: every run takes the one size of the document default (or of its heading style)
    const run = (r, b, extra) => new TextRun(Object.assign({text: r.text, bold: r.bold || undefined, italics: b.italic || undefined, font: fontOf(b), color: b.color || undefined}, extra));
    const runs = (b, rs) => (rs || b.runs).map(r => run(r, b));
    const markerWidth = s => Math.max(360, Math.round([...s].length * em * 0.62) + Math.round(em * 0.5));
    const gap = afterTable => afterTable ? {before: 120, after: 120} : undefined;  // otherwise the spacing of the style applies

    function emit(blocks, width) {  // width: text width of the container in twips
      const out = []; let afterTable = false;
      for (const b of blocks) {
        if (b.k === "p") {
          if (b.tab) out.push(new Paragraph({tabStops: [{type: TabStopType.RIGHT, position: width, leader: LeaderType.DOT}], spacing: gap(afterTable), indent: b.left ? {left: Math.round(b.left * width)} : undefined, children: [...runs(b, [{text: b.tab.before}]), new TextRun({children: [new Tab(), b.tab.after || ""], font: fontOf(b)})]}));
          else out.push(new Paragraph({children: runs(b), alignment: align(b.align), spacing: gap(afterTable),
            heading: b.heading === 1 ? HeadingLevel.HEADING_1 : b.heading === 2 ? HeadingLevel.HEADING_2 : b.heading === 3 ? HeadingLevel.HEADING_3 : undefined,
            indent: (b.left || b.right || b.first) ? {left: Math.round(b.left * width) || undefined, right: Math.round(b.right * width) || undefined, firstLine: Math.round(b.first * width) || undefined} : undefined}));
          afterTable = false;
        } else if (b.k === "list") {
          b.items.forEach((it, i) => { const left = Math.round(it.left * width), sp = {before: afterTable && !i ? 120 : 0, after: 60};
            if (it.bullet) out.push(new Paragraph({children: runs(it), numbering: {reference: /[-–—+]/.test(it.marker) ? "tx-dash" : "tx-bullet", level: 0}, indent: {left: left + 360, hanging: 360}, spacing: sp}));
            else if (it.marker) { const hang = markerWidth(it.marker);  // the scanned number stays as it was read: Word must not renumber it
              out.push(new Paragraph({indent: {left: left + hang, hanging: hang}, tabStops: [{type: TabStopType.LEFT, position: left + hang}], spacing: sp, children: [run({text: it.marker, bold: it.runs[0] && it.runs[0].bold}, it), new TextRun({children: [new Tab()]}), ...runs(it)]})); }
            else out.push(new Paragraph({children: runs(it), indent: left ? {left} : undefined, spacing: sp})); });
          afterTable = false;
        } else if (b.k === "img") {
          try { const wPx = Math.max(8, Math.round(b.w * width / 15)), type = /^data:image\/jpe?g/i.test(b.src) ? "jpg" : "png";
            out.push(new Paragraph({alignment: align(b.align), spacing: gap(afterTable), indent: b.left ? {left: Math.round(b.left * width)} : undefined, children: [new ImageRun({type, data: dataUrlBytes(b.src), transformation: {width: wPx, height: Math.max(4, Math.round(wPx * b.ratio))}})]})); afterTable = false; }
          catch (err) { console.warn("picture skipped", err); }
        } else if (b.k === "rule") {
          out.push(new Paragraph({children: [], spacing: {before: 0, after: 120}, indent: {left: Math.round(b.left * width), right: Math.max(0, Math.round((1 - b.left - b.w) * width))}, border: {bottom: {style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1}}})); afterTable = false;
        } else if (b.k === "table") {
          const total = Math.round(b.w * width), sum = b.cols.reduce((p, q) => p + q, 0); let widths = b.cols.map(c => Math.max(200, Math.round(total * c / sum)));
          widths[widths.length - 1] += total - widths.reduce((p, q) => p + q, 0); if (widths[widths.length - 1] < 200) widths = widths.map(() => Math.floor(total / widths.length));
          const full = widths.reduce((p, q) => p + q, 0);
          out.push(new Table({width: {size: full, type: WidthType.DXA}, columnWidths: widths, layout: TableLayoutType.FIXED, indent: b.left ? {size: Math.round(b.left * width), type: WidthType.DXA} : undefined, borders: tableBorders(b.borders),
            rows: b.rows.map(r => { let ci = 0; return new TableRow({cantSplit: true, children: r.cells.map(c => { const cw = widths.slice(ci, ci + c.span).reduce((p, q) => p + q, 0); ci += c.span;
              return new TableCell({width: {size: cw, type: WidthType.DXA}, columnSpan: c.span > 1 ? c.span : undefined, borders: borders(b.borders), verticalAlign: VerticalAlign.TOP, margins: {top: 40, bottom: 40, left: 100, right: 100},
                children: c.lines.map(tx => new Paragraph({alignment: align(c.align), spacing: {before: 0, after: 0}, children: [run({text: tx, bold: c.bold}, b)]}))}); })}); })}));
          afterTable = true;
        } else if (b.k === "cols") {  // side-by-side blocks: one borderless row, one cell per column (the gap before a column is part of its cell)
          const ws = b.cols.map(c => Math.max(300, Math.round((c.left + c.w) * width))), over = ws.reduce((p, q) => p + q, 0) - width;
          if (over > 0) ws[ws.length - 1] = Math.max(300, ws[ws.length - 1] - over);
          out.push(new Table({width: {size: ws.reduce((p, q) => p + q, 0), type: WidthType.DXA}, columnWidths: ws, layout: TableLayoutType.FIXED, borders: tableBorders(false),
            rows: [new TableRow({children: b.cols.map((c, i) => { const pad = Math.min(ws[i] - 200, Math.round(c.left * width)), inner = emit(c.blocks, Math.max(200, ws[i] - pad));
              if (!inner.length || inner[inner.length - 1] instanceof Table) inner.push(new Paragraph({children: [], spacing: {before: 0, after: 0, line: 40, lineRule: LineRuleType.EXACT}}));
              return new TableCell({width: {size: ws[i], type: WidthType.DXA}, borders: borders(false), verticalAlign: VerticalAlign.TOP, margins: {top: 0, bottom: 0, left: Math.max(0, pad), right: 0}, children: inner}); })})]}));
          afterTable = true;
        }
      }
      // Word joins two tables that touch and needs a paragraph after the last one: a 2 pt line that takes no visible room
      for (let i = out.length - 1; i >= 0; i--) if (out[i] instanceof Table && (i === out.length - 1 || out[i + 1] instanceof Table)) out.splice(i + 1, 0, new Paragraph({children: [], spacing: {before: 0, after: 0, line: 40, lineRule: LineRuleType.EXACT}}));
      return out;
    }

    const headingStyle = (extra, before) => ({run: {font: M.family, size: half + extra * 2, bold: true, color: "000000"}, paragraph: {spacing: {before, after: 120}, keepNext: true}});
    const bullet = text => ({levels: [{level: 0, format: LevelFormat.BULLET, text, alignment: AlignmentType.LEFT, style: {paragraph: {indent: {left: 360, hanging: 360}}}}]});
    return new D.Document({creator: "ThaOCR", title: M.title,
      styles: {default: {document: {run: {font: M.family, size: half, language: {value: "en-US", bidirectional: "km-KH"}}, paragraph: {spacing: {after: 120}}},
        heading1: headingStyle(2, 200), heading2: headingStyle(1, 160), heading3: headingStyle(0, 120)}},
      numbering: {config: [Object.assign({reference: "tx-bullet"}, bullet("•")), Object.assign({reference: "tx-dash"}, bullet("–"))]},
      sections: M.pages.map(p => ({properties: {page: {size: {width: tw(Math.min(p.pageW, p.pageH)), height: tw(Math.max(p.pageW, p.pageH)), orientation: p.pageW > p.pageH ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT},
        margin: {top: tw(p.margin.top), bottom: tw(p.margin.bottom), left: tw(p.margin.left), right: tw(p.margin.right)}}}, children: (c => c.length ? c : [new Paragraph({children: []})])(emit(p.blocks, tw(p.pageW - p.margin.left - p.margin.right)))}))});
  }

  async function docxBlob(docs, opts) { const D = await loadDocx(); return D.Packer.toBlob(buildDocx(D, model(docs, opts))); }

  /* ================================================================== PDF */
  const SCALE = 4;                 // layout pixels per CSS pixel: advances a browser rounds to whole pixels stop mattering
  const K = 0.75 / SCALE;          // layout pixel -> point
  let HB = null;
  async function loadHarfbuzz() { if (!HB) HB = await import(/* webpackIgnore: true */ CFG.harfbuzz); return HB; }

  /** One embedded font file: its bytes for the PDF, a FontFace for layout and a HarfBuzz font for shaping. */
  const pfonts = new Map();
  let pfontSeq = 0;
  async function pfont(file) {
    if (pfonts.has(file)) return pfonts.get(file);
    const pr = (async () => {
      const r = await fetch(CFG.fontBase + encodeURIComponent(file)); if (!r.ok) throw new Error("font " + file + " not found");
      const bytes = new Uint8Array(await r.arrayBuffer()), hb = await loadHarfbuzz(), css = "txp" + (pfontSeq++);
      const ff = new FontFace(css, bytes.buffer.slice(0)); await ff.load(); document.fonts.add(ff);
      const face = new hb.Face(new hb.Blob(bytes)), font = new hb.Font(face), upem = face.upem || 1000, cover = new Set(face.collectUnicodes());
      const head = face.referenceTable("head"), i16 = (t, o) => { const v = (t[o] << 8) | t[o + 1]; return v > 32767 ? v - 65536 : v; }, ext = font.hExtents();
      const s = 1000 / upem, bbox = head && head.length >= 44 ? [i16(head, 36), i16(head, 38), i16(head, 40), i16(head, 42)].map(v => Math.round(v * s)) : [-500, -500, 1500, 1500];
      return {file, css, bytes, face, font, upem, cover, bbox, ascent: Math.round(ext.ascender * s), descent: Math.round(ext.descender * s), used: new Map() /* gid -> width in 1/1000 em */, space: font.nominalGlyph(32) || 0, rev: null, asc: null};
    })();
    pfonts.set(file, pr); pr.catch(() => pfonts.delete(file));
    return pr;
  }
  /** Font files for a family: {regular, bold (a bold file of the same design, or null -> the PDF thickens the regular one)}. */
  function filesOf(family) { const t = fontTable(), f = t[family] || t[CFG.bodyFont] || ["KhmerOSsiemreap.ttf"], stem = x => x.replace(/\.[a-z0-9]+$/i, "").replace(/-(Regular|Bold)$/i, "");
    // "Khmer OS Battambang" is paired with Google's Battambang Bold on screen, a different drawing with a smaller body:
    // in a file where every paragraph has one size that looks like a smaller font, so only a true pair is used as bold
    return {regular: f[0], bold: f.length > 1 && stem(f[0]) === stem(f[1]) ? f[1] : null}; }
  const IGNORABLE = cp => cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0xFEFF || cp === 0xAD || cp === 0x20 || cp === 0xA0 || cp === 9;
  /** Split text by the first font of the chain that has each character, so the browser never falls back to a system
   *  font the PDF could not embed. */
  function byFont(text, chain) {
    const out = []; let cur = null, buf = "";
    for (const ch of text) { const cp = ch.codePointAt(0); let f = cur;
      if (!(IGNORABLE(cp) && cur)) f = chain.find(x => x.cover.has(cp)) || (IGNORABLE(cp) ? chain[0] : cur || chain[0]);
      if (f !== cur && buf) { out.push({font: cur, text: buf}); buf = ""; } cur = f; buf += ch; }
    if (buf) out.push({font: cur, text: buf});
    return out;
  }

  /** Lays one page of the model out in a hidden box and returns what to draw, in layout pixels from the box's corner. */
  async function layoutPage(M, P, host) {
    const cw = (P.pageW - P.margin.left - P.margin.right) / K, body = M.bodyPt / K, bw = 0.5 / K;
    const base = filesOf(M.family), fallback = [await pfont(filesOf(CFG.bodyFont).regular)];
    try { const t = fontTable()["Kantumruy Pro"]; if (t) fallback.push(await pfont(t[0])); } catch (e) { /* symbols only */ }
    const draw = new Map();  // span -> {font, fake bold, italic, colour}
    const root = document.createElement("div"); root.className = "txp"; root.lang = "km";
    root.style.cssText = `position:absolute;left:0;top:0;width:${cw}px;font-size:${body}px;`;
    const el = (tag, css, parent) => { const n = document.createElement(tag); if (css) n.style.cssText = css; (parent || root).appendChild(n); return n; };
    const pct = f => (f * 100).toFixed(3) + "%";

    async function text(parent, b, rs) {
      for (const r of rs) { if (!r.text) continue; const files = b.family ? filesOf(b.family) : base, real = r.bold && files.bold;
        const chain = [await pfont(real ? files.bold : files.regular), ...fallback];
        for (const seg of byFont(r.text, chain)) { const sp = document.createElement("span"); sp.style.fontFamily = seg.font.css; sp.textContent = seg.text; parent.appendChild(sp);
          draw.set(sp, {font: seg.font, bold: !!r.bold && !(real && seg.font === chain[0]), italic: !!b.italic, color: b.color || null}); } }
    }
    const alignCss = a => `text-align:${a === "justify" ? "justify" : a === "center" ? "center" : a === "right" ? "right" : "left"};`;
    async function emit(blocks, parent) {
      for (const b of blocks) {
        if (b.k === "p") {
          if (b.tab) { const row = el("div", `display:flex;align-items:baseline;white-space:nowrap;margin-bottom:.5em;margin-left:${pct(b.left)}`, parent);
            await text(el("span", "flex:none", row), b, [{text: b.tab.before}]); el("span", "flex:1;min-width:1em;margin:0 .3em;height:0", row).dataset.ld = "1"; await text(el("span", "flex:none", row), b, [{text: b.tab.after}]); continue; }
          const size = b.heading ? (M.bodyPt + (3 - b.heading)) / M.bodyPt : 1;
          const p = el("div", `${alignCss(b.align)}margin-bottom:.5em;${b.heading ? `font-size:${size}em;margin-top:${b.heading === 1 ? ".7" : ".5"}em;` : ""}padding-left:${pct(b.left)};padding-right:${pct(b.right)};text-indent:${pct(b.first)};`, parent);
          if (b.heading) p.dataset.keep = "1"; await text(p, b, b.runs);
        } else if (b.k === "list") {
          for (const it of b.items) { const li = el("div", `display:flex;align-items:baseline;margin-bottom:.25em;margin-left:${pct(it.left)}`, parent);
            const mk = el("span", "flex:none;min-width:1.4em;padding-right:.4em;white-space:nowrap", li); await text(mk, it, [{text: it.marker || "", bold: it.runs[0] && it.runs[0].bold}]);
            await text(el("div", "flex:1;min-width:0", li), it, it.runs); }
          if (parent.lastChild) parent.lastChild.style.marginBottom = ".5em";
        } else if (b.k === "img") {
          const im = el("div", `width:${pct(b.w)};aspect-ratio:${(1 / Math.max(0.01, b.ratio)).toFixed(4)};margin-bottom:.5em;${b.align === "center" ? "margin-left:auto;margin-right:auto;" : `margin-left:${pct(b.left)};`}`, parent); im.dataset.img = b.src;
        } else if (b.k === "rule") { el("div", `height:0;margin:.2em 0 .6em ${pct(b.left)};width:${pct(b.w)}`, parent).dataset.rule = "1";
        } else if (b.k === "table") {
          const t = el("table", `border-collapse:collapse;table-layout:fixed;width:${pct(b.w)};margin:0 0 .6em ${pct(b.left)};`, parent), cg = el("colgroup", "", t), sum = b.cols.reduce((p, q) => p + q, 0);
          for (const c of b.cols) el("col", `width:${pct(c / sum)}`, cg);
          const tb = el("tbody", "", t);
          for (const r of b.rows) { const tr = el("tr", "", tb); tr.dataset.row = "1";
            for (const c of r.cells) { const td = el("td", `padding:.1em .4em;vertical-align:top;overflow-wrap:anywhere;${alignCss(c.align)}${b.borders ? `border:${bw}px solid #000;` : ""}`, tr); if (c.span > 1) td.colSpan = c.span; if (b.borders) td.dataset.cell = "1";
              for (const ln of c.lines) await text(el("div", ln ? "" : "min-height:1em", td), b, [{text: ln, bold: c.bold}]); } }
        } else if (b.k === "cols") {
          const row = el("div", "display:flex;align-items:flex-start;margin-bottom:.2em", parent);
          for (const c of b.cols) await emit(c.blocks, el("div", `flex:none;min-width:0;width:${pct(c.w)};margin-left:${pct(c.left)}`, row));
        }
      }
    }
    await emit(P.blocks, root);
    host.appendChild(root);
    await document.fonts.ready;

    // ---- read the layout back
    const o = root.getBoundingClientRect(), items = [], bands = [], range = document.createRange();
    const ascOf = f => { if (f.asc != null) return f.asc;  // distance from the top of a text box to its baseline, per font, measured once
      const probe = el("span", `position:absolute;left:0;top:0;white-space:nowrap;font-family:${f.css};font-size:200px;line-height:normal`), tn = document.createTextNode("x"), ib = document.createElement("span");
      ib.style.cssText = "display:inline-block;width:1px;height:1px;vertical-align:baseline"; probe.appendChild(tn); probe.appendChild(ib);
      range.selectNodeContents(tn); const tr = range.getClientRects()[0], br = ib.getBoundingClientRect(); f.asc = tr ? (br.bottom - tr.top) / 200 : f.ascent / 1000; probe.remove(); return f.asc; };
    const sizeOf = new Map(), fontSize = n => { const p = n.parentNode; if (!sizeOf.has(p)) sizeOf.set(p, parseFloat(getComputedStyle(p).fontSize) || body); return sizeOf.get(p); };
    const firstRect = (tn, a, b) => { range.setStart(tn, a); range.setEnd(tn, b); for (const r of range.getClientRects()) if (r.width > 0.01 && r.height > 0) return r; return null; };
    for (const [sp, d] of draw) {
      const tn = sp.firstChild; if (!tn) continue; const s = tn.data, size = fontSize(sp), asc = ascOf(d.font) * size, re = /\S+/g; let m;
      const push = (a, b, r) => { if (!r) return; const sp2 = /\s/.test(s[b] || ""); items.push({t: "text", x: r.left - o.left, y: r.top - o.top + asc, top: r.top - o.top, bottom: r.bottom - o.top, text: s.slice(a, b), space: sp2, size, d}); bands.push([r.top - o.top, r.bottom - o.top, 0]); };
      while ((m = re.exec(s))) { const a = m.index, b = a + m[0].length; range.setStart(tn, a); range.setEnd(tn, b);
        const rects = [...range.getClientRects()].filter(r => r.width > 0.01 && r.height > 0);
        if (rects.length <= 1) { push(a, b, rects[0]); continue; }
        // the word wraps (Khmer has no spaces inside a phrase): find where each line starts
        let fa = a, top = null, fr = null;
        for (let i = a; i < b; i++) { const c = s.charCodeAt(i); if (c >= 0xDC00 && c <= 0xDFFF) continue; const r = firstRect(tn, i, Math.min(b, i + (c >= 0xD800 && c <= 0xDBFF ? 2 : 1))); if (!r) continue;
          if (top == null) { top = r.top; fr = r; continue; }
          if (Math.abs(r.top - top) > 0.5 * r.height) { push(fa, i, firstRect(tn, fa, i) || fr); fa = i; top = r.top; fr = r; } }
        push(fa, b, firstRect(tn, fa, b) || fr);
      }
    }
    for (const n of root.querySelectorAll("[data-row]")) { const r = n.getBoundingClientRect(); bands.push([r.top - o.top, r.bottom - o.top, 0]); }
    for (const n of root.querySelectorAll("[data-cell]")) { const r = n.getBoundingClientRect(); items.push({t: "box", x: r.left - o.left, top: r.top - o.top, w: r.width, h: r.height}); }
    for (const n of root.querySelectorAll("[data-img]")) { const r = n.getBoundingClientRect(); items.push({t: "img", x: r.left - o.left, top: r.top - o.top, w: r.width, h: r.height, src: n.dataset.img}); bands.push([r.top - o.top, r.bottom - o.top, 0]); }
    for (const n of root.querySelectorAll("[data-rule]")) { const r = n.getBoundingClientRect(); items.push({t: "line", x: r.left - o.left, top: r.top - o.top, w: r.width}); }
    for (const n of root.querySelectorAll("[data-ld]")) { const r = n.getBoundingClientRect(); items.push({t: "dots", x: r.left - o.left, top: r.bottom - o.top, w: r.width}); }
    for (const n of root.querySelectorAll("[data-keep]")) { const r = n.getBoundingClientRect(); bands.push([r.top - o.top, r.bottom - o.top, 1]); }
    root.remove();

    // ---- pages: never cut a text line, a table row or a picture; a heading moves with what follows it
    const H = (P.pageH - P.margin.top - P.margin.bottom) / K, merged = [];
    for (const b of bands.sort((p, q) => p[0] - q[0])) { const last = merged[merged.length - 1]; if (last && b[0] < last[1] - 0.5) { last[1] = Math.max(last[1], b[1]); last[2] = last[2] || b[2]; } else merged.push(b.slice()); }
    const starts = [0];
    for (let i = 0; i < merged.length; i++) { const s = starts[starts.length - 1], b = merged[i];
      if (b[1] - s > H && b[0] > s + 1) { let j = i; while (j > 0 && merged[j - 1][2] && merged[j - 1][0] > s + 1) j--; starts.push(merged[j][0]); if (merged[i][1] - merged[j][0] > H && j !== i) starts.push(merged[i][0]); } }
    const pageOf = top => { let p = 0; for (let i = 0; i < starts.length; i++) if (top >= starts[i] - 0.5) p = i; return p; };
    const pages = starts.map(() => []);
    for (const it of items) { const p = pageOf(it.top); it.oy = starts[p]; pages[p].push(it); }
    return pages;
  }

  const isKhmer = cp => (cp >= 0x1780 && cp <= 0x17FF) || (cp >= 0x19E0 && cp <= 0x19FF);
  const isLetter = cp => (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) || (cp >= 0xC0 && cp <= 0x24F);
  /** Runs of one script, as the browser itemises them: digits and punctuation go with the letters before them. */
  function scriptRuns(text) {
    const out = []; let cur = null, buf = "";
    for (const ch of text) { const cp = ch.codePointAt(0), s = isKhmer(cp) ? "Khmr" : isLetter(cp) ? "Latn" : null;
      if (s && cur && s !== cur) { out.push([cur, buf]); buf = ""; } if (s) cur = s; buf += ch; }
    if (buf) out.push([cur || "Latn", buf]);
    return out;
  }
  let hbBuffer = null;
  /** HarfBuzz glyphs for a word: [{g, ax, dx, dy}] in font units. */
  function shape(f, text) {
    const hb = HB, glyphs = []; if (!hbBuffer) hbBuffer = new hb.Buffer();
    for (const [script, part] of scriptRuns(text)) { const b = hbBuffer; b.clearContents(); b.addText(part); b.setDirection(hb.Direction ? hb.Direction.LTR : 4); b.setScript(script); b.setLanguage(script === "Khmr" ? "km" : "en");
      hb.shape(f.font, b); const info = b.getGlyphInfos(), pos = b.getGlyphPositions();
      for (let i = 0; i < info.length; i++) glyphs.push({g: info[i].codepoint, ax: pos[i].xAdvance, dx: pos[i].xOffset, dy: pos[i].yOffset}); }
    return glyphs;
  }
  const num = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, "") || "0"; };
  const hex4 = v => (v & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
  const utf16hex = s => { let h = "FEFF"; for (let i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i)); return h; };
  const widthOf = (f, g) => { let w = f.used.get(g); if (w == null) { w = Math.round(f.font.glyphHAdvance(g) * 1000 / f.upem); f.used.set(g, w); } return w; };

  /** Content stream of one page. The pen position the viewer derives from the /W widths is tracked, and every glyph is
   *  nudged (TJ) to where HarfBuzz put it, so marks and kerning land exactly. */
  function pageContent(items, P, fontName, imageName) {
    const c = [], X = x => P.margin.left + x * K, Y = (y, oy) => P.pageH - P.margin.top - (y - oy) * K;
    for (const it of items) {
      if (it.t === "box") { c.push(`0.5 w 0 G ${num(X(it.x))} ${num(Y(it.top + it.h, it.oy))} ${num(it.w * K)} ${num(it.h * K)} re S`); continue; }
      if (it.t === "line") { c.push(`0.6 w 0 G ${num(X(it.x))} ${num(Y(it.top, it.oy))} m ${num(X(it.x + it.w))} ${num(Y(it.top, it.oy))} l S`); continue; }
      if (it.t === "dots") { c.push(`q 0.8 w 1 J [0 2.4] 0 d 0 G ${num(X(it.x))} ${num(Y(it.top, it.oy) + 1)} m ${num(X(it.x + it.w))} ${num(Y(it.top, it.oy) + 1)} l S Q`); continue; }
      if (it.t === "img") { const n = imageName(it.src); if (n) c.push(`q ${num(it.w * K)} 0 0 ${num(it.h * K)} ${num(X(it.x))} ${num(Y(it.top + it.h, it.oy))} cm /${n} Do Q`); continue; }
      const f = it.d.font, size = it.size * K, glyphs = shape(f, it.text); if (!glyphs.length) continue;
      if (it.space && f.space) glyphs.push({g: f.space, ax: f.font.glyphHAdvance(f.space), dx: 0, dy: 0, sp: true});
      const rgb = it.d.color ? [0, 2, 4].map(i => num(parseInt(it.d.color.substr(i, 2), 16) / 255)).join(" ") : "0 0 0";
      const out = [`/Span <</ActualText <${utf16hex(it.text + (it.space ? " " : ""))}>>> BDC BT /${fontName(f)} ${num(size)} Tf ${rgb} rg`];
      if (it.d.bold) out.push(`2 Tr ${num(size * 0.03)} w ${rgb} RG`); else out.push("0 Tr");  // a family without a bold file: fill and stroke
      out.push(`1 0 ${it.d.italic ? "0.2126" : "0"} 1 ${num(X(it.x))} ${num(Y(it.y, it.oy))} Tm`);
      let pen = 0, want = 0, rise = 0, arr = [], hexrun = "";
      const flushHex = () => { if (hexrun) { arr.push(`<${hexrun}>`); hexrun = ""; } }, flush = () => { flushHex(); if (arr.length) { out.push(`[${arr.join(" ")}] TJ`); arr = []; } };
      for (const g of glyphs) { const u = 1000 / f.upem, gx = want + g.dx * u, gr = g.dy * u * size / 1000;
        if (!g.g) { want += g.ax * u; continue; }  // .notdef: the font has no such character; leave the space, keep the text in /ActualText
        if (Math.abs(gr - rise) > 0.005) { flush(); rise = gr; out.push(`${num(rise)} Ts`); }
        if (Math.abs(gx - pen) > 0.5) { flushHex(); arr.push(num(pen - gx)); pen = gx; }
        hexrun += hex4(g.g); pen += widthOf(f, g.g); want += g.ax * u; }
      flush(); if (rise) out.push("0 Ts");
      out.push("ET EMC"); c.push(out.join(" "));
    }
    return c.join("\n");
  }

  async function deflate(bytes) { if (typeof CompressionStream === "undefined") return null;
    try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer()); } catch (e) { return null; } }
  async function jpegOf(src) {  // pictures go in as JPEG (DCTDecode): no PNG decoder or alpha channel needed in the file
    const img = new Image(); img.src = src; await img.decode(); const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
    const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92)); return {w: cv.width, h: cv.height, bytes: new Uint8Array(await blob.arrayBuffer())};
  }

  async function pdfBlob(docs, opts) {
    opts = opts || {};
    const M = model(docs, opts); await loadHarfbuzz();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    const css = document.createElement("style");
    css.textContent = `.txp,.txp *{box-sizing:border-box;margin:0;padding:0;border:0;font-style:normal;font-weight:400;font-variant:normal;letter-spacing:0;word-spacing:0;text-transform:none;text-decoration:none;text-shadow:none}
.txp{line-height:normal;color:#000;text-align:left;white-space:normal;overflow-wrap:break-word;word-break:normal;hyphens:manual;font-synthesis:none;font-kerning:normal;font-variant-ligatures:normal;font-feature-settings:normal;text-rendering:geometricPrecision;-webkit-text-size-adjust:none;text-size-adjust:none;max-height:9999999px;direction:ltr}
.txp table{border-spacing:0}`;
    host.appendChild(css); document.body.appendChild(host);
    const out = [];  // [{P, items}]
    try { for (let i = 0; i < M.pages.length; i++) { const P = M.pages[i]; for (const items of await layoutPage(M, P, host)) out.push({P, items}); if (opts.onProgress) opts.onProgress(i + 1, M.pages.length); await new Promise(r => setTimeout(r, 0)); } }
    finally { host.remove(); }

    // ---- write the file
    const enc = new TextEncoder(), objs = [null], alloc = () => objs.push(null) - 1, put = (id, dict, stream) => { objs[id] = {dict, stream}; };
    const fontIds = new Map(), fontName = f => { if (!fontIds.has(f)) fontIds.set(f, {name: "F" + (fontIds.size + 1), id: alloc()}); return fontIds.get(f).name; };
    const images = new Map(); for (const pg of out) for (const it of pg.items) if (it.t === "img" && !images.has(it.src)) { try { images.set(it.src, Object.assign(await jpegOf(it.src), {name: "Im" + (images.size + 1), id: alloc()})); } catch (e) { console.warn("picture skipped", e); images.set(it.src, null); } }
    const imageName = src => { const im = images.get(src); return im ? im.name : null; };
    const catalog = alloc(), pagesId = alloc(), info = alloc(), pageIds = [];
    for (const pg of out) { const id = alloc(), cid = alloc(), raw = enc.encode(pageContent(pg.items, pg.P, fontName, imageName)), z = await deflate(raw);
      put(cid, z ? "/Filter /FlateDecode" : "", z || raw); pageIds.push(id); pg.id = id; pg.cid = cid; }
    const fontRes = () => [...fontIds.values()].map(v => `/${v.name} ${v.id} 0 R`).join(" "), imgRes = [...images.values()].filter(Boolean).map(v => `/${v.name} ${v.id} 0 R`).join(" ");
    for (const pg of out) put(pg.id, `/Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(pg.P.pageW)} ${num(pg.P.pageH)}] /Contents ${pg.cid} 0 R /Resources << /Font << ${fontRes()} >>${imgRes ? ` /XObject << ${imgRes} >>` : ""} >>`);
    for (const im of images.values()) if (im) put(im.id, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, im.bytes);
    let fi = 0;
    for (const [f, v] of fontIds) {  // Type0 font with an Identity-H CID font: character codes are glyph ids
      const cid = alloc(), desc = alloc(), file = alloc(), tou = alloc(), name = f.file.replace(/\.[a-z]+$/i, "").replace(/[^A-Za-z0-9]/g, "") || "Font" + (++fi);
      if (!f.rev) { f.rev = new Map(); for (const cp of f.cover) { const g = f.font.nominalGlyph(cp); if (g && !f.rev.has(g)) f.rev.set(g, cp); } }
      const gids = [...f.used.keys()].sort((a, b) => a - b), W = gids.map(g => `${g} [${f.used.get(g)}]`).join(" ");
      const maps = gids.filter(g => f.rev.has(g)).map(g => `<${hex4(g)}> <${utf16hex(String.fromCodePoint(f.rev.get(g))).slice(4)}>`), chunks = []; for (let i = 0; i < maps.length; i += 100) chunks.push(`${Math.min(100, maps.length - i)} beginbfchar\n${maps.slice(i, i + 100).join("\n")}\nendbfchar`);
      const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
      const zf = await deflate(f.bytes), zc = await deflate(enc.encode(cmap));
      put(file, `/Length1 ${f.bytes.length}${zf ? " /Filter /FlateDecode" : ""}`, zf || f.bytes);
      put(tou, zc ? "/Filter /FlateDecode" : "", zc || enc.encode(cmap));
      put(desc, `/Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${f.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${Math.round(f.ascent * 0.7)} /StemV 80 /FontFile2 ${file} 0 R`);
      put(cid, `/Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /DW 1000 /W [${W}] /CIDToGIDMap /Identity`);
      put(v.id, `/Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tou} 0 R`);
      f.used = new Map();  // the next export starts its own width table
    }
    const d = new Date(), z2 = v => String(v).padStart(2, "0"), stamp = `D:${d.getUTCFullYear()}${z2(d.getUTCMonth() + 1)}${z2(d.getUTCDate())}${z2(d.getUTCHours())}${z2(d.getUTCMinutes())}${z2(d.getUTCSeconds())}Z`;
    put(pagesId, `/Type /Pages /Kids [${pageIds.map(i => i + " 0 R").join(" ")}] /Count ${pageIds.length}`);
    put(catalog, `/Type /Catalog /Pages ${pagesId} 0 R /Lang (km)`);
    put(info, `/Title <${utf16hex(M.title)}> /Producer (ThaOCR) /Creator (ThaOCR) /CreationDate (${stamp})`);
    const parts = [], offsets = [0]; let pos = 0; const add = b => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); pos += u.length; };
    add("%PDF-1.7\n"); add(new Uint8Array([37, 0xE2, 0xE3, 0xCF, 0xD3, 10]));
    for (let i = 1; i < objs.length; i++) { const ob = objs[i]; offsets[i] = pos;
      if (ob.stream) { add(`${i} 0 obj\n<< ${ob.dict} /Length ${ob.stream.length} >>\nstream\n`); add(ob.stream); add("\nendstream\nendobj\n"); } else add(`${i} 0 obj\n<< ${ob.dict} >>\nendobj\n`); }
    const xref = pos; add(`xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map(v => String(v).padStart(10, "0") + " 00000 n \n").join(""));
    add(`trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, {type: "application/pdf"});
  }

  /* ================================================================== download */
  const safeName = s => String(s || "document").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 120) || "document";
  /** The link stays alive for a minute: a phone asks before it saves, and a link revoked too early saves nothing. */
  function save(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener"; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }

  window.ThaExport = {
    config: CFG, model,
    docxBlob, pdfBlob,
    async docx(docs, opts) { opts = opts || {}; const blob = await docxBlob(docs, opts); save(blob, safeName(opts.title) + ".docx"); return blob; },
    async pdf(docs, opts) { opts = opts || {}; const blob = await pdfBlob(docs, opts); save(blob, safeName(opts.title) + ".pdf"); return blob; },
  };
})();
