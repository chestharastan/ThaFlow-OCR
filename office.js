/* ThaOCR Office: page tools for PDF files, in the browser (the UI is the Office page in app.js).
   window.ThaOffice = {config, lib(), locked(src), build(list, meta), zip(files), parseRanges(text, n), fmtRanges(nums)}
   A source is {bytes: Uint8Array of a PDF}; its parsed pdf-lib document is kept on it (src._lib) after first use.
   Pages are copied, not redrawn: text, fonts, images, links and each page's own rotation stay as they were. Only which
   pages, their order and an extra quarter turn change. pdf-lib (MIT) loads from jsDelivr on first use
   (ThaOffice.config.pdfLib); copy dist/pdf-lib.min.js to vendor/ and point it there for offline work. */
(function () {
  "use strict";
  const CFG = {pdfLib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"};
  let P = null, loading = null;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res;
      s.onerror = () => { s.remove(); rej(new Error("could not load the PDF library · check the connection")); }; document.head.appendChild(s); });
  }
  /** pdf-lib, loaded once */
  async function lib() {
    if (P) return P;
    if (!window.PDFLib) { if (!loading) loading = loadScript(CFG.pdfLib).finally(() => { loading = null; }); await loading; }
    if (!window.PDFLib) throw new Error("the PDF library did not start");
    return (P = window.PDFLib);
  }
  /** the pdf-lib document of a source, parsed once */
  function open(src) {
    if (!src._lib) src._lib = lib().then(L => L.PDFDocument.load(src.bytes, {updateMetadata: false})).catch(e => { src._lib = null; throw e; });
    return src._lib;
  }

  /** bytes contain the ASCII token (TypedArray.indexOf finds the first byte natively) */
  function hasToken(bytes, tok) {
    const t = Array.from(tok, c => c.charCodeAt(0)), m = t.length, last = bytes.length - m;
    for (let i = bytes.indexOf(t[0]); i >= 0 && i <= last; i = bytes.indexOf(t[0], i + 1)) {
      let k = 1; while (k < m && bytes[i + k] === t[k]) k++; if (k === m) return true; }
    return false;
  }
  /** true when the PDF is encrypted (an open password, or "protected" with permissions): its pages cannot be copied.
      /Encrypt sits in the trailer or the cross-reference stream dictionary, which are never compressed, so a byte search
      finds it; pdf-lib then confirms (a page could carry the word in an uncompressed stream). Other parse errors are
      left for build() to report. */
  async function locked(src) {
    if (!hasToken(src.bytes, "/Encrypt")) return false;
    try { await open(src); return false; } catch (e) { return /encrypt/i.test(String(e && e.message)); }
  }

  const turn = a => ((Math.round((+a || 0) / 90) * 90) % 360 + 360) % 360;
  /** list: [{src, i, rot}] (i = 0-based page of src, rot = extra clockwise degrees) -> Uint8Array of a new PDF */
  async function build(list, meta = {}) {
    if (!list.length) throw new Error("no pages");
    const L = await lib(), out = await L.PDFDocument.create(), at = new Array(list.length), bySrc = new Map();
    list.forEach((p, k) => { if (!bySrc.has(p.src)) bySrc.set(p.src, []); bySrc.get(p.src).push(k); });
    // one copyPages call per source: fonts and images shared by its pages are written once, not once per page
    for (const [src, ks] of bySrc) { const doc = await open(src), copied = await out.copyPages(doc, ks.map(k => list[k].i)); ks.forEach((k, j) => { at[k] = copied[j]; }); }
    list.forEach((p, k) => { const pg = out.addPage(at[k]); if (turn(p.rot)) pg.setRotation(L.degrees(turn(pg.getRotation().angle + turn(p.rot)))); });
    out.setProducer("ThaOCR"); out.setCreator("ThaOCR Office"); if (meta.title) out.setTitle(String(meta.title));
    return out.save();
  }

  /* ZIP (stored, no compression: PDFs are compressed already). Names are UTF-8 with flag bit 11 set, so Khmer file
     names unpack correctly. */
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
  /** files [{name, data: Uint8Array}] -> Blob of a .zip */
  function zip(files) {
    const enc = new TextEncoder(), head = [], dir = [], d = new Date();
    const time = d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1, date = (Math.max(1980, d.getFullYear()) - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate();
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      head.push(h, name, data); dir.push(c, name); off += 30 + name.length + data.length;
    }
    const size = dir.reduce((a, x) => a + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...head, ...dir, e], {type: "application/zip"});
  }

  /** "1-3, 5, 8-" on n pages (1-based; Khmer digits work too; "8-" runs to the end, "-3" starts at 1)
      -> [[1, 2, 3], [5], [8, ..., n]]. Throws an Error with a short message the page can show. */
  function parseRanges(text, n) {
    const s = String(text || "").replace(/[០-៩]/g, ch => String(ch.charCodeAt(0) - 0x17E0)).replace(/\s*[-–—~]\s*/g, "-").trim();
    if (!s) throw new Error("Type pages, for example 1-3, 5");
    const out = [];
    for (const part of s.split(/[\s,;]+/).filter(Boolean)) {
      let a, b; const m = /^(\d*)-(\d*)$/.exec(part);
      if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      else if (/^\d+$/.test(part)) a = b = +part;
      else throw new Error(`"${part}" is not a page number or a range`);
      const bad = [a, b].find(v => v < 1 || v > n);
      if (bad != null) throw new Error(n === 1 ? "There is only page 1" : `There is no page ${bad} · pages are 1-${n}`);
      if (a > b) throw new Error(`${a}-${b}: the first page is after the last`);
      out.push(Array.from({length: b - a + 1}, (_, k) => a + k));
    }
    return out;
  }
  /** [1, 2, 3, 5, 7, 8] -> "1-3, 5, 7-8" (runs of consecutive pages joined, order kept) */
  function fmtRanges(nums, sep = ", ") {
    const out = [];
    for (let k = 0; k < nums.length;) { let j = k; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++; out.push(j > k ? `${nums[k]}-${nums[j]}` : `${nums[k]}`); k = j + 1; }
    return out.join(sep);
  }

  window.ThaOffice = {config: CFG, lib, open, locked, build, zip, crc32, parseRanges, fmtRanges};
})();
