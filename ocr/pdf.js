/* ThaOCR PDF input. pdf.js (from jsDelivr) opens the file in the browser. A page that already carries a text layer
   (born-digital PDF, or a scan with an OCR layer) is read straight from that layer - no models, no OCR - and goes
   through the same paragraph / structure / document steps as an OCR result. A page without usable text is rendered
   to an image and handed to the normal OCR pipeline. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};
  T.config.pdfBase = T.config.pdfBase || "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/";
  const KHMER = /[ក-៿]/, GARBAGE = /[-�\u0000-\u0008\u25CC]/g;
  let lib = null;

  async function pdfjs() {
    if (lib) return lib;
    const base = new URL(T.config.pdfBase, location.href).href;
    lib = await import(/* webpackIgnore: true */ base + "build/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = base + "build/pdf.worker.min.mjs"; // cross-origin: pdf.js wraps it in a blob worker itself
    return lib;
  }
  const isPdf = f => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));

  /** Open a File/Blob -> pdf.js document (call .destroy() when done). */
  async function open(file) {
    const p = await pdfjs(), base = new URL(T.config.pdfBase, location.href).href;
    const data = new Uint8Array(await file.arrayBuffer());
    const bytes = data.slice(); // pdf.js transfers `data` to its worker, keep our own copy for the ActualText pass
    const task = p.getDocument({data, cMapUrl: base + "cmaps/", cMapPacked: true, standardFontDataUrl: base + "standard_fonts/", isEvalSupported: false});
    const doc = await task.promise; doc.__task = task; doc.__bytes = bytes; return doc;
  }
  /** Free a document opened with open() (pdf.js versions differ on where destroy() lives). */
  async function close(doc) { try { if (doc && typeof doc.destroy === "function") await doc.destroy(); else if (doc && doc.__task) await doc.__task.destroy(); } catch (e) { console.warn("pdf close", e); } }

  /** Render a page so that its long side is `longSide` px. -> {canvas, width, height, viewport, scale} */
  async function render(page, longSide) {
    const v0 = page.getViewport({scale: 1}), scale = longSide / Math.max(v0.width, v0.height), vp = page.getViewport({scale});
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d", {willReadFrequently: true}); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({canvasContext: ctx, viewport: vp, background: "#ffffff"}).promise;
    return {canvas: c, width: c.width, height: c.height, viewport: vp, scale};
  }

  /* Chrome/Skia PDFs map ligated Khmer glyphs to repeated vowel signs ("ស្តីី"): a dependent sign never repeats in
     valid Khmer, so collapsing runs is safe. Soft hyphens and odd spaces go too. */
  const cleanText = s => s.replace(/([឴-៓])\1+/g, "$1").replace(/­/g, "").replace(/[\t  -  ]+/g, " ").replace(/ {2,}/g, " ");

  /* ------------------------------------------------------------------ ActualText
     Skia (Chrome, Google Docs, Android) shapes Khmer into ligature glyphs and writes the real text as
       /Span <</ActualText <FEFF...>>> BDC ... EMC
     pdf.js ignores ActualText, so its text items come out in visual order with subscripts lost. We lex the page's
     content stream ourselves, list every BDC in order, and (when the count matches pdf.js's marked-content items)
     replace the text inside each span with its ActualText. Only classic PDFs (objects not inside object streams,
     Flate or uncompressed content) are handled; anything else returns null and the plain text layer is used. */
  const latin1 = b => { let s = ""; for (let i = 0; i < b.length; i += 65536) s += String.fromCharCode.apply(null, b.subarray(i, i + 65536)); return s; };
  const WS = /\s/, DELIM = "()<>[]{}/%";
  function pdfString(raw, hex) {
    let bytes;
    if (hex) { const h = raw.replace(/[^0-9A-Fa-f]/g, ""); bytes = new Uint8Array(Math.ceil(h.length / 2)); for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt((h.substr(i, 2) + "0").slice(0, 2), 16); }
    else { const out = []; for (let i = 0; i < raw.length; i++) { let c = raw[i]; if (c !== "\\") { out.push(c.charCodeAt(0)); continue; } c = raw[++i];
        if (c === "n") out.push(10); else if (c === "r") out.push(13); else if (c === "t") out.push(9); else if (c === "b") out.push(8); else if (c === "f") out.push(12);
        else if (/[0-7]/.test(c)) { let o = c; while (o.length < 3 && /[0-7]/.test(raw[i + 1] || "")) o += raw[++i]; out.push(parseInt(o, 8) & 255); }
        else if (c === "\n") { } else if (c === "\r") { if (raw[i + 1] === "\n") i++; } else out.push(c.charCodeAt(0)); } bytes = Uint8Array.from(out); }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder("utf-8").decode(bytes.subarray(3));
    return latin1(bytes);
  }
  /** Minimal PDF object lexer/parser. parse(src, i) -> {v, end}; v is {name}, {ref}, {op}, string, number, array, Map(dict). */
  function parse(src, i) {
    const n = src.length;
    const skip = () => { for (;;) { while (i < n && WS.test(src[i])) i++; if (src[i] === "%") { while (i < n && src[i] !== "\n" && src[i] !== "\r") i++; } else break; } };
    const atom = () => { skip(); if (i >= n) return {v: undefined, end: i};
      const c = src[i];
      if (c === "/") { let j = i + 1; while (j < n && !WS.test(src[j]) && !DELIM.includes(src[j])) j++; let nm = src.slice(i + 1, j).replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); i = j; return {v: {name: nm}, end: i}; }
      if (c === "(") { let d = 1, j = i + 1; while (j < n && d) { const ch = src[j]; if (ch === "\\") j++; else if (ch === "(") d++; else if (ch === ")") d--; j++; } const raw = src.slice(i + 1, j - 1); i = j; return {v: pdfString(raw, false), end: i}; }
      if (c === "<") { if (src[i + 1] === "<") { i += 2; const m = new Map(); for (;;) { skip(); if (src[i] === ">" && src[i + 1] === ">") { i += 2; break; } if (i >= n) break; const k = atom().v; if (!k || !k.name) { continue; } const val = value(); m.set(k.name, val); } return {v: m, end: i}; }
        const j = src.indexOf(">", i + 1); const raw = src.slice(i + 1, j < 0 ? n : j); i = j < 0 ? n : j + 1; return {v: pdfString(raw, true), end: i}; }
      if (c === "[") { i++; const a = []; for (;;) { skip(); if (src[i] === "]") { i++; break; } if (i >= n) break; a.push(value()); } return {v: a, end: i}; }
      if (c === "]" || c === ">" || c === ")" || c === "{" || c === "}") { i++; return {v: {op: c}, end: i}; }
      let j = i; while (j < n && !WS.test(src[j]) && !DELIM.includes(src[j])) j++; const tok = src.slice(i, j); i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return {v: parseFloat(tok), end: i};
      return {v: {op: tok}, end: i}; };
    const value = () => { const a = atom(); if (typeof a.v === "number" && Number.isInteger(a.v) && a.v >= 0) { const save = i; const b = atom(); if (typeof b.v === "number" && Number.isInteger(b.v)) { const save2 = i; const r = atom(); if (r.v && r.v.op === "R") return {ref: a.v, gen: b.v}; i = save2; i = save; return a.v; } i = save; } return a.v; };
    const v = value(); return {v, end: i};
  }
  function objectAt(src, num, gen) { const re = new RegExp("(^|[^0-9])" + num + "\\s+" + gen + "\\s+obj\\b", "g"); const m = re.exec(src); if (!m) return null; const start = m.index + m[0].length; const {v, end} = parse(src, start); return {v, end}; }
  const deref = (src, v) => (v && v.ref !== undefined) ? (objectAt(src, v.ref, v.gen) || {}).v : v;
  async function inflate(bytes) { const ds = new DecompressionStream("deflate"); const w = ds.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function streamData(src, bytes, num, gen) {
    const o = objectAt(src, num, gen); if (!o || !(o.v instanceof Map)) return null; const dict = o.v;
    const kw = src.indexOf("stream", o.end); if (kw < 0 || kw - o.end > 8) return null; let start = kw + 6; if (src[start] === "\r") start++; if (src[start] === "\n") start++;
    let len = deref(src, dict.get("Length")); if (typeof len !== "number") { const e = src.indexOf("endstream", start); len = (e < 0 ? src.length : e) - start; }
    let data = bytes.subarray(start, start + len);
    let filter = dict.get("Filter"); if (Array.isArray(filter)) filter = filter.length === 1 ? filter[0] : filter.length === 0 ? null : {name: "?"};
    if (dict.get("DecodeParms")) return null;
    if (filter && filter.name === "FlateDecode") { try { data = await inflate(data); } catch { return null; } } else if (filter) return null;
    return data;
  }
  /** Ordered list of {tag, actual} for every BDC in the page's content, or null if the file can't be read this way. */
  async function pageMarks(doc, page) {
    try {
      const ref = page.ref; const bytes = doc.__bytes; if (!ref || !bytes) return null;
      const src = doc.__src || (doc.__src = latin1(bytes));
      const po = objectAt(src, ref.num, ref.gen); if (!po || !(po.v instanceof Map)) return null;
      let contents = deref(src, po.v.get("Contents")); if (!contents) return null; contents = Array.isArray(contents) ? contents : [po.v.get("Contents")];
      const parts = []; for (const c of contents) { if (!c || c.ref === undefined) return null; const d = await streamData(src, bytes, c.ref, c.gen); if (!d) return null; parts.push(latin1(d)); }
      const content = parts.join("\n");
      // named properties (/Span /P1 BDC) live in Resources/Properties
      let props = null; const res = deref(src, po.v.get("Resources")); if (res instanceof Map) { const pr = deref(src, res.get("Properties")); if (pr instanceof Map) props = pr; }
      const marks = []; const stack = []; let i = 0;
      while (i < content.length) { const {v, end} = parse(content, i); if (end <= i) break; i = end; if (v === undefined) break;
        if (v && v.op !== undefined) { if (v.op === "BDC") { const [tag, p] = stack.slice(-2); let dict = p instanceof Map ? p : (p && p.name && props ? deref(src, props.get(p.name)) : null);
            const at = dict instanceof Map ? dict.get("ActualText") : undefined; marks.push({tag: tag && tag.name, actual: typeof at === "string" ? at : null}); }
          stack.length = 0; }
        else { stack.push(v); if (stack.length > 32) stack.shift(); } }
      return marks;
    } catch (e) { console.warn("ActualText pass skipped", e); return null; }
  }
  /** Text items of a page with ActualText applied where available. -> {items, styles, fixed} */
  async function textItems(doc, page) {
    if (page.__items) return page.__items;
    const tc = await page.getTextContent({includeMarkedContent: true});
    const begins = tc.items.filter(it => it.type === "beginMarkedContentProps").length;
    let marks = begins ? await pageMarks(doc, page) : null;
    if (marks && marks.length !== begins) { console.warn(`ActualText: ${marks.length} BDC in content vs ${begins} in pdf.js, not applied`); marks = null; }
    const out = []; let k = 0, fixed = 0; const open = []; // stack of {actual, items}
    for (const it of tc.items) {
      if (it.type === "beginMarkedContentProps") { const m = marks ? marks[k] : null; k++; open.push({actual: m && m.actual, items: []}); continue; }
      if (it.type === "beginMarkedContent") { open.push({actual: null, items: []}); continue; }
      if (it.type === "endMarkedContent") { const sp = open.pop(); if (!sp) continue;
        if (sp.actual !== null && sp.actual !== undefined && sp.items.length) { const f = sp.items[0], l = sp.items[sp.items.length - 1];
          const x0 = Math.min(...sp.items.map(a => a.transform[4])), x1 = Math.max(...sp.items.map(a => a.transform[4] + (a.width || 0)));
          const raw = sp.items.map(a => a.str || "").join(""); // space glyphs inside the span are not part of its ActualText
          const merged = {str: (/^\s/.test(raw) ? " " : "") + sp.actual + (/\s$/.test(raw) ? " " : ""), transform: f.transform.slice(), width: Math.max(0, x1 - x0), height: Math.max(...sp.items.map(a => a.height || 0)), fontName: f.fontName, hasEOL: l.hasEOL}; merged.transform[4] = x0;
          fixed++; (open.length ? open[open.length - 1].items : out).push(merged); }
        else (open.length ? open[open.length - 1].items : out).push(...sp.items); continue; }
      if (it.type) continue;
      (open.length ? open[open.length - 1].items : out).push(it);
    }
    while (open.length) { const sp = open.pop(); (open.length ? open[open.length - 1].items : out).push(...sp.items); }
    return (page.__items = {items: out, styles: tc.styles, fixed});
  }
  /* Signs of a broken Khmer text layer: NULs (glyphs without a Unicode mapping) and dependent vowel signs that
     start a word (visual-order output). Ratio over the Khmer characters. */
  /* Legacy (pre-Unicode) Khmer fonts - Limon, ABC, Khek, Baidok ... - store Khmer as Latin code points that only look
     like Khmer when drawn with that font. Spotted by the font name, or by the letter pattern: capitals inside words
     and accented Latin-1 letters (µ á ú ñ Þ É) at a rate English never has. */
  const LEGACY_FONT_RE = /limon|abc[-_ ]?(text|zero|\d)|khek|baidok|cambo|phnom|kh\s?[srb]\s?\d|limonr|limons/i;
  function legacyLatin(text, fontName) {
    if (fontName && LEGACY_FONT_RE.test(fontName)) return true;
    const t = text.replace(/[^A-Za-z\u00C0-\u024F]/g, ""); if (t.length < 8 || KHMER.test(text)) return false;
    const inner = (text.match(/[a-z][A-Z]/g) || []).length, odd = (t.match(/[\u00C0-\u024F]/g) || []).length;
    return (inner + odd) / t.length > 0.07;
  }
  function brokenScore(text) { const kh = (text.match(/[\u1780-\u17FF]/g) || []).length; if (!kh) return 0;
    const nul = (text.match(/\u0000/g) || []).length, orphan = (text.match(/(^|[\s\u0000])[\u17B6-\u17D3]/gm) || []).length;
    const circles = (text.match(/\u25CC/g) || []).length;                                   // dotted circle = a sign that lost its base letter
    const latin1 = (text.match(/[\u1780-\u17FF][\u00C0-\u024F]|[\u00C0-\u024F][\u1780-\u17FF]/g) || []).length; // legacy-font leftovers ("Ä") inside Khmer words
    const coeng = (text.match(/\u17D2/g) || []).length, noCoeng = kh >= 300 && coeng === 0 ? 0.05 : 0;      // real Khmer text always has subscripts
    return (nul + orphan + circles + latin1) / kh + noCoeng; }

  /** Read the text layer of a page and group it into lines in canvas pixels. -> {lines, chars, usable} */
  async function textLayer(page, vp, doc) {
    const tc = await textItems(doc, page);
    const items = [];
    let chars = 0, bad = 0;
    for (const it of tc.items) {
      if (!it.str || !it.transform) continue;
      const [a, b, , , e, f] = it.transform, [x, y] = vp.convertToViewportPoint(e, f);
      if (Math.abs(b) > Math.abs(a) * 0.3) continue;                       // rotated text: leave it to OCR
      const fs = Math.max(2, (it.height || Math.hypot(a, b)) * vp.scale), w = Math.max(1, (it.width || 0) * vp.scale);
      const space = !it.str.trim();                                        // explicit space glyphs matter: Khmer gaps are narrow
      const text = space ? " " : cleanText(it.str); const plain = text.replace(/\s/g, ""); chars += plain.length; bad += (plain.match(GARBAGE) || []).length;
      items.push({x0: x, x1: x + w, base: y, fs, text, space, font: it.fontName});
    }
    items.sort((p, q) => p.base - q.base || p.x0 - q.x0);
    // cluster by baseline, then by horizontal adjacency (columns stay separate)
    const lines = [];
    for (const it of items) {
      let ln = null;
      for (let i = lines.length - 1; i >= 0 && lines[i].base > it.base - it.fs; i--) { const L = lines[i];
        if (Math.abs(L.base - it.base) <= 0.3 * Math.max(L.fs, it.fs) && it.x0 <= L.x1 + 2.5 * it.fs && it.x1 >= L.x0 - 2.5 * it.fs) { ln = L; break; } }
      if (it.space) { if (ln && !/\s$/.test(ln.text)) { ln.text += " "; ln.x1 = Math.max(ln.x1, it.x1); } continue; }
      if (!ln) { lines.push({x0: it.x0, x1: it.x1, base: it.base, fs: it.fs, text: it.text, fonts: {}}); ln = lines[lines.length - 1]; }
      else { const gap = it.x0 - ln.x1; let sep = "";
        if (gap > 0.22 * it.fs && !/\s$/.test(ln.text) && !/^\s/.test(it.text)) sep = (KHMER.test(ln.text.slice(-1)) && KHMER.test(it.text[0]) && gap < 0.6 * it.fs) ? "" : " ";
        ln.text += sep + it.text; ln.x0 = Math.min(ln.x0, it.x0); ln.x1 = Math.max(ln.x1, it.x1); ln.fs = Math.max(ln.fs, it.fs); ln.base = (ln.base + it.base) / 2; }
      ln.fonts[it.font] = (ln.fonts[it.font] || 0) + it.text.length;
    }
    const out = [];
    for (const L of lines) { const text = L.text.trim(); if (!text) continue;
      const kh = KHMER.test(text), y0 = L.base - L.fs * (kh ? 1.05 : 0.9), y1 = L.base + L.fs * (kh ? 0.45 : 0.3);
      const quad = [[L.x0, y0], [L.x1, y0], [L.x1, y1], [L.x0, y1]];
      const fontName = Object.entries(L.fonts).sort((p, q) => q[1] - p[1])[0]?.[0], st = fontName && tc.styles ? tc.styles[fontName] : null;
      const legacy = legacyLatin(text, st ? st.fontFamily : fontName);
      out.push({quad, bbox: [L.x0, y0, L.x1, y1], score: 1, text, confidence: 1, pdf_font: st ? st.fontFamily : null, font_px: +L.fs.toFixed(1), legacy}); }
    const all = out.map(l => l.text).join("\n"), broken = brokenScore(all);
    const legacyChars = out.filter(l => l.legacy).reduce((a, l) => a + l.text.length, 0), legacyFrac = legacyChars / Math.max(1, all.length);
    const usable = chars >= 40 && out.length >= 2 && bad / Math.max(1, chars) < 0.2 && broken < 0.03 && legacyFrac < 0.2;
    const reason = usable ? "" : chars < 40 ? "no text layer" : legacyFrac >= 0.2 ? "text layer uses a legacy Khmer font" : broken >= 0.03 ? "text layer is damaged" : "unreadable text layer";
    return {lines: out, chars, usable, broken: +broken.toFixed(3), legacy: +legacyFrac.toFixed(3), fixed: tc.fixed, reason};
  }

  /** Thumbnail of page 1 as a data URL, plus the page count. */
  async function peek(file, thumbSide = 240) {
    const doc = await open(file);
    try { const page = await doc.getPage(1), r = await render(page, thumbSide); return {pages: doc.numPages, thumb: r.canvas.toDataURL("image/jpeg", 0.8)}; }
    finally { await close(doc); }
  }

  /** Process one page: text layer if usable, else OCR. opts: {ocrLong, textLong, onStep, forceOcr}. -> page result */
  async function processPage(doc, n, opts = {}) {
    const step = (stage, msg, extra) => opts.onStep && opts.onStep(Object.assign({stage, msg}, extra || {}));
    const page = await doc.getPage(n);
    step("pdf", "reading the PDF text layer");
    const probe = opts.forceOcr ? {usable: false} : await textLayer(page, page.getViewport({scale: 1}), doc);
    if (probe.usable) {
      const t0 = performance.now(), img = await render(page, opts.textLong || 1600), tl = await textLayer(page, img.viewport, doc);
      step("structure", "paragraphs and reading order");
      const res = await T.fromLines(img, tl.lines, {source: "pdf-text", device: "browser:pdf-text", models: {}, timings: {pdf_text_ms: +(performance.now() - t0).toFixed(1)}});
      res.pdf_page = n; res.pdf_text = {broken: tl.broken, fixed: tl.fixed, chars: tl.chars}; return res;
    }
    if (!T.loaded()) throw new Error("models not loaded");
    const img = await render(page, opts.ocrLong || 2200);
    const res = await T.process(img.canvas, opts.onStep); res.source = "ocr"; res.pdf_page = n; res.pdf_text = {reason: opts.reason || probe.reason || "no text layer"}; return res;
  }

  T.pdf = {isPdf, open, close, render, textLayer, textItems, pageMarks, peek, processPage, lib: pdfjs};
})();
