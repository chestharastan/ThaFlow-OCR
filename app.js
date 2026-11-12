/* ThaOCR — client-only app. Everything (models, OCR, storage) runs in this browser; there is no server.
   Views: scan (home) · process · review & export · documents · settings · help. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const fmtMs = v => v == null ? "–" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms";
const fmtSize = b => b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
const when = t => { const d = new Date(t), now = new Date(); const hm = d.toTimeString().slice(0, 5);
  if (d.toDateString() === now.toDateString()) return "Today, " + hm; const y = new Date(now - 864e5); if (d.toDateString() === y.toDateString()) return "Yesterday, " + hm;
  return d.toLocaleDateString(undefined, {month: "short", day: "numeric"}) + ", " + hm; };
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h10M7 12h8M7 16h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  upload: '<path d="M4 16.5A4.5 4.5 0 0 1 6.5 8a6 6 0 0 1 11.6 1.5A4 4 0 0 1 18 17.5"/><path d="M12 12v9M8.5 15.5 12 12l3.5 3.5"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  download: '<path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3M7 10l5 5 5-5M12 15V3"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  select: '<path d="M4 7V5a1 1 0 0 1 1-1h2M11 4h2M17 4h2a1 1 0 0 1 1 1v2M20 11v1M4 11v2M4 17v2a1 1 0 0 0 1 1h2M11 20h1"/><path d="m14 13 7 2.6-3.1 1.3-1.3 3.1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  'panel-right': '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  bold: '<path d="M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  "zoom-in": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  "zoom-out": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  fit: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9h8v6H8z"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM5 19l.7 1.8L7.5 21.5l-1.8.7L5 24l-.7-1.8-1.8-.7 1.8-.7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
};
const icon = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const LOW = 0.8;          // a line below this confidence needs review
const KHMER = /[ក-៿]/;
const CROP_CLASSES = new Set(["figure", "logo", "stamp", "photo", "qr_code", "barcode", "signature", "decoration", "checkbox", "formula"]);
const ROLE = {text: "Paragraph", title: "Title", section_header: "Section", list: "List", table: "Table", header: "Header", footer: "Footer", page_number: "Page number", caption: "Caption", footnote: "Footnote", handwriting: "Handwriting", form_field: "Form field", logo: "Logo", stamp: "Stamp", figure: "Figure", decoration: "Ornament", photo: "Photo", signature: "Signature", qr_code: "QR code", barcode: "Barcode"};
const HEAVY = new Set(["Khmer OS Muol", "Khmer OS Muol Light", "Khmer OS Muol Pali", "Khmer OS Bokor", "Khmer OS Metal Chrieng", "Koulen", "Dangrek", "Bayon", "Angkor", "Taprom"]);
const FONT_FILES = {"Khmer OS": ["KhmerOS.ttf"], "Khmer OS System": ["KhmerOSsys.ttf"], "Khmer OS Battambang": ["KhmerOSbattambang.ttf", "Battambang-Bold.ttf"], "Khmer OS Content": ["KhmerOScontent.ttf", "Content-Bold.ttf"], "Khmer OS Siemreap": ["KhmerOSsiemreap.ttf"], "Khmer OS Muol": ["KhmerOSmuol.ttf"], "Khmer OS Muol Light": ["KhmerOSmuollight.ttf"], "Khmer OS Muol Pali": ["KhmerOSmuolpali.ttf"], "Khmer OS Bokor": ["KhmerOSbokor.ttf"], "Khmer OS Metal Chrieng": ["KhmerOSmetalchrieng.ttf"], "Khmer OS Fasthand": ["KhmerOSfasthand.ttf"], "Khmer OS Freehand": ["KhmerOSfreehand.ttf"], "Noto Sans Khmer": ["NotoSansKhmer-Regular.ttf", "NotoSansKhmer-Bold.ttf"], "Noto Serif Khmer": ["NotoSerifKhmer-Regular.ttf", "NotoSerifKhmer-Bold.ttf"], "Khmer Digital": ["KhmerDigital-Regular.ttf", "KhmerDigital-Bold.ttf"], "Hanuman": ["Hanuman[wght].ttf"], "Kantumruy Pro": ["KantumruyPro[wght].ttf"], "Nokora": ["Nokora[wght].ttf"], "Odor Mean Chey": ["OdorMeanChey-Regular.ttf"], "Chenla": ["Chenla.ttf"], "Preahvihear": ["Preahvihear-Regular.ttf"], "Suwannaphum": ["Suwannaphum-Regular.ttf", "Suwannaphum-Bold.ttf"], "Koulen": ["Koulen-Regular.ttf"], "Dangrek": ["Dangrek-Regular.ttf"], "Bayon": ["Bayon-Regular.ttf"], "Angkor": ["Angkor-Regular.ttf"], "Taprom": ["Taprom-Regular.ttf"]};
const LATIN = {"Latin serif": '"Liberation Serif","Times New Roman",serif', "Latin sans": '"Liberation Sans",Arial,sans-serif'};


/* ---------------------------------------------------------------- store (IndexedDB via ThaOCR.db + settings in localStorage) */
const T = window.ThaOCR;
const store = {
  skey: "thaocr.settings.v1", docs: [], jobs: [],
  settings: {output: "docx", name: "Local user", models: {}, backend: "auto", tier: null, noticeSeen: false, longMin: null, longMax: null, rules: true},
  load() { try { Object.assign(this.settings, JSON.parse(localStorage.getItem(this.skey) || "{}")); } catch {} },
  save() { localStorage.setItem(this.skey, JSON.stringify(this.settings)); },
  async init() { this.load(); this.docs = await T.db.all(); for (const d of this.docs) d.image_url = await T.db.imageUrl(d.page_id); },
  async put(doc, blob) { const i = this.docs.findIndex(d => d.page_id === doc.page_id); const {image_url, ...rest} = doc; await T.db.put(rest, blob); if (blob) doc.image_url = await T.db.imageUrl(doc.page_id); if (i >= 0) this.docs[i] = doc; else this.docs.unshift(doc); },
  get(id) { return this.docs.find(d => d.page_id === id); },
  async del(id) { this.docs = this.docs.filter(d => d.page_id !== id); await T.db.del(id); },
  async clear() { this.docs = []; await T.db.clear(); },
};

function summarize(res, filename, jobId, fileSize) {
  const lines = res.blocks.flatMap(b => b.lines || []).filter(l => l.text);
  const conf = lines.length ? lines.reduce((a, l) => a + l.confidence, 0) / lines.length : 0;
  const {image_blob, canvas, ...result} = res;
  return {page_id: res.page_id, filename, job: jobId, size: fileSize || 0, image_url: "", width: res.width, height: res.height,
    created: Date.now(), lines: lines.length, chars: lines.reduce((a, l) => a + l.text.length, 0), avg_conf: conf,
    low: lines.filter(l => l.confidence < LOW).length, lang: lines.some(l => /[A-Za-z]{3,}/.test(l.text)) && lines.some(l => KHMER.test(l.text)) ? "Khmer + EN" : lines.some(l => KHMER.test(l.text)) ? "Khmer" : "English",
    models: res.models, timings: res.timings, result, status: "completed", reviewed: {}};
}
const docStatus = d => d.status === "failed" ? ["Failed", "bad"] : d.status === "processing" ? ["Processing", "ink"] : (d.low - Object.keys(d.reviewed || {}).length) > 0 ? ["Needs review", "warn"] : ["Completed", "ok"];

/* ---------------------------------------------------------------- device + models */
let DEVICE = null, RECO = null, LOADING = null;
async function deviceCheck() { DEVICE = await T.deviceInfo(); await T.loadManifestSafe(); RECO = T.recommend(DEVICE); return RECO; }
T.loadManifestSafe = async () => { if (T.manifest) return T.manifest; const r = await fetch(T.config.manifestBase + "models.json", {cache: "no-cache"}); T.manifest = await r.json(); return T.manifest; };
function chosenModels() { const base = RECO ? RECO.choice : (T.manifest ? T.manifest.defaults : {}); return Object.assign({}, base, store.settings.models || {}); }
function applyScale() { const sc = RECO ? RECO.scale : {longMin: 1600, longMax: 2200}; T.config.longMin = store.settings.longMin || sc.longMin; T.config.longMax = store.settings.longMax || sc.longMax; T.config.backend = store.settings.backend || "auto"; T.config.rules = store.settings.rules !== false; }
/** Load the chosen model set (once); onProgress(text, fraction) */
function ensureModels(onProgress) {
  if (LOADING) return LOADING;
  LOADING = (async () => {
    applyScale(); const choice = chosenModels(), plan = await T.downloadPlan(choice); let doneBytes = 0; const total = Math.max(1, plan.files.reduce((a, f) => a + f.size, 0));
    const cur = {};
    await T.load(choice, p => { cur[p.stage] = p.got; const got = Object.values(cur).reduce((a, b) => a + b, 0); onProgress && onProgress(`${p.fromCache ? "Loading" : "Downloading"} ${p.stage} model…`, Math.min(0.98, got / total)); });
    void doneBytes;
    if (!T.benchmarkStored() || T.benchmarkStored().backend !== T.backendUsed || T.benchmarkStored().models.rec !== T.active.rec) { onProgress && onProgress("Measuring speed on this device…", 0.99); await T.benchmark(); }
    onProgress && onProgress("Ready", 1); sidebar();
  })().catch(e => { LOADING = null; throw e; });
  return LOADING;
}
const loadedFonts = new Set();
function ensureFont(fam) { if (loadedFonts.has(fam) || !FONT_FILES[fam] || !window.FontFace) return; loadedFonts.add(fam);
  const files = FONT_FILES[fam]; files.forEach((f, i) => { const ff = new FontFace(fam, `url("fonts/${encodeURIComponent(f)}")`, {weight: files.length > 1 ? (i ? "700" : "400") : "100 900"});
    ff.load().then(x => { document.fonts.add(x); document.dispatchEvent(new Event("fontsready")); }).catch(() => {}); }); }
const lineFont = (b, l) => (l && l.font && l.font.confidence >= 0.5) ? l.font : (b.font || null);
function fontStack(b, l) { const f = lineFont(b, l), fam = f && f.family; if (!fam) return 'var(--khm)'; if (LATIN[fam]) return LATIN[fam]; ensureFont(fam); return `"${fam}",var(--khm)`; }
function fontScale(b, l) { if (!KHMER.test(l.text || "")) return 1; const f = lineFont(b, l); if (f && FONT_FILES[f.family]) return /^Noto/.test(f.family) ? 1.2 : 1; return 1.15; }

/* ---------------------------------------------------------------- drawing: original with boxes */
function drawOriginal(canvas, img, page, opts) {
  const S = Math.max(1, page.width / 1000), c = canvas.getContext("2d"), k = opts.scale && opts.scale < 1 ? opts.scale : 1;
  canvas.width = Math.max(1, Math.round(page.width * k)); canvas.height = Math.max(1, Math.round(page.height * k)); c.setTransform(k, 0, 0, k, 0, 0); c.drawImage(img, 0, 0, page.width, page.height);
  if (!opts.boxes) return;
  for (const b of page.blocks) {
    c.strokeStyle = b.color || "#111111"; c.lineWidth = 2 * S; c.setLineDash(CROP_CLASSES.has(b.cls) ? [6 * S, 4 * S] : []);
    c.strokeRect(b.box.x, b.box.y, b.box.width, b.box.height); c.setLineDash([]);
    if (opts.labels) { const tx = `${ROLE[b.cls] || b.cls} · ${Math.round(b.score * 100)}%`; c.font = `${12 * S}px Inter,system-ui`;
      const w = c.measureText(tx).width + 10 * S, h = 17 * S; c.fillStyle = b.color || "#111111"; c.fillRect(b.box.x, Math.max(0, b.box.y - h), w, h);
      c.fillStyle = "#fff"; c.fillText(tx, b.box.x + 5 * S, Math.max(12 * S, b.box.y - 5 * S)); }
    if (opts.lines) for (const l of b.lines || []) { c.strokeStyle = l.confidence < LOW ? "rgba(217,119,6,.95)" : "rgba(17,17,17,.45)"; c.lineWidth = 1.2 * S;
      c.strokeRect(l.box.x, l.box.y, l.box.width, l.box.height); if (l.confidence < LOW) { c.fillStyle = "rgba(217,119,6,.10)"; c.fillRect(l.box.x, l.box.y, l.box.width, l.box.height); } }
  }
}

/* ---------------------------------------------------------------- the rebuilt (editable) page */
function buildDocPage(doc, onEdit) {
  const page = doc.result, el = document.createElement("div"); el.className = "docpage"; el.style.width = page.width + "px"; el.style.height = page.height + "px";
  for (const b of page.blocks) {
    if (CROP_CLASSES.has(b.cls) || !(b.lines || []).length) {
      if (b.crop && b.crop.url) { const im = document.createElement("img"); im.className = "crop"; im.src = b.crop.url; im.style.cssText = `left:${b.box.x}px;top:${b.box.y}px;width:${b.box.width}px;height:${b.box.height}px`; el.appendChild(im); }
      continue;
    }
    for (const l of b.lines) {
      if (!l.text) continue;
      const lf = lineFont(b, l), heavy = !!(lf && HEAVY.has(lf.family));
      const px = (b.font_px ? b.font_px * fontScale(b, l) : l.box.height * 0.78);
      const d = document.createElement("div"); d.className = "ln" + (l.confidence < LOW && !(doc.reviewed || {})[lineKey(b, l)] ? " lo" : "") + (heavy ? " heavy" : "") + ((doc.reviewed || {})[lineKey(b, l)] ? " chg" : "");
      d.contentEditable = "true"; d.spellcheck = false; d.dataset.key = lineKey(b, l);
      const base = l.baseline != null ? l.baseline : l.box.y + l.box.height * 0.78;
      d.style.cssText = `left:${l.box.x}px;top:${base - px}px;font-size:${px}px;font-family:${fontStack(b, l)};color:${l.text_color || b.text_color || "#111"};${lf && lf.slant === "italic" ? "font-style:italic;" : ""}${(l.bold || (lf && lf.weight === "bold" && !(l.spans || []).length)) && !heavy ? "font-weight:700;" : ""}`;
      d.innerHTML = (l.spans && l.spans.length) ? l.spans.map(s => s.bold && !heavy ? `<b>${esc(s.text)}</b>` : esc(s.text)).join(" ") : esc(l.text);
      d.addEventListener("blur", () => { const t = d.innerText.replace(/\s+$/, ""); if (t !== l.text) onEdit(b, l, t); });
      el.appendChild(d);
      if (l.bullet && l.bullet_box) { const bb = l.bullet_box, ch = b.font_px ? b.font_px / 1.4 : l.box.height * 0.5, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, col = l.text_color || "#111", s = document.createElement("span"); s.className = "bu";
        if (l.bullet === "-") s.style.cssText = `left:${cx - ch * 0.22}px;top:${cy - Math.max(0.5, ch * 0.05)}px;width:${ch * 0.45}px;height:${Math.max(1, ch * 0.1)}px;background:${col}`;
        else s.style.cssText = `left:${cx - ch * 0.22}px;top:${cy - ch * 0.22}px;width:${ch * 0.44}px;height:${ch * 0.44}px;border:${Math.max(1, ch * 0.09)}px solid ${col};border-radius:50%`;
        el.appendChild(s); }
    }
  }
  // shrink a line that overflows its box (fonts differ from the print)
  requestAnimationFrame(() => fitLines(el, page));
  document.addEventListener("fontsready", () => fitLines(el, page));
  return el;
}
function fitLines(el, page) {
  const byKey = {}; for (const b of page.blocks) for (const l of b.lines || []) byKey[lineKey(b, l)] = l;
  for (const d of el.querySelectorAll(".ln")) { const l = byKey[d.dataset.key]; if (!l) continue; d.style.transform = ""; const w = d.offsetWidth, max = l.box.width * 1.06;
    if (w > max && w > 0) { d.style.transformOrigin = "left bottom"; d.style.transform = `scaleX(${(max / w).toFixed(3)})`; } }
}
const lineKey = (b, l) => `${b.id}:${l.reading_order}`;
function scaleToFit(wrapper, inner, pageW, pageH) { const k = Math.min(1, (wrapper.clientWidth - 2) / pageW); inner.style.transform = `scale(${k})`; inner.style.transformOrigin = "top left"; wrapper.style.height = pageH * k + "px"; }

/* ---------------------------------------------------------------- text output */
function blockTextMd(b) { if (b.table) return b.table.rows.map(r => r.cells.map(c => c.text || "").join("\t")).join("\n"); return (b.lines || []).filter(l => l.text).map(l => "\t".repeat(l.indent_level || 0) + (l.bullet ? l.bullet + " " : "") + l.text).join("\n"); }
function pageText(page) { return [...page.blocks].sort((a, b) => a.reading_order - b.reading_order).map(blockTextMd).filter(Boolean).join("\n\n"); }


/* ---------------------------------------------------------------- shell */
const view = $("#view");
let JOB = null;          // the job running in this tab
let pending = [];        // files waiting on the Scan page: [{file, url, w, h}]
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2400); }
function setSideCollapsed(c) {  // ChatGPT-style: full sidebar <-> icon rail, remembered in this browser
  $("#shell").classList.toggle("collapsed", c); localStorage.setItem("thaocr.sideCollapsed", c ? "1" : "0");
  const t = $("#sidetog"); t.title = (c ? "Open" : "Close") + " sidebar (Ctrl+Shift+S)"; t.setAttribute("aria-label", c ? "Open sidebar" : "Close sidebar"); t.setAttribute("aria-expanded", String(!c));
  setTimeout(() => window.dispatchEvent(new Event("resize")), 220);  // let the canvases / document view re-fit after the slide
}
function sidebar() {
  const r = location.hash.split("/")[1] || "scan";
  document.querySelectorAll(".nav").forEach(a => a.classList.toggle("cur", a.dataset.r === r || (r === "process" && a.dataset.r === "scan") || (r === "review" && a.dataset.r === "documents")));
  $("#n_docs").textContent = groups(store.docs).length || "";
  const running = JOB && JOB.status === "running";
  $("#running").classList.toggle("hide", !running || r === "process");
  if (running) { $("#running_pct").textContent = Math.round(JOB.done / JOB.total * 100) + "%"; }
  $("#dev").textContent = T.loaded() ? (T.backendUsed === "webgpu" ? "GPU" : "CPU") + " · models ready" : DEVICE ? `${DEVICE.threads} threads${DEVICE.webgpu ? " · WebGPU" : ""}` : "checking device…";
}
const docTitle = d => d.filename.replace(/\.[^.]+$/, "");
/* A multi-page PDF is one document made of several page records (one per page). Pages share a group key. */
const PAGE_RE = /^(.*) · page (\d+)$/;
function groupKey(d) { if (d.group) return d.group; const m = PAGE_RE.exec(d.filename); return m && d.job ? d.job + ":" + m[1] : d.page_id; }
function groupName(d) { if (d.group_name) return d.group_name; const m = PAGE_RE.exec(d.filename); return m ? m[1] : d.filename; }
function pageNo(d) { if (d.page_no) return d.page_no; const m = PAGE_RE.exec(d.filename); return m ? +m[2] : 1; }
function groupDocs(key) { return store.docs.filter(x => groupKey(x) === key).sort((a, b) => pageNo(a) - pageNo(b) || a.created - b.created); }
function groups(docs) { const seen = new Map(); for (const d of docs) { const k = groupKey(d); if (!seen.has(k)) seen.set(k, []); seen.get(k).push(d); } return [...seen.values()].map(g => g.sort((a, b) => pageNo(a) - pageNo(b) || a.created - b.created)); }
const groupTitle = g => groupName(g[0]).replace(/\.[^.]+$/, "");
function groupStatus(g) { if (g.some(d => d.status === "failed")) return ["Failed", "bad"]; if (g.some(d => d.status === "processing")) return ["Processing", "ink"]; return g.some(d => (d.low - Object.keys(d.reviewed || {}).length) > 0) ? ["Needs review", "warn"] : ["Completed", "ok"]; }
function groupConf(g) { const n = g.reduce((a, d) => a + d.lines, 0); return n ? g.reduce((a, d) => a + d.avg_conf * d.lines, 0) / n : 0; }
const groupText = g => g.length === 1 ? pageText(g[0].result) : g.map((d, i) => `----- page ${i + 1} -----\n\n` + pageText(d.result)).join("\n\n");
async function deleteGroup(g) { for (const d of g) await store.del(d.page_id); }
async function rerunGroup(g) { for (const d of g) await rerun(d, g.length > 1 ? `page ${pageNo(d)} of ${g.length}` : "", true); toast("done"); route(); }
const outputSel = (id, cur) => `<select id="${id}">${[["docx", "Word (.docx)"], ["txt", "Plain text"], ["json", "JSON"]].map(([k, t]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
const TIER_LABEL = {high: "Best quality", mid: "Balanced", low: "Light"};

/* ---------------------------------------------------------------- documents table (shared) */
function docsTable(docs) {
  const gs = groups(docs);
  if (!gs.length) return `<div class="empty">No documents yet. Scan a page to start.</div>`;
  return `<table class="tbl"><thead><tr><th>Document</th><th>Status</th><th>Confidence</th><th>Scanned</th><th></th></tr></thead><tbody>
  ${gs.map(g => { const d = g[0], [st, cls] = groupStatus(g), pc = Math.round(groupConf(g) * 1000) / 10, lines = g.reduce((a, x) => a + x.lines, 0), size = g.reduce((a, x) => a + (x.size || 0), 0), pdfText = g.filter(x => x.result && x.result.source === "pdf-text").length; return `<tr class="click" data-id="${d.page_id}" data-g="${esc(groupKey(d))}">
   <td><div class="doc"><div class="ic"><img src="${d.image_url}" alt=""></div><div><b>${esc(groupName(d))}</b><span>${g.length > 1 ? `${g.length} pages · ` : ""}${lines} lines · ${g.length > 1 ? "" : d.width + "×" + d.height}${size ? (g.length > 1 ? "" : " · ") + fmtSize(size) : ""}${pdfText ? ` · ${g.length > 1 && pdfText < g.length ? `${pdfText} page${pdfText === 1 ? "" : "s"} ` : ""}PDF text` : ""}</span></div></div></td>
   <td><span class="badge ${cls}"><span class="dot"></span>${st}</span></td>
   <td><span class="acc"><span class="bar"><i class="${pc >= 95 ? "ok" : "warn"}" style="width:${pc}%"></i></span><span class="mono">${pc.toFixed(1)}%</span></span></td>
   <td class="mut">${when(d.created)}</td>
   <td style="width:48px"><div class="rel"><button class="btn ghost sm more" data-id="${d.page_id}" title="More">${icon("more")}</button></div></td></tr>`; }).join("")}</tbody></table>`;
}
function wireDocsTable() {
  view.querySelectorAll("tr.click").forEach(tr => tr.onclick = e => { if (e.target.closest(".more") || e.target.closest(".menu")) return; location.hash = "#/review/" + tr.dataset.id; });
  view.querySelectorAll(".more").forEach(btn => btn.onclick = e => { e.stopPropagation(); closeMenus(); const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<button data-a="open">${icon("external")}Open</button><button data-a="docx">${icon("file")}Download Word</button><button data-a="pdf">${icon("file")}Download PDF</button><button data-a="txt">${icon("list")}Download text</button><hr><button data-a="rerun">${icon("refresh")}Run OCR again</button><button data-a="del" class="danger">${icon("trash")}Delete</button>`;
    btn.parentElement.appendChild(m); m.onclick = async ev => { const a = ev.target.closest("button")?.dataset.a, d = store.get(btn.dataset.id); closeMenus(); if (!d) return; const g = groupDocs(groupKey(d));
      if (a === "open") location.hash = "#/review/" + d.page_id; if (a === "rerun") await rerunGroup(g); if (a === "docx") exportDocx(g); if (a === "pdf") exportPdf(g); if (a === "txt") download(groupTitle(g) + ".txt", groupText(g), "text/plain;charset=utf-8");
      if (a === "del") { if (g.length > 1 && !confirm(`Delete this document and its ${g.length} pages?`)) return; await deleteGroup(g); route(); toast("deleted"); } }; });
}
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.remove()); }
document.addEventListener("click", e => { if (!e.target.closest(".menu") && !e.target.closest(".more") && !e.target.closest("#r_export")) closeMenus(); });

/* ---------------------------------------------------------------- scan (home) */
function pickFiles(cb, camera) { const inp = $("#fileinput"); if (camera) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture"); inp.value = ""; inp.onchange = () => cb([...inp.files]); inp.click(); }
function wireDrop(el, cb) { el.ondragover = e => { e.preventDefault(); el.classList.add("on"); }; el.ondragleave = () => el.classList.remove("on"); el.ondrop = e => { e.preventDefault(); el.classList.remove("on"); cb([...e.dataTransfer.files].filter(f => /^image\//.test(f.type) || /\.(tiff?)$/i.test(f.name) || T.pdf.isPdf(f))); }; }
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith("image/") || T.pdf.isPdf(x)); if (!f.length) return; if (location.hash.startsWith("#/select")) selAdd(f); else addAndShow(f); });
async function addFiles(files) {
  for (const f of files) {
    if (T.pdf.isPdf(f)) { const p = {file: f, url: "", w: 0, h: 0, pdf: {pages: 0, error: null}}; pending.push(p);
      try { const info = await T.pdf.peek(f); p.pdf.pages = info.pages; p.url = info.thumb; } catch (e) { console.warn(e); p.pdf.error = "Could not open this PDF"; }
      continue; }
    const url = URL.createObjectURL(f); const dims = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = url; });
    pending.push({file: f, url, w: dims[0], h: dims[1]}); }
}
async function addAndShow(files) { await addFiles(files); const was = location.hash; location.hash = "#/scan"; if (was === "#/scan") route(); }
function devicePanel() {
  if (!DEVICE || !RECO) return `<div class="card pad small mut">Checking what this device can do…</div>`;
  const b = T.benchmarkStored(), est = b ? T.estimate(b, 40) : null, tier = store.settings.tier || RECO.tier;
  const perf = est ? `about ${est} s per page` : T.loaded() ? "measuring…" : "measured after the models load";
  return `<div class="devpanel">
    <div><div class="k">Your device</div><div class="v">${DEVICE.threads} threads${DEVICE.memoryGB ? " · " + DEVICE.memoryGB + " GB" : ""}${DEVICE.mobile ? " · phone" : ""}</div><div class="s">${DEVICE.webgpu ? "WebGPU available" : "CPU only (WebAssembly)"}${DEVICE.threadsOK ? "" : " · single thread"}</div></div>
    <div><div class="k">Model set</div><div class="v">${TIER_LABEL[tier]}${tier !== RECO.tier ? " (manual)" : " (recommended)"}</div><div class="s" id="dl_line">${T.loaded() ? "models ready on this device" : "checking download size…"}</div></div>
    <div><div class="k">Speed</div><div class="v">${perf}</div><div class="s">for a typical 40-line page · updates after each scan</div></div></div>`;
}
async function fillDownloadLine() { const el = $("#dl_line"); if (!el || T.loaded()) return; try { const plan = await T.downloadPlan(chosenModels()); const dl = plan.bytes; el.textContent = dl > 0 ? `${T.fmtBytes(dl)} to download once${DEVICE.downlinkMbps ? ` (about ${Math.max(1, Math.round(dl * 8 / (DEVICE.downlinkMbps * 1e6)))} s on your connection)` : ""}` : "already on this device"; } catch { el.textContent = ""; } }
function renderScan() {
  const n = pending.length, lowres = pending.filter(p => p.w && p.w < 1000), recent = store.docs.slice(0, 5), b = T.benchmarkStored();
  const nPages = pending.reduce((a, p) => a + (p.pdf ? Math.max(1, p.pdf.pages) : 1), 0), hasPdf = pending.some(p => p.pdf);
  const est = b ? Math.max(2, Math.round(nPages * T.estimate(b, 40))) : null;
  view.innerHTML = `
  <div class="head"><div class="grow"><h1>Scan a document</h1><p>Drop a photo, a scan or a PDF. ThaOCR reads Khmer and English on this device and gives you editable text and a Word file. PDF pages that already contain text are taken as they are, without OCR.</p></div></div>
  ${devicePanel()}
  <div class="drop ${n ? "compact" : ""}" id="drop"><div class="ico">${icon("upload", "l")}</div><div class="grow"><b>${n ? "Add more files" : "Drop images or PDFs here"}</b><div class="small">JPG, PNG, WebP, TIFF, PDF · or paste with Ctrl+V · processed on this device only</div></div>
    <div class="acts"><button class="btn ${n ? "" : "p"}" id="s_browse">${icon("folder")}Choose files</button><button class="btn" id="s_cam">${icon("camera")}Camera</button></div></div>
  ${n ? `<div class="card">
    <div class="rowhead"><h2>${n} file${n === 1 ? "" : "s"} ready</h2><div class="grow"></div><button class="btn ghost sm" id="s_clear">Clear</button></div>
    <div class="flist">${pending.map((p, i) => `<div class="frow">${p.url ? `<img src="${p.url}" alt="">` : `<div class="fico">${icon("file")}</div>`}<div class="grow"><b title="${esc(p.file.name)}">${esc(p.file.name)}</b><span class="small mut">${fmtSize(p.file.size)}${p.pdf ? (p.pdf.pages ? ` · PDF · ${p.pdf.pages} page${p.pdf.pages === 1 ? "" : "s"}` : " · PDF") : (p.w ? " · " + p.w + "×" + p.h : "")}</span></div>
      ${p.pdf && p.pdf.error ? `<span class="badge bad"><span class="dot"></span>${esc(p.pdf.error)}</span>` : ""}${p.w && p.w < 1000 ? '<span class="badge warn"><span class="dot"></span>Low resolution</span>' : ""}<button class="x" data-i="${i}" title="Remove">${icon("x", "s")}</button></div>`).join("")}</div>
    ${lowres.length ? `<div class="note" style="margin:0 18px 14px">${icon("alert")}<div>${esc(lowres[0].file.name)} is only ${lowres[0].w} px wide${lowres.length > 1 ? ` (and ${lowres.length - 1} more)` : ""}. Small Khmer vowel signs may be missed. A closer photo or a 300 DPI scan reads better.</div></div>` : ""}
    <div class="startbar"><div class="opts"><label>Output ${outputSel("s_out", store.settings.output)}</label></div><div class="grow"></div>
      <span class="small mut">${hasPdf ? `${nPages} page${nPages === 1 ? "" : "s"} · ` : ""}${est ? `${hasPdf ? "up to " : "about "}${est} s on this device${hasPdf ? ", less for PDF pages with text" : ""}` : "time is measured on the first run"}</span><button class="btn p lg" id="s_start">Start OCR ${icon("arrow-right")}</button></div></div>` : ""}
  <div class="privacy">${icon("info")}<div><b>Your files stay here.</b> There is no server and no account: documents are kept only in this browser's storage on this device, and are lost if you clear site data or switch devices. Export what you want to keep.</div></div>
  ${recent.length ? `<div class="sec"><div class="rowhead" style="padding-left:0;padding-right:0"><h2>Recent</h2><div class="grow"></div><a href="#/documents">All documents ${icon("chevron-right", "s")}</a></div><div class="card">${docsTable(recent)}</div></div>` : ""}`;
  fillDownloadLine();
  wireDrop($("#drop"), async f => { await addFiles(f); renderScan(); });
  $("#s_browse").onclick = () => pickFiles(async f => { await addFiles(f); renderScan(); });
  $("#s_cam").onclick = () => pickFiles(async f => { await addFiles(f); renderScan(); }, true);
  if (n) {
    $("#s_clear").onclick = () => { pending = []; renderScan(); };
    view.querySelectorAll(".frow .x").forEach(b => b.onclick = () => { pending.splice(+b.dataset.i, 1); renderScan(); });
    $("#s_out").onchange = e => { store.settings.output = e.target.value; store.save(); };
    $("#s_start").onclick = startJob;
  }
  wireDocsTable();
}

/* ---------------------------------------------------------------- job runner */
function startJob() {
  const files = pending.splice(0).filter(p => !(p.pdf && p.pdf.error)); if (!files.length) return;
  const entries = files.map(p => ({name: p.file.name, url: p.url, size: p.file.size, status: "queued", page_id: null, error: null, src: p, pdf: p.pdf ? {page: 0, pages: p.pdf.pages} : null}));
  JOB = {id: Date.now().toString(36), name: files.length > 1 ? `${files.length} files` : files[0].file.name, files: entries, total: entries.length, done: 0, status: "running", started: Date.now(), results: [], load: {msg: "Preparing…", frac: 0}, step: null};
  location.hash = "#/process";
  (async () => {
    // expand PDFs into one entry per page (opened once per file, kept open while its pages run)
    const docs = new Map();
    for (let i = 0; i < JOB.files.length; i++) { const f = JOB.files[i]; if (!f.pdf) continue;
      try { JOB.load = {msg: `Opening ${f.name}…`, frac: 0}; renderIfProcess(); const doc = await T.pdf.open(f.src.file); docs.set(f.src, doc); const n = doc.numPages, base = f.name.replace(/\.pdf$/i, "");
        const pages = Array.from({length: n}, (_, k) => ({name: n > 1 ? `${base} · page ${k + 1}` : f.name, url: k === 0 ? f.url : "", size: k === 0 ? f.size : 0, status: "queued", page_id: null, error: null, src: f.src, pdf: {page: k + 1, pages: n}, grp: {key: JOB.id + ":" + i, name: f.name}}));
        JOB.files.splice(i, 1, ...pages); i += n - 1; }
      catch (e) { console.warn(e); f.status = "failed"; f.error = "Could not open this PDF: " + (e.message || e); } }
    JOB.total = JOB.files.length; JOB.name = JOB.files.length > 1 ? `${JOB.files.length} pages` : JOB.files[0].name;
    let modelsReady = T.loaded();
    const needModels = async () => { if (modelsReady) return; await ensureModels((msg, frac) => { JOB.load = {msg, frac}; renderIfProcess(); }); modelsReady = true; JOB.load = null; };
    // PDF text pages need no OCR, but the small font + structure models (6 MB) give them headings, lists and fonts
    const needLight = async () => { if (T.sessions.structure || modelsReady) return; try { JOB.load = {msg: "Loading the layout helper models…", frac: 0};
        await T.load({layout: null, textdet: null, rec: null, font: chosenModels().font, structure: chosenModels().structure}, p => { JOB.load = {msg: `Loading ${p.id}…`, frac: p.total ? p.got / p.total : 0}; renderIfProcess(); }); }
      catch (e) { console.warn("helper models skipped", e); } JOB.load = null; };
    // images always need the models: start loading them before the first image so PDF text pages don't wait
    if (!JOB.files.some(f => !f.pdf)) JOB.load = null;
    for (let i = 0; i < JOB.files.length; i++) {
      const f = JOB.files[i]; if (f.status === "failed") { JOB.done = i + 1; continue; } f.status = "running"; JOB.current = i; renderIfProcess();
      try { const t0 = performance.now(); let res;
        if (f.pdf) { const doc = docs.get(f.src); const page = await doc.getPage(f.pdf.page);
          const probe = await T.pdf.textLayer(page, page.getViewport({scale: 1}), doc); if (!probe.usable) JOB.step = {stage: "pdf", msg: probe.reason + " · using OCR"};
          if (!probe.usable) await needModels(); else await needLight();
          res = await T.pdf.processPage(doc, f.pdf.page, {forceOcr: !probe.usable, reason: probe.reason, onStep: s => { JOB.step = s; renderIfProcess(); }}); }
        else { await needModels(); res = await T.process(f.src.file, s => { JOB.step = s; renderIfProcess(); }); }
        res.client_ms = performance.now() - t0;
        const doc = summarize(res, f.name, JOB.id, f.size); if (f.grp) { doc.group = f.grp.key; doc.group_name = f.grp.name; doc.page_no = f.pdf.page; doc.page_count = f.pdf.pages; } await store.put(doc, res.image_blob); f.status = "done"; f.page_id = res.page_id; f.url = doc.image_url; JOB.results.push(doc.result); JOB.lastImage = doc.image_url;
        if (res.source !== "pdf-text") T.learn(res.timings.total_ms, res.timings.lines_recognized); }
      catch (e) { console.error(e); f.status = "failed"; f.error = String(e.message || e); }
      JOB.done = i + 1; JOB.step = null; renderIfProcess(); sidebar();
    }
    for (const d of docs.values()) await T.pdf.close(d);
    JOB.status = "done"; renderIfProcess(); sidebar();
    const first = JOB.files.find(x => x.page_id); if (first && location.hash === "#/process") setTimeout(() => { if (location.hash === "#/process") location.hash = "#/review/" + first.page_id; }, 1200);
  })();
}
function renderIfProcess() { if (location.hash === "#/process") renderProcess(); }
function renderProcess() {
  if (!JOB) { view.innerHTML = `<div class="head"><div class="grow"><h1>Processing</h1></div></div><div class="card empty">Nothing is running. <a href="#/scan">Scan a document</a>.</div>`; return; }
  const cur = JOB.files[Math.min(JOB.current ?? 0, JOB.files.length - 1)], last = JOB.results[JOB.results.length - 1], running = JOB.status === "running";
  const stepIdx = {pdf: 0, decode: 0, layout: 1, textdet: 2, rec: 3, font: 4, structure: 4, done: 5}; const si = JOB.step ? stepIdx[JOB.step.stage] : -1;
  const recFrac = JOB.step && JOB.step.stage === "rec" && JOB.step.total ? JOB.step.done / JOB.step.total : 0;
  const fileFrac = cur.status === "running" ? Math.min(0.95, (si < 0 ? 0 : si === 3 ? 0.35 + 0.5 * recFrac : si >= 4 ? 0.9 : si * 0.12)) : 0;
  const pct = JOB.load ? Math.round(JOB.load.frac * 100) : Math.round((JOB.done + (running ? fileFrac : 0)) / JOB.total * 100);
  const t = last ? last.timings : null, blocks = last ? last.blocks : [], n = cls => blocks.filter(b => b.cls === cls).length;
  const stepsHtml = [
    ["Read the file", last ? `${last.width}×${last.height} px` : "", si > 0 || !!last, null],
    ["Find regions", t ? `${blocks.length} regions · ${n("table")} table${n("table") === 1 ? "" : "s"} · ${n("stamp")} stamp${n("stamp") === 1 ? "" : "s"}` : "paragraphs, tables, stamps, logos", si > 1 || !!t, t && t.layout_ms],
    ["Find text lines", t ? `${t.lines_detected} lines` : "", si > 2 || !!t, t && t.textdet_ms],
    ["Read the text", t ? `Khmer + English · ${t.lines_recognized} lines` : (JOB.step && JOB.step.stage === "rec" && JOB.step.total ? `${JOB.step.done} of ${JOB.step.total} lines` : "Khmer + English"), si > 3 || !!t, t && t.rec_ms],
    ["Fonts, paragraphs, order", t ? `${t.structure === "model" ? "learned structure" : "rules"} · fonts per line` : "", si > 4 || !!t, t && ((t.font_ms || 0) + (t.structure_ms || 0))],
    ["Build the document", t ? "ready to review and export" : "", !!t, null]];
  const failed = JOB.files.filter(f => f.status === "failed");
  const b = T.benchmarkStored(), remaining = running ? (JOB.load ? "" : `about ${Math.max(1, Math.round((JOB.total - JOB.done - fileFrac) * (b ? T.estimate(b, 40) : 8)))} s left`) : `took ${fmtMs(Date.now() - JOB.started)}`;
  const headHtml = `<div class="grow"><h1>${JOB.load ? "Getting ready…" : running ? "Reading your document…" : "Done"}</h1><p>${esc(JOB.name)}${JOB.total > 1 ? ` · file ${Math.min(JOB.done + 1, JOB.total)} of ${JOB.total}` : ""} · on this device</p></div>
    ${running ? `<a class="btn" href="#/scan">Keep working, I'll wait</a>` : `<a class="btn p lg" href="#/review/${esc((JOB.files.find(x => x.page_id) || {}).page_id || "")}">Review results ${icon("arrow-right")}</a>`}`;
  const badgeCls = `badge ${running ? "ink" : "ok"}`, badgeTxt = JOB.load ? "Loading models" : running ? "Working" : "Finished";
  const msg = JOB.load ? JOB.load.msg : remaining;
  const note = JOB.load ? `First visit: the OCR models are downloaded once and kept in this browser. Later scans start immediately.` : "";
  const steps = stepsHtml.map(([tt, s, done, ms], i) => ({cls: `step ${done ? "done" : running && !JOB.load && i === Math.max(0, si) ? "run" : ""}`, done, tt, s, ms}));
  const stepHtml = (st, i) => `<div class="${st.cls}" data-i="${i}"><span class="n">${st.done ? icon("check", "s") : i + 1}</span><div class="grow"><b>${st.tt}</b><span class="sub">${esc(st.s || "")}</span></div><span class="ms mono">${st.ms != null ? fmtMs(st.ms) : ""}</span></div>`;
  const filesHtml = JOB.total > 1 ? `<div class="card pad">${JOB.files.map(f => `<div class="kv"><span style="color:var(--ink)">${esc(f.name)}</span><span class="badge ${f.status === "done" ? "ok" : f.status === "failed" ? "bad" : f.status === "running" ? "ink" : ""}">${f.status === "done" ? "Done" : f.status === "failed" ? "Failed" : f.status === "running" ? "Working" : "Waiting"}</span></div>`).join("")}</div>` : "";
  const failedHtml = failed.length ? `<div class="note">${icon("alert")}<div>${failed.map(f => `<b>${esc(f.name)}</b>: ${esc(f.error)}`).join("<br>")}</div></div>` : "";
  const overlay = !!(last && last.page_id === cur.page_id), imgSrc = overlay ? JOB.lastImage : cur.url;
  const scan = running && cur.status === "running" ? (JOB.load ? "scanline soft" : "scanline") : "";
  const key = `${JOB.id}|${imgSrc}|${overlay}`, phase = JOB.load ? "load" : "run";

  // Build the page only when the picture changes; otherwise patch the parts that changed in place, so the scan
  // line, spinners and progress bar keep animating instead of restarting on every progress callback.
  if (!PVIEW || PVIEW.key !== key || !$("#p_stage")) {
    view.innerHTML = `
  <div class="head" id="p_head">${headHtml}</div>
  <div class="grid g-main">
   <div class="card"><div class="panehead"><span style="color:var(--ink)" id="p_name">${esc(cur.name)}</span><div class="grow"></div><span class="${badgeCls}" id="p_badge"><span class="dot"></span><span class="t">${badgeTxt}</span></span></div>
    <div class="stage"><div class="pageimg" id="p_stage"><img id="p_img" src="${esc(imgSrc)}" alt="" style="display:block;max-width:100%;max-height:70vh"><canvas id="p_cv" class="hide"></canvas>${scan ? `<div class="${scan}"></div>` : ""}</div></div></div>
   <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card pad"><div style="display:flex;align-items:baseline;gap:14px"><div class="prog" id="p_pct">${pct}%</div><div class="mut small grow" style="text-align:right" id="p_msg">${esc(msg)}</div></div><div class="bar" style="height:8px;margin-top:12px"><i id="p_bar" style="width:${pct}%;transition:none"></i></div>
      <div class="small mut" id="p_note" style="margin-top:10px${note ? "" : ";display:none"}">${note}</div></div>
    <div class="card pad"><div class="pipe" id="p_steps">${steps.map(stepHtml).join("")}</div></div>
    <div id="p_files">${filesHtml}</div><div id="p_failed">${failedHtml}</div></div></div>`;
    const prev = PVIEW && PVIEW.id === JOB.id && PVIEW.phase === phase ? PVIEW.disp : pct;
    PVIEW = {key, id: JOB.id, phase, target: pct, disp: Math.min(prev, pct), running, html: {}};
    $("#p_pct").textContent = Math.round(PVIEW.disp) + "%"; $("#p_bar").style.width = PVIEW.disp + "%";
    if (overlay) { const img = $("#p_img"), cv = $("#p_cv"); img.onload = () => { drawOriginal(cv, img, last, {boxes: true, labels: false, lines: true}); cv.classList.remove("hide"); cv.style.maxWidth = "100%"; cv.style.maxHeight = "70vh"; cv.style.width = "auto"; img.classList.add("hide"); }; if (img.complete) img.onload(); }
    progressLoop();
    return;
  }
  const set = (id, html) => { if (PVIEW.html[id] !== html) { PVIEW.html[id] = html; $("#" + id).innerHTML = html; } };
  set("p_head", headHtml); set("p_files", filesHtml); set("p_failed", failedHtml);
  $("#p_name").textContent = cur.name;
  const bd = $("#p_badge"); if (bd.className !== badgeCls) bd.className = badgeCls; bd.querySelector(".t").textContent = badgeTxt;
  $("#p_msg").textContent = msg; const nt = $("#p_note"); nt.textContent = note; nt.style.display = note ? "" : "none";
  const stage = $("#p_stage"); let sl = stage.querySelector(".scanline");
  if (scan && !sl) { sl = document.createElement("div"); stage.appendChild(sl); }
  if (sl) { if (scan) sl.className = scan; else sl.remove(); }
  $("#p_steps").querySelectorAll(".step").forEach((el, i) => { const st = steps[i];
    if (el.className !== st.cls) { const wasDone = el.classList.contains("done"); el.className = st.cls; if (wasDone !== st.done) el.querySelector(".n").innerHTML = st.done ? icon("check", "s") : String(i + 1); }
    el.querySelector(".sub").textContent = st.s || ""; el.querySelector(".ms").textContent = st.ms != null ? fmtMs(st.ms) : ""; });
  if (PVIEW.phase !== phase) { PVIEW.phase = phase; PVIEW.disp = Math.min(PVIEW.disp, pct); } // new phase: the bar may start again from 0
  PVIEW.target = pct; PVIEW.running = running; progressLoop();
}
/** Eases the shown percentage toward the real one, and creeps forward slowly between progress callbacks so the
 *  bar never looks frozen during a long step (never more than a few % ahead of the real value, never 100 early). */
let PVIEW = null;
function progressLoop() {
  if (PVIEW && PVIEW.raf) return;
  let lastT = performance.now();
  const tick = now => {
    const pe = $("#p_pct"), be = $("#p_bar");
    if (!PVIEW || !pe || !be) { if (PVIEW) PVIEW.raf = 0; return; }
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const v = PVIEW, cap = v.running ? Math.min(99, v.target + 6) : v.target;
    if (v.disp < v.target) v.disp += Math.max(0.05, (v.target - v.disp) * Math.min(1, dt * 6)); // ease in
    else if (v.disp > v.target && !v.running) v.disp = v.target;
    else if (v.running && v.disp < cap) v.disp += dt * 0.8 * (1 - (v.disp - v.target) / 6); // creep, slowing down
    v.disp = Math.min(v.disp, Math.max(cap, v.target));
    const shown = Math.floor(v.disp);
    if (pe.textContent !== shown + "%") pe.textContent = shown + "%";
    be.style.width = v.disp.toFixed(2) + "%";
    if (!v.running && Math.abs(v.disp - v.target) < 0.01) { v.raf = 0; return; }
    v.raf = requestAnimationFrame(tick);
  };
  PVIEW.raf = requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------- review & export */
let REVIEW = {mode: "side", zoom: 1, boxes: true, labels: false, cur: null, pane: "document", side: localStorage.getItem("thaocr.reviewSide") !== "0"};
async function rerun(d, label, silent) { toast("running OCR" + (label ? " · " + label : "") + "…"); try { await ensureModels(); const blob = await T.db.imageBlob(d.page_id); if (!blob) throw new Error("page image missing"); const res = await T.process(blob); res.page_id = d.page_id; const nd = summarize(res, d.filename, d.job, d.size); nd.created = d.created; for (const k of ["group", "group_name", "page_no", "page_count"]) if (d[k] != null) nd[k] = d[k]; await store.put(nd, res.image_blob); if (!silent) { toast("done"); route(); } } catch (e) { toast("failed: " + e.message); } }
/* ---------------------------------------------------------------- full-size viewer */
function openLightbox(d, img, onClose) {
  if ($("#lightbox")) return;
  const page = d.result, el = document.createElement("div"); el.className = "lb"; el.id = "lightbox";
  el.innerHTML = `<div class="lb-bar"><b>${esc(docTitle(d))}</b><span class="mut">${page.width} × ${page.height} px</span><div class="grow"></div>
      <button class="tool" data-a="out" title="Zoom out (−)">${icon("zoom-out", "s")}</button><button class="tool pct mono" data-a="toggle" title="Switch fit / 100%"></button><button class="tool" data-a="in" title="Zoom in (+)">${icon("zoom-in", "s")}</button>
      <button class="tool" data-a="fit" title="Fit to screen (0)">${icon("fit", "s")}</button>
      <span class="opts"><label class="small"><input type="checkbox" data-a="boxes" ${REVIEW.boxes ? "checked" : ""}> boxes</label><label class="small"><input type="checkbox" data-a="labels" ${REVIEW.labels ? "checked" : ""}> labels</label></span>
      <button class="tool" data-a="tab" title="Open image in a new tab">${icon("external", "s")}</button><button class="tool" data-a="dl" title="Download image">${icon("download", "s")}</button><button class="tool" data-a="close" title="Close (Esc)">${icon("x", "s")}</button></div>
    <div class="lb-body"><canvas></canvas></div><div class="lb-hint">Scroll to pan · Ctrl + wheel or double-click to zoom · Esc to close</div>`;
  document.body.appendChild(el); document.body.style.overflow = "hidden";
  const body = $(".lb-body", el), cv = $("canvas", el), pct = $(".pct", el); let zoom = 0, fitZ = 1; // 0 = fit
  const fitScale = () => Math.min((body.clientWidth - 48) / page.width, (body.clientHeight - 48) / page.height, 1);
  const cur = () => zoom || fitZ;
  const paint = () => drawOriginal(cv, img, page, {boxes: REVIEW.boxes, labels: REVIEW.labels, lines: REVIEW.boxes});
  const layout = (center) => { fitZ = fitScale(); const z = cur(); const w = page.width * z, h = page.height * z;
    cv.style.width = w + "px"; cv.style.height = h + "px"; cv.style.cursor = z > fitZ ? "grab" : "zoom-in"; pct.textContent = zoom ? Math.round(z * 100) + "%" : "Fit";
    body.classList.toggle("big", w > body.clientWidth || h > body.clientHeight);
    if (center) { body.scrollLeft = (w - body.clientWidth) * center[0]; body.scrollTop = (h - body.clientHeight) * center[1]; } };
  const setZoom = (z, at) => { // keep the point under the cursor fixed when zooming
    const r = body.getBoundingClientRect(), px = at ? (at.x - r.left + body.scrollLeft) / (page.width * cur()) : .5, py = at ? (at.y - r.top + body.scrollTop) / (page.height * cur()) : .5;
    zoom = z; layout(); const w = page.width * cur(), h = page.height * cur();
    body.scrollLeft = at ? px * w - (at.x - r.left) : (w - body.clientWidth) / 2; body.scrollTop = at ? py * h - (at.y - r.top) : (h - body.clientHeight) / 2; };
  const steps = [.25, .5, .75, 1, 1.5, 2, 3, 4];
  const step = (dir, at) => { const z = cur(), next = dir > 0 ? steps.find(x => x > z + .01) : [...steps].reverse().find(x => x < z - .01); if (next) setZoom(next, at); };
  const close = () => { document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); el.remove(); document.body.style.overflow = ""; if (onClose) onClose(); };
  const onKey = e => { if (e.key === "Escape") close(); else if (e.key === "+" || e.key === "=") step(1); else if (e.key === "-") step(-1); else if (e.key === "0") setZoom(0); else if (e.key === "1") setZoom(1); else return; e.preventDefault(); };
  const onResize = () => layout();
  document.addEventListener("keydown", onKey); window.addEventListener("resize", onResize);
  el.querySelector(".lb-bar").onclick = e => { const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
    if (a === "in") step(1); if (a === "out") step(-1); if (a === "fit") setZoom(0); if (a === "toggle") setZoom(zoom ? 0 : 1); if (a === "close") close();
    if (a === "tab") window.open(d.image_url, "_blank"); if (a === "dl") { const x = document.createElement("a"); x.href = d.image_url; x.download = d.filename; x.click(); } };
  el.querySelectorAll("input[data-a]").forEach(i => i.onchange = () => { REVIEW[i.dataset.a] = i.checked; paint(); });
  body.onclick = e => { if (e.target === body) close(); };
  cv.ondblclick = e => setZoom(zoom && zoom >= 1 ? 0 : (zoom ? Math.min(4, zoom * 2) : 1), {x: e.clientX, y: e.clientY});
  body.onwheel = e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); step(e.deltaY < 0 ? 1 : -1, {x: e.clientX, y: e.clientY}); };
  let drag = null; // drag to pan when zoomed in
  cv.onpointerdown = e => { if (cur() <= fitZ) return; drag = {x: e.clientX, y: e.clientY, l: body.scrollLeft, t: body.scrollTop, moved: false}; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; };
  cv.onpointermove = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; body.scrollLeft = drag.l - dx; body.scrollTop = drag.t - dy; };
  cv.onpointerup = cv.onpointercancel = e => { if (drag) { cv.releasePointerCapture(e.pointerId); drag = null; cv.style.cursor = "grab"; } };
  const start = () => { paint(); layout([.5, 0]); }; if (img.complete && img.naturalWidth) start(); else img.addEventListener("load", start, {once: true});
}

function renderReview(id) {
  const d = store.get(id); REVIEW.cur = id; if (REVIEW.key) { document.removeEventListener("keydown", REVIEW.key); REVIEW.key = null; }
  if (!d) { view.innerHTML = `<div class="head"><div class="grow"><h1>Document</h1></div></div><div class="card empty">This document is no longer in this browser. <a href="#/documents">Back to documents</a></div>`; return; }
  // one document = all pages of the same file (a PDF), stacked in reading order; a photo is a one-page document
  const pages = groupDocs(groupKey(d)), multi = pages.length > 1, byId = Object.fromEntries(pages.map(s => [s.page_id, s]));
  const linesOf = s => s.result.blocks.flatMap(b => (b.lines || []).filter(l => l.text).map(l => ({b, l, d: s})));
  const lows = pages.flatMap(s => linesOf(s).filter(x => x.l.confidence < LOW && !(s.reviewed || {})[lineKey(x.b, x.l)])).sort((a, b) => a.l.confidence - b.l.confidence);
  const [st, cls] = groupStatus(pages), kinds = {};
  for (const s of pages) for (const b of s.result.blocks) kinds[b.cls] = (kinds[b.cls] || 0) + 1;
  const extras = Object.entries(kinds).filter(([k]) => ["table", "stamp", "logo", "figure", "handwriting"].includes(k)).map(([k, v]) => `${v} ${(ROLE[k] || k).toLowerCase()}${v > 1 ? "s" : ""}`).join(" · ");
  const hasDoc = !!(window.DocView && pages.some(s => s.result.document)), regions = pages.reduce((a, s) => a + s.result.blocks.length, 0), nLines = pages.reduce((a, s) => a + s.lines, 0), nChars = pages.reduce((a, s) => a + s.chars, 0), totalMs = pages.reduce((a, s) => a + (s.timings.total_ms || 0), 0);
  const fonts = [...new Set(pages.flatMap(s => s.result.blocks.map(b => b.font && b.font.family)).filter(Boolean))].slice(0, 3), pdfTextPages = pages.filter(s => s.result.source === "pdf-text").length, conf = groupConf(pages);
  const pageLabel = (s, i, ocr) => multi ? `<div class="pglabel">Page ${i + 1}${s.result.source === "pdf-text" ? " · PDF text" : ""}${ocr ? ` · <button class="linkbtn" data-ocr="${s.page_id}" title="Read this page again with OCR">${s.result.source === "pdf-text" ? "OCR this page" : "OCR again"}</button>` : ""}</div>` : "";
  const textOut = s => [...s.result.blocks].sort((a, b) => a.reading_order - b.reading_order).filter(b => (b.lines || []).some(l => l.text)).map(b => `<div class="blk ${b.align || ""}"><div class="lbl">${esc(ROLE[b.cls] || b.cls)}</div>${b.table ? esc(blockTextMd(b)) : b.lines.filter(l => l.text).map(l => "\t".repeat(l.indent_level || 0) + (l.bullet ? esc(l.bullet) + " " : "") + ((l.spans && l.spans.length) ? l.spans.map(sp => sp.bold ? `<b>${esc(sp.text)}</b>` : esc(sp.text)).join(" ") : (l.bold ? `<b>${esc(l.text)}</b>` : esc(l.text)))).join("\n")}</div>`).join("");
  const source = pdfTextPages === pages.length ? "PDF text layer · no OCR needed" : pdfTextPages ? `${pdfTextPages} of ${pages.length} pages from the PDF text, the rest by OCR` : (d.result.pdf_text && d.result.pdf_text.reason ? `OCR · PDF text not used (${esc(d.result.pdf_text.reason)})` : "");
  const doubtful = pages.filter(s => s.result.source === "pdf-text" && s.result.pdf_text && s.result.pdf_text.broken > 0.01);
  view.innerHTML = `
  <div class="head" style="align-items:center"><div class="grow"><h1 style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${esc(groupTitle(pages))} <span class="badge ${cls}"><span class="dot"></span>${st}</span></h1>
    <p>${multi ? pages.length + " pages · " : ""}${(conf * 100).toFixed(1)}% confidence · ${lows.length ? `<span style="color:var(--warn)">${lows.length} line${lows.length === 1 ? "" : "s"} to check</span>` : "nothing to check"} · <a href="#/documents">all documents</a></p></div>
    <div class="tools"><div class="seg" id="r_mode">${[["side", "Side by side"], ["text", "Text"], ["original", "Original"]].map(([k, t]) => `<button class="${REVIEW.mode === k ? "on" : ""}" data-m="${k}">${t}</button>`).join("")}</div>
    ${REVIEW.side ? "" : `<button class="btn" id="r_side_open" title="Show the check panel">${icon("panel-right")}Check lines${lows.length ? ` <span class="badge warn">${lows.length}</span>` : ""}</button>`}
    <button class="btn" id="r_ocr" title="${pdfTextPages ? "Ignore the PDF text and read the page images with OCR" : "Process the whole document again"}">${icon("refresh")}${pdfTextPages ? "Run OCR instead" : "Run OCR again"}</button>
    <button class="btn" id="r_copy">${icon("copy")}Copy text</button>
    <div class="rel"><button class="btn p" id="r_export">${icon("download")}Export ${icon("chevron-down", "s")}</button></div></div></div>
  <div class="card review ${REVIEW.mode === "side" ? "" : REVIEW.mode} ${multi ? "" : "one"} ${REVIEW.side ? "" : "noside"}">
   ${multi ? `<div class="thumbs">${pages.map((s, i) => `<div class="th ${s.page_id === id ? "cur" : ""}" data-id="${s.page_id}" title="Page ${i + 1}"><img src="${s.image_url}" alt="">${i + 1}</div>`).join("")}</div>` : ""}
   ${REVIEW.mode !== "text" ? `<div><div class="panehead"><span>Original</span><div class="grow"></div><button class="tool" id="r_zoomout" title="Zoom out">${icon("zoom-out", "s")}</button><span class="mono">${Math.round(REVIEW.zoom * 100)}%</span><button class="tool" id="r_zoomin" title="Zoom in">${icon("zoom-in", "s")}</button><button class="tool" id="r_full" title="Open full size (F)">${icon("expand", "s")}</button><span class="opts"><label class="small"><input type="checkbox" id="r_boxes" ${REVIEW.boxes ? "checked" : ""}> boxes</label><label class="small"><input type="checkbox" id="r_labels" ${REVIEW.labels ? "checked" : ""}> labels</label></span></div>
     <div class="panebody" id="r_orig">${pages.map((s, i) => `<div class="pagewrap" data-pid="${s.page_id}">${pageLabel(s, i, true)}<div class="view" data-pid="${s.page_id}" title="Click to open full size"><canvas data-pid="${s.page_id}"></canvas></div></div>`).join("")}</div></div>` : ""}
   ${REVIEW.mode === "side" ? `<div><div class="panehead"><div class="seg" id="r_pane">${hasDoc ? `<button class="${REVIEW.pane === "document" ? "on" : ""}" data-p="document">Document</button>` : ""}<button class="${REVIEW.pane === "overlay" || !hasDoc ? "on" : ""}" data-p="overlay">Overlay</button></div><div class="grow"></div><span class="mut">Click text to edit · <span id="r_saved">Saved</span></span></div><div class="panebody" id="r_docwrap">${pages.map((s, i) => `<div class="pagewrap" data-pid="${s.page_id}">${pageLabel(s, i)}<div class="pgbody" data-pid="${s.page_id}"></div></div>`).join("")}</div></div>` : ""}
   ${REVIEW.mode === "text" ? `<div><div class="panehead"><span>Text in reading order</span></div><div class="panebody white"><div class="textout" id="r_text">${pages.map((s, i) => (multi ? `<div class="lbl" style="margin:${i ? 28 : 0}px 0 10px;font:12px Inter,system-ui;color:var(--mut-2);letter-spacing:.06em;text-transform:uppercase">Page ${i + 1}</div>` : "") + textOut(s)).join("")}</div></div></div>` : ""}
   ${REVIEW.side ? `<div><div class="panehead"><b style="color:var(--ink)">Check these lines</b><div class="grow"></div><span class="badge ${lows.length ? "warn" : "ok"}">${lows.length}</span><button class="tool" id="r_side_close" title="Close panel">${icon("x", "s")}</button></div>
    <div class="panebody white" style="max-height:none">
     <div id="r_lows">${lows.length ? lows.slice(0, 12).map((x, i) => `<div class="rev ${i === 0 ? "cur" : ""}" data-key="${lineKey(x.b, x.l)}" data-pid="${x.d.page_id}"><div class="w"><span>${esc(x.l.text.length > 28 ? x.l.text.slice(0, 28) + "…" : x.l.text)}</span><span class="pc">${multi ? `p.${pageNo(x.d)} · ` : ""}${Math.round(x.l.confidence * 100)}%</span></div><div class="snip"><canvas data-key="${lineKey(x.b, x.l)}" data-pid="${x.d.page_id}"></canvas></div><input value="${esc(x.l.text)}"><div class="acts"><button class="btn p sm" data-a="accept">${icon("check", "s")}Accept</button><button class="btn sm" data-a="ignore">Ignore</button></div></div>`).join("") : `<div class="small mut" style="padding:8px 0 16px">Every line was read with good confidence.</div>`}</div>
     ${lows.length ? `<button class="btn" style="width:100%;margin-bottom:18px" id="r_acceptall">${icon("check-circle")}Accept all</button>` : ""}
     <h3 style="margin:4px 0 6px">About this ${multi ? "document" : "page"}</h3>
     ${multi ? `<div class="kv"><span>Pages</span><b>${pages.length}</b></div>` : ""}
     <div class="kv"><span>Content</span><b>${regions} regions${extras ? " · " + extras : ""}</b></div>
     <div class="kv"><span>Text</span><b>${nLines} lines · ${nChars} characters</b></div>
     <div class="kv"><span>Fonts</span><b>${esc(fonts.join(", ") || "–")}</b></div>
     ${source ? `<div class="kv"><span>Source</span><b>${source}</b></div>` : ""}
     ${doubtful.length ? `<div class="note" style="margin:8px 0">${icon("alert")}<div>The PDF's own text looks partly damaged on ${multi ? `page${doubtful.length > 1 ? "s" : ""} ${doubtful.map(s => pageNo(s)).join(", ")}` : "this page"}. If the text is wrong, use <b>Run OCR instead</b>.</div></div>` : ""}
     <div class="kv"><span>Time</span><b>${fmtMs(totalMs)} on this device</b></div>
     <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn sm" id="r_rerun" title="${pdfTextPages ? "Ignore the PDF text and read the page images with OCR" : "Process again"}">${icon("refresh")}${pdfTextPages ? "Run OCR instead" : "Run OCR again"}</button><button class="btn sm danger" id="r_del">${icon("trash")}Delete</button></div></div></div>` : ""}</div>`;
  view.querySelectorAll("#r_mode button").forEach(b => b.onclick = () => { REVIEW.mode = b.dataset.m; renderReview(id); });
  for (const [sel, on] of [["#r_side_close", false], ["#r_side_open", true]]) { const b = view.querySelector(sel); if (b) b.onclick = () => { REVIEW.side = on; localStorage.setItem("thaocr.reviewSide", on ? "1" : "0"); renderReview(id); }; }
  // page strip: scroll both panes to that page
  const scrollToPage = pid => { for (const el of view.querySelectorAll(`.pagewrap[data-pid="${pid}"]`)) el.scrollIntoView({block: "start", behavior: "smooth"}); view.querySelectorAll(".thumbs .th").forEach(t => t.classList.toggle("cur", t.dataset.id === pid)); REVIEW.cur = pid; };
  view.querySelectorAll(".thumbs .th").forEach(t => t.onclick = () => scrollToPage(t.dataset.id));
  const orig = $("#r_orig"); if (orig && multi && window.IntersectionObserver) { const io = new IntersectionObserver(es => { const top = es.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (top) view.querySelectorAll(".thumbs .th").forEach(t => t.classList.toggle("cur", t.dataset.id === top.target.dataset.pid)); }, {root: orig, threshold: [0.25, 0.5, 0.75]}); orig.querySelectorAll(".pagewrap").forEach(el => io.observe(el)); }
  $("#r_copy").onclick = () => navigator.clipboard.writeText(groupText(pages)).then(() => toast("text copied"));
  if ($("#r_rerun")) $("#r_rerun").onclick = () => rerunGroup(pages);
  $("#r_ocr").onclick = () => { if (!multi || confirm(`Run OCR on all ${pages.length} pages? This takes a while and replaces the current text.`)) rerunGroup(pages); };
  view.querySelectorAll("[data-ocr]").forEach(b => b.onclick = async e => { e.stopPropagation(); const s = byId[b.dataset.ocr]; b.disabled = true; b.textContent = "reading…"; await rerun(s, `page ${pageNo(s)}`, true); toast("done"); renderReview(id); setTimeout(() => { for (const el of view.querySelectorAll(`.pagewrap[data-pid="${s.page_id}"]`)) el.scrollIntoView({block: "start"}); }, 50); });
  if ($("#r_del")) $("#r_del").onclick = async () => { if (confirm(multi ? `Delete this document and its ${pages.length} pages from this browser?` : "Delete this document from this browser?")) { await deleteGroup(pages); location.hash = "#/documents"; toast("deleted"); } };
  $("#r_export").onclick = e => { e.stopPropagation(); closeMenus(); const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<button data-a="docx">${icon("file")}Word document (.docx)${multi ? ` · ${pages.length} pages` : ""}</button><button data-a="pdf">${icon("file")}PDF document (.pdf)${multi ? ` · ${pages.length} pages` : ""}</button><button data-a="txt">${icon("list")}Plain text (.txt)</button><button data-a="json">${icon("braces")}JSON (full result)</button><button data-a="png">${icon("image")}Page image${multi ? "s" : ""}</button>`;
    $("#r_export").parentElement.appendChild(m); m.onclick = ev => { const a = ev.target.closest("button")?.dataset.a; closeMenus(); const base = groupTitle(pages);
      if (a === "docx") exportDocx(pages); if (a === "pdf") exportPdf(pages); if (a === "txt") download(base + ".txt", groupText(pages), "text/plain;charset=utf-8");
      if (a === "json") download(base + ".json", JSON.stringify(multi ? pages.map(s => s.result) : d.result, null, 1), "application/json");
      if (a === "png") pages.forEach((s, i) => setTimeout(() => { const x = document.createElement("a"); x.href = s.image_url; x.download = multi ? `${base} page ${i + 1}.jpg` : s.filename; x.click(); }, i * 400)); }; };
  // page images + canvases
  const imgs = {}; for (const s of pages) { const im = new Image(); im.src = s.image_url; imgs[s.page_id] = im; }
  // Pages are painted only while near the viewport, at display resolution (a 100-page PDF must not hold 100 full
  // canvases in memory); the full-size view is the lightbox.
  const near = new Set(); let io = null;
  const sizeView = s => { const v = view.querySelector(`.view[data-pid="${s.page_id}"]`); if (!v) return 0; const page = s.result, w = Math.min(page.width, (v.parentElement.parentElement.clientWidth - 32)) * REVIEW.zoom; v.style.width = w + "px"; v.style.height = (w * page.height / page.width) + "px"; return w; };
  const paintPage = s => { const im = imgs[s.page_id], cv = view.querySelector(`canvas[data-pid="${s.page_id}"]`); if (!cv || !im || !im.complete || !im.naturalWidth) return; const page = s.result, w = sizeView(s);
    if (multi && !near.has(s.page_id)) { if (cv.width > 1) { cv.width = 1; cv.height = 1; } return; }
    const k = Math.min(1, (w * (window.devicePixelRatio || 1)) / page.width); drawOriginal(cv, im, page, {boxes: REVIEW.boxes, labels: REVIEW.labels, lines: REVIEW.boxes, scale: k}); cv.style.width = "100%"; cv.style.height = "100%"; };
  pages.forEach(sizeView);
  if (orig && multi && window.IntersectionObserver) { io = new IntersectionObserver(es => { for (const e of es) { const pid = e.target.dataset.pid; if (e.isIntersecting) near.add(pid); else near.delete(pid); paintPage(byId[pid]); } }, {root: orig, rootMargin: "150% 0px"}); orig.querySelectorAll(".view[data-pid]").forEach(el => io.observe(el)); }
  else pages.forEach(s => near.add(s.page_id));
  const paintSnips = () => { for (const c of view.querySelectorAll(".snip canvas")) { const s = byId[c.dataset.pid], im = imgs[c.dataset.pid]; if (!s || !im || !im.complete || !im.naturalWidth) continue; const page = s.result, [bid, lo] = c.dataset.key.split(":"); const b = page.blocks.find(x => x.id === bid), l = b && b.lines.find(x => String(x.reading_order) === lo); if (!l) continue;
      const pad = l.box.height * 0.3, sx = Math.max(0, l.box.x - pad), sy = Math.max(0, l.box.y - pad), sw = Math.min(page.width - sx, l.box.width + 2 * pad), sh = Math.min(page.height - sy, l.box.height + 2 * pad);
      c.width = Math.round(sw * 2); c.height = Math.round(sh * 2); c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height); } };
  const paintAll = () => { pages.forEach(paintPage); paintSnips(); };
  for (const s of pages) { const im = imgs[s.page_id]; const v = view.querySelector(`.view[data-pid="${s.page_id}"]`); if (!s.image_url && v) v.innerHTML = `<div class="small mut" style="padding:40px 20px;text-align:center">The page image is no longer in this browser's storage, so it cannot be shown. The text is still available.</div>`;
    im.onload = () => { paintPage(s); paintSnips(); }; if (im.complete && im.naturalWidth) im.onload(); }
  if ($("#r_zoomin")) { $("#r_zoomin").onclick = () => { REVIEW.zoom = Math.min(3, REVIEW.zoom + 0.25); renderReview(id); }; $("#r_zoomout").onclick = () => { REVIEW.zoom = Math.max(0.5, REVIEW.zoom - 0.25); renderReview(id); };
    $("#r_boxes").onchange = e => { REVIEW.boxes = e.target.checked; paintAll(); }; $("#r_labels").onchange = e => { REVIEW.labels = e.target.checked; paintAll(); };
    const full = pid => { const s = byId[pid] || byId[REVIEW.cur] || d; openLightbox(s, imgs[s.page_id], () => { if ($("#r_boxes")) { $("#r_boxes").checked = REVIEW.boxes; $("#r_labels").checked = REVIEW.labels; } paintAll(); }); };
    $("#r_full").onclick = () => full(REVIEW.cur); view.querySelectorAll(".view[data-pid]").forEach(v => v.onclick = () => full(v.dataset.pid));
    REVIEW.key = e => { if (e.key.toLowerCase() === "f" && !(e.target.closest && e.target.closest("input,textarea,[contenteditable]")) && !$("#lightbox")) full(REVIEW.cur); };
    document.addEventListener("keydown", REVIEW.key); }
  const wrap = $("#r_docwrap");
  if (wrap) {
    const avail = Math.max(320, wrap.clientWidth - 32), rendered = new Set();
    const renderPage = s => { if (rendered.has(s.page_id)) return; rendered.add(s.page_id); const body = wrap.querySelector(`.pgbody[data-pid="${s.page_id}"]`), page = s.result; if (!body) return; body.style.minHeight = "";
      if (REVIEW.pane === "document" && window.DocView && page.document) body.appendChild(DocView.render(page, {scale: Math.min(1, avail / page.width), editable: true, onEdit: (bid, orders, text) => applyParagraphEdit(s, bid, orders, text)}));
      else { const dp = buildDocPage(s, (b, l, text) => applyEdit(s, b, l, text)); body.appendChild(dp); const fit = () => scaleToFit(body, dp, page.width, page.height); fit(); window.addEventListener("resize", fit, {once: true}); } };
    if (multi && window.IntersectionObserver) { // placeholders keep the scroll height; a page is built when it comes near
      for (const s of pages) { const body = wrap.querySelector(`.pgbody[data-pid="${s.page_id}"]`); if (body) body.style.minHeight = (Math.min(1, avail / s.result.width) * s.result.height) + "px"; }
      const dio = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { renderPage(byId[e.target.dataset.pid]); dio.unobserve(e.target); } }, {root: wrap, rootMargin: "100% 0px"}); wrap.querySelectorAll(".pgbody").forEach(el => dio.observe(el)); }
    else pages.forEach(renderPage);
    view.querySelectorAll("#r_pane button").forEach(b => b.onclick = () => { REVIEW.pane = b.dataset.p; renderReview(id); });
  }
  view.querySelectorAll(".rev").forEach(card => { const key = card.dataset.key, s = byId[card.dataset.pid], page = s.result, [bid, lo] = key.split(":"), b = page.blocks.find(x => x.id === bid), l = b.lines.find(x => String(x.reading_order) === lo);
    card.onclick = e => { view.querySelectorAll(".rev").forEach(x => x.classList.remove("cur")); card.classList.add("cur"); const ln = view.querySelector(`.pgbody[data-pid="${s.page_id}"] .docpage .ln[data-key="${key}"]`); if (ln && !e.target.closest("button,input")) { ln.scrollIntoView({block: "center", behavior: "smooth"}); ln.focus(); } else if (multi && !e.target.closest("button,input")) scrollToPage(s.page_id); };
    card.querySelector('[data-a="accept"]').onclick = () => { applyEdit(s, b, l, card.querySelector("input").value); renderReview(id); };
    card.querySelector('[data-a="ignore"]').onclick = () => { s.reviewed = s.reviewed || {}; s.reviewed[key] = "ignored"; store.put(s); renderReview(id); }; });
  if ($("#r_acceptall")) $("#r_acceptall").onclick = () => { for (const x of lows) { x.d.reviewed = x.d.reviewed || {}; x.d.reviewed[lineKey(x.b, x.l)] = "accepted"; } for (const s of new Set(lows.map(x => x.d))) store.put(s); renderReview(id); toast("all lines accepted"); };
}
function applyParagraphEdit(d, blockId, orders, text) {
  const b = d.result.blocks.find(x => x.id === blockId); if (!b) return;
  const lines = orders.map(o => b.lines.find(l => l.reading_order === o)).filter(Boolean); if (!lines.length) return;
  lines.forEach((l, i) => { if (l.confidence_before == null) l.confidence_before = l.confidence; l.text = i ? "" : text; l.spans = []; l.confidence = Math.max(l.confidence, 0.99); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = "edited"; });
  b.text = blockTextMd(b);
  const para = (b.paragraphs || []).find(p => p.lines.join() === orders.join()); if (para) { para.text = text; para.runs = [{text, bold: false}]; }
  const de = (d.result.document || {elements: []}).elements; for (const e of de) { const items = e.type === "list" ? e.items : e.columns ? e.columns.flatMap(c => c.elements) : [e]; for (const it of items) if (it.block === blockId && (it.lines || []).join() === orders.join()) { it.text = text; it.runs = [{text, bold: false}]; it.low = false; } }
  recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
function applyEdit(d, b, l, text) {
  const changed = text !== l.text; if (changed && l.confidence_before == null) l.confidence_before = l.confidence; l.text = text; if (changed) { l.spans = []; l.confidence = Math.max(l.confidence, 0.99); }
  b.text = blockTextMd(b); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = changed ? "edited" : "accepted";
  recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
function recount(d) { const all = d.result.blocks.flatMap(x => x.lines || []).filter(x => x.text); d.chars = all.reduce((a, x) => a + x.text.length, 0); d.avg_conf = all.reduce((a, x) => a + x.confidence, 0) / Math.max(1, all.length); d.low = all.filter(x => x.confidence < LOW).length; }
function download(name, data, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------------------------------------------------------------- Word and PDF export: export.js (window.ThaExport) */
async function exportFile(kind, docs) {
  const label = kind === "pdf" ? "PDF" : "Word document"; toast(`building ${label}…`);
  try { await ThaExport[kind](docs, {title: docs.length > 1 ? groupTitle(docs) : docTitle(docs[0])}); toast(`downloaded .${kind}`); }
  catch (e) { console.error(e); toast("export failed: " + String(e.message || e).slice(0, 80)); }
}
const exportDocx = docs => exportFile("docx", docs), exportPdf = docs => exportFile("pdf", docs);

/* ---------------------------------------------------------------- documents / settings / help */
function renderDocuments() {
  const filter = q => store.docs.filter(d => !q || d.filename.toLowerCase().includes(q.toLowerCase()) || pageText(d.result).includes(q));
  view.innerHTML = `<div class="head"><div class="grow"><h1>Documents</h1><p>${groups(store.docs).length} document${groups(store.docs).length === 1 ? "" : "s"} kept in this browser, on this device only.</p></div>
    <label class="search">${icon("search", "s")}<input id="q" placeholder="Search by name or text"></label><a class="btn p" href="#/scan">${icon("plus")}Scan</a></div><div class="card" id="doclist">${docsTable(store.docs)}</div>
    <div class="privacy">${icon("info")}<div>These documents exist only in this browser. They are not backed up anywhere. Export the ones you need to keep.</div></div>`;
  wireDocsTable();
  $("#q").oninput = e => { $("#doclist").innerHTML = docsTable(filter(e.target.value.trim())); wireDocsTable(); };
}
async function renderSettings() {
  view.innerHTML = `<div class="head"><div class="grow"><h1>Settings</h1></div></div>`;
  await T.loadManifestSafe(); if (!RECO) await deviceCheck();
  const choice = chosenModels(), b = T.benchmarkStored(), tier = store.settings.tier || RECO.tier;
  const stage = (k, title, sub) => { const opts = T.modelsFor(k); return `<div class="field"><label>${title}</label><div class="sel"><select data-stage="${k}">${opts.map(m => `<option value="${esc(m.id)}" ${m.id === choice[k] ? "selected" : ""}>${esc(m.label || m.id)}${T.manifest.sizes && T.manifest.sizes[m.file] ? " · " + T.fmtBytes(T.manifest.sizes[m.file]) : ""}</option>`).join("")}</select></div><div class="small mut">${sub}</div></div>`; };
  const sr = await storageReport(); const bytes = Math.max(0, sr.usage - sr.models);
  view.innerHTML = `<div class="head"><div class="grow"><h1>Settings</h1><p>Models, device and local data. Everything here applies to this browser only.</p></div></div>
  <div class="grid g-main"><div style="display:flex;flex-direction:column;gap:16px">
   <div class="card pad"><h2 style="margin-bottom:4px">Your device</h2><div class="small mut" style="margin-bottom:14px">${DEVICE.threads} threads${DEVICE.memoryGB ? " · " + DEVICE.memoryGB + " GB memory" : ""} · ${DEVICE.webgpu ? "WebGPU" + (DEVICE.gpuName ? " (" + esc(DEVICE.gpuName) + ")" : "") : "no WebGPU"} · ${DEVICE.threadsOK ? "multi-thread" : "single-thread"} WebAssembly${DEVICE.mobile ? " · mobile" : ""}</div>
    <div class="small mut" style="margin-bottom:10px">${RECO.reasons.map(esc).join(" · ")}</div>
    <div class="field"><label>Model set</label><div class="tiers" id="s_tiers">${["high", "mid", "low"].map(t => `<div class="tier ${tier === t ? "on" : ""}" data-t="${t}"><b>${TIER_LABEL[t]}${RECO.tier === t ? " · recommended" : ""}</b>${t === "high" ? "fp32 recogniser v2.4, detector at 2200 px" : t === "mid" ? "int8 recogniser, detector at 1800 px" : "int8 recogniser and layout model, detector at 1300 px, for phones"}</div>`).join("")}</div></div>
    <div class="field"><label>Compute</label><div class="sel"><select id="s_backend"><option value="auto" ${store.settings.backend === "auto" ? "selected" : ""}>Automatic (GPU when available)</option><option value="webgpu" ${store.settings.backend === "webgpu" ? "selected" : ""}>WebGPU</option><option value="wasm" ${store.settings.backend === "wasm" ? "selected" : ""}>CPU (WebAssembly)</option></select></div></div>
    ${b ? `<div class="kv"><span>Measured speed</span><b>regions ${fmtMs(b.layoutMs)} · lines ${fmtMs(b.detMs)} · ${b.recMsPerLine.toFixed(0)} ms per text line · ${b.backend}</b></div><div class="kv"><span>Estimate</span><b>about ${T.estimate(b, 40)} s for a 40-line page</b></div>` : `<div class="small mut">Speed is measured when the models are first loaded.</div>`}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" id="s_bench">${icon("refresh")}Measure again</button><button class="btn sm" id="s_load">${icon("download")}Load models now</button></div></div>
   <div class="card pad"><h2 style="margin-bottom:12px">Models <span class="small mut" style="font-weight:400">(overrides the model set)</span></h2>
    ${stage("layout", "Layout", "Finds paragraphs, titles, tables, stamps, logos and handwriting.")}${stage("textdet", "Text lines", "Finds each line of text.")}${stage("rec", "Text recogniser", "Reads Khmer and English. int8 = smaller and faster, fp32 = slightly more accurate.")}${stage("font", "Font classifier", "Typeface, weight, slant and size per line.")}${stage("structure", "Structure", "Paragraphs, roles and reading order.")}
    <button class="btn sm ghost" id="s_reset">Back to the recommended set</button></div>
   <div class="card pad"><h2 style="margin-bottom:12px">Preferences</h2>
    <div class="field"><label>Your name</label><div class="sel"><input id="s_name" value="${esc(store.settings.name)}"></div></div>
    <div class="field"><label>Default export</label><div class="sel">${outputSel("s_out", store.settings.output)}</div></div>
    <div class="field"><label>Page analysis</label><div class="sel"><select id="s_rules"><option value="rules" ${store.settings.rules !== false ? "selected" : ""}>Models + layout rules (recommended: paragraphs, label columns, tables from alignment, reading order)</option><option value="model" ${store.settings.rules === false ? "selected" : ""}>Models only (layout + structure model decide grouping and order)</option></select></div><div class="small mut">Applies to the next scan. "Run OCR again" on a document re-reads it with the current choice.</div></div></div></div>
   <div style="display:flex;flex-direction:column;gap:16px"><div class="card pad"><h3>Space used in this browser</h3><p class="small mut" style="margin:8px 0 12px">Everything ThaOCR keeps lives in this browser, on this device. There is no server copy.</p>
     <div class="kv"><span>Documents and page images</span><b>${store.docs.length} document${store.docs.length === 1 ? "" : "s"} · ${fmtSize(bytes)}</b></div>
     <div class="kv"><span>Downloaded models</span><b>${sr.modelFiles ? `${sr.modelFiles} file${sr.modelFiles === 1 ? "" : "s"} · ${fmtSize(sr.models)}` : "none"}</b></div>
     <div class="kv"><span>Total for this site</span><b>${sr.usage ? `${fmtSize(sr.usage)}${sr.quota ? ` of ${fmtSize(sr.quota)} available` : ""}` : "unknown"}</b></div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" id="s_clear">Delete all documents</button><button class="btn" id="s_cache">Remove cached models</button></div></div>
   <div class="card pad"><h3>Improve the models</h3><p class="small mut" style="margin:8px 0 12px">Every line you correct in a review is a training example. Export them as line images with the right text and send the file to the ThaOCR maintainer, or use it with the training scripts, to retrain the recogniser on your kind of documents. Nothing is sent automatically.</p><button class="btn" id="s_corr">${icon("download")}Export corrected lines (${correctedLines().length})</button></div>
   <div class="card pad" style="border-color:#f3c7c7"><h3>Reset everything</h3><p class="small mut" style="margin:8px 0 12px">Removes all documents, page images, edits, downloaded models, the device measurement and your settings, so this site takes no space in your browser. The page then starts over as on a first visit. Models download again when you next scan.</p><button class="btn danger" id="s_wipe">${icon("trash")}Reset everything</button></div></div></div>`;
  $("#s_out").onchange = e => { store.settings.output = e.target.value; store.save(); };
  $("#s_rules").onchange = e => { store.settings.rules = e.target.value === "rules"; store.save(); applyScale(); toast(store.settings.rules ? "rules on for the next scan" : "models only for the next scan"); };
  $("#s_name").onchange = e => { store.settings.name = e.target.value.trim() || "Local user"; store.save(); };
  $("#s_backend").onchange = e => { store.settings.backend = e.target.value; store.save(); resetModels(); renderSettings(); };
  view.querySelectorAll("#s_tiers .tier").forEach(t => t.onclick = () => { store.settings.tier = t.dataset.t === RECO.tier ? null : t.dataset.t; store.settings.models = {}; const fake = T.recommend(Object.assign({}, DEVICE, {webgpu: t.dataset.t === "high", mobile: t.dataset.t === "low", threads: t.dataset.t === "high" ? 8 : t.dataset.t === "low" ? 4 : 6, memoryGB: t.dataset.t === "low" ? 4 : 8})); RECO = Object.assign({}, RECO, {choice: fake.choice, scale: fake.scale}); store.settings.longMin = null; store.settings.longMax = null; store.save(); resetModels(); renderSettings(); });
  view.querySelectorAll("select[data-stage]").forEach(sel => sel.onchange = () => { store.settings.models = Object.assign({}, store.settings.models, {[sel.dataset.stage]: sel.value}); store.save(); resetModels(); toast("model changed; it loads on the next scan"); });
  $("#s_reset").onclick = () => { store.settings.models = {}; store.settings.tier = null; store.save(); resetModels(); deviceCheck().then(renderSettings); };
  $("#s_bench").onclick = async () => { toast("measuring…"); try { await ensureModels(); await T.benchmark(); renderSettings(); toast("done"); } catch (e) { toast("failed: " + e.message); } };
  $("#s_load").onclick = async () => { try { await ensureModels((m) => toast(m)); renderSettings(); } catch (e) { toast("failed: " + e.message); } };
  $("#s_clear").onclick = async () => { if (confirm("Remove all documents from this browser? This cannot be undone.")) { await store.clear(); sidebar(); renderSettings(); } };
  $("#s_cache").onclick = async () => { await T.clearModelCache(); localStorage.removeItem("thaocr.device.v1"); resetModels(); toast("cached models removed"); renderSettings(); };
  $("#s_corr").onclick = exportCorrections;
  $("#s_wipe").onclick = async () => {
    if (!confirm("Reset ThaOCR in this browser?\n\nAll documents, page images, edits, downloaded models and settings on this device will be removed. Export anything you want to keep first.\n\nThis cannot be undone.")) return;
    const b = $("#s_wipe"); b.disabled = true; b.textContent = "Resetting…";
    try { const before = await resetEverything();
      sessionStorage.setItem("thaocr.resetMsg", before.usage ? `Reset done · ${fmtSize(before.usage)} removed from this browser` : "Reset done"); }
    catch (e) { console.error(e); toast("reset failed: " + e.message); b.disabled = false; return; }
    location.hash = "#/scan"; location.reload(); };
}
/* ---------------------------------------------------------------- corrections -> training data */
function correctedLines() { const out = []; for (const d of store.docs) for (const b of d.result.blocks) for (const l of (b.lines || [])) { const k = lineKey(b, l); if ((d.reviewed || {})[k] === "edited" && l.text) out.push({d, b, l}); } return out; }
async function exportCorrections() {
  const items = correctedLines(); if (!items.length) { toast("no edited lines yet"); return; }
  toast(`packing ${items.length} corrected line${items.length === 1 ? "" : "s"}…`);
  const imgs = new Map(), rows = [];
  for (const {d, b, l} of items) {
    let im = imgs.get(d.page_id); if (!im) { im = new Image(); im.src = d.image_url; try { await im.decode(); } catch { continue; } imgs.set(d.page_id, im); }
    const pad = l.box.height * 0.25, sx = Math.max(0, l.box.x - pad), sy = Math.max(0, l.box.y - pad * 0.5), sw = Math.min(d.width - sx, l.box.width + 2 * pad), sh = Math.min(d.height - sy, l.box.height + pad);
    const c = document.createElement("canvas"); c.width = Math.round(sw); c.height = Math.round(sh); c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
    rows.push({text: l.text, image_png_base64: c.toDataURL("image/png").split(",")[1], width: c.width, height: c.height, source: d.result.source || "ocr", block: b.cls, confidence_before: l.confidence_before ?? null, document: groupName(d), page: pageNo(d), page_id: d.page_id, line: l.reading_order});
  }
  const meta = {format: "thaocr-corrections/1", exported: new Date().toISOString(), lines: rows.length, note: "Each item is a line crop (PNG) with the text as corrected by the user. Grey-scale, height-normalise to 48 px and train the CRNN with training/rec."};
  download(`thaocr-corrections-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({meta, items: rows}), "application/json"); toast(`exported ${rows.length} lines`);
}

/* ---------------------------------------------------------------- storage footprint + full reset */
async function storageReport() {
  const r = {docs: store.docs.reduce((a, d) => a + (d.size || 0), 0), models: 0, modelFiles: 0, usage: 0, quota: 0};
  try { const est = await navigator.storage.estimate(); r.usage = est.usage || 0; r.quota = est.quota || 0; } catch { }
  try { const c = await caches.open("thaocr-models-v1"); for (const k of await c.keys()) { const m = await c.match(k); if (!m) continue; r.modelFiles++; const cl = +(m.headers.get("content-length") || 0); r.models += cl || (await m.blob()).size; } } catch { }
  return r;
}
async function resetEverything() {
  const before = await storageReport();
  try { await store.clear(); } catch (e) { console.warn(e); }
  try { await T.db.close(); await new Promise(res => { const q = indexedDB.deleteDatabase("thaocr"); q.onsuccess = q.onerror = q.onblocked = () => res(); setTimeout(res, 3000); }); } catch (e) { console.warn(e); }
  try { for (const k of await caches.keys()) if (k.startsWith("thaocr")) await caches.delete(k); } catch (e) { console.warn(e); }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("thaocr")) localStorage.removeItem(k); } catch (e) { console.warn(e); }
  try { sessionStorage.clear(); } catch { }
  resetModels();
  return before;
}
function resetModels() { LOADING = null; for (const k of Object.keys(T.sessions)) { try { T.sessions[k].sess.release && T.sessions[k].sess.release(); } catch {} delete T.sessions[k]; } T.active = {}; sidebar(); }
function renderHelp() {
  view.innerHTML = `<div class="head"><div class="grow"><h1>Help</h1><p>How ThaOCR works and how to get the best results.</p></div></div>
  <div class="card pad help"><h3>Where your files go</h3><p>Nowhere. The page downloads the ONNX runtime from the jsDelivr CDN and the OCR models (about 40 MB) from Hugging Face once, and runs them inside your browser with WebAssembly or WebGPU. Photos, text and edits never leave your device. There is no account and no server-side copy: documents live in this browser's storage and disappear if you clear site data, use a private window or change device. Export what you want to keep.</p>
  <h3>PDF files</h3><p>Drop a PDF and each page becomes a document. If a page already contains text (a PDF made from Word, a website, or a scanner with its own OCR layer), that text is used directly and nothing is recognised, so it is exact and takes well under a second. Pages that are only pictures are read with OCR like a photo. The two kinds can be mixed in one file. If the text layer of a page is wrong, open the page and use <b>Run OCR instead</b>.</p>
  <h3>Speed</h3><p>The first visit downloads the models and measures your device, then shows an estimate per page. A laptop takes a few seconds per page; a phone can take half a minute. Smaller photos process faster. Settings lets you pick a lighter model set or force CPU or GPU.</p>
  <h3>Scanning</h3><p>Photograph or scan pages flat and evenly lit, at 300 DPI or at least about 1500 px wide for an A4 page. Khmer subscripts and vowel signs are small; below 1000 px they start to be missed.</p>
  <h3>What is read</h3><p>Paragraphs, titles, headers, footers, tables, lists, logos, stamps, signatures and handwriting regions; Khmer and English text; list markers, paragraphs and reading order; the font family, weight, slant and size of each line.</p>
  <h3>Checking the result</h3><p>Lines read below ${Math.round(LOW * 100)}% confidence are listed on the right of the review page and highlighted in the page. Click any text to edit it in place. Accept keeps the text, Ignore hides the warning.</p>
  <h3>Export</h3><p>Word (.docx) keeps headings, paragraphs, alignment, indents, bullets, fonts and sizes, and places logos and stamps as pictures. Plain text keeps tabs for indents. JSON is the full result.</p>
  <h3>Shortcuts</h3><p><kbd>Ctrl</kbd>+<kbd>V</kbd> pastes an image into the Scan page.</p></div>`;
}


/* ---------------------------------------------------------------- select: drag a box, read just that part, copy it */
// Files live only in this tab (nothing is saved). Text lines are detected once per image; each box then reads
// only the lines it covers (lines cut by the box are cut too), so a box is read in well under a second.
const SEL = {files: [], cur: -1, autoCopy: localStorage.getItem("thaocr.selAutoCopy") === "1"};
async function selAdd(list) {
  const add = [];
  for (const f of list) {
    if (T.pdf.isPdf(f)) { try { const doc = await T.pdf.open(f), n = doc.numPages, base = f.name.replace(/\.pdf$/i, "");
        for (let k = 1; k <= n; k++) add.push({name: n > 1 ? `${base} · page ${k}` : f.name, pdf: {doc, k, last: k === n}}); }
      catch (e) { toast("could not open " + f.name); } }
    else if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|bmp|gif|tiff?)$/i.test(f.name)) add.push({name: f.name, file: f});
  }
  if (!add.length) return;
  for (const e of add) Object.assign(e, {id: Math.random().toString(36).slice(2), boxes: [], img: null, lines: null, thumb: null});
  SEL.files.push(...add); if (SEL.cur < 0 || location.hash !== "#/select") SEL.cur = SEL.files.length - add.length;
  if (location.hash !== "#/select") location.hash = "#/select"; else renderSelect();
}
async function selImage(f) {  // -> {canvas,width,height}, decoded once
  if (f.img) return f.img;
  if (!f.imgP) f.imgP = (async () => { const im = f.pdf ? await T.pdf.render(await f.pdf.doc.getPage(f.pdf.k), 2200) : await T.loadImage(f.file);
    const t = document.createElement("canvas"), s = 160 / Math.max(im.width, im.height); t.width = Math.round(im.width * s); t.height = Math.round(im.height * s); t.getContext("2d").drawImage(im.canvas, 0, 0, t.width, t.height);
    f.thumb = t.toDataURL("image/jpeg", 0.7); f.img = im; return im; })();
  return f.imgP;
}
async function selLines(f) {  // text lines of the whole page, detected once
  if (!f.linesP) f.linesP = (async () => { const hint = $("#s_hint"); if (!T.loaded() && hint) hint.innerHTML = `<span class="spin" style="display:inline-block;vertical-align:-2px"></span> loading the OCR models (first time only)…`;
    try { await ensureModels(); } finally { const h = $("#s_hint"); if (h) h.textContent = "Drag to select · click a box to see it"; } applyScale(); const im = await selImage(f); const ls = await T.detectLines(im.canvas); return ls.map(l => Object.assign(l, {bbox: l.bbox || T.util.bboxOf(l.quad)})); })();
  try { return await f.linesP; } catch (e) { f.linesP = null; throw e; }
}
/** quad (tl,tr,br,bl) cut to the x range [x0,x1] along its top and bottom edges */
function cutQuad(q, x0, x1) {
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const at = (a, b, x) => { const dx = b[0] - a[0]; return Math.min(1, Math.max(0, dx ? (x - a[0]) / dx : 0)); };
  return [lerp(q[0], q[1], at(q[0], q[1], x0)), lerp(q[0], q[1], at(q[0], q[1], x1)), lerp(q[3], q[2], at(q[3], q[2], x1)), lerp(q[3], q[2], at(q[3], q[2], x0))];
}
async function selRead(f, box) {
  const t0 = performance.now(), im = await selImage(f), lines = await selLines(f), [x0, y0, x1, y1] = box.r;
  const picked = [];
  for (const l of lines) { const [a, b, c, d] = l.bbox, h = d - b, ov = Math.min(d, y1) - Math.max(b, y0), ox = Math.min(c, x1) - Math.max(a, x0);
    if (ov < 0.5 * h || ox < Math.min(0.6 * h, 0.5 * (c - a))) continue;            // most of the line height, and a real part of its width
    const cut = a < x0 - 0.15 * h || c > x1 + 0.15 * h; picked.push({quad: cut ? cutQuad(l.quad, Math.max(a, x0), Math.min(c, x1)) : l.quad, bbox: [Math.max(a, x0), b, Math.min(c, x1), d], h}); }
  // no detected line inside (a single word in a tight box, a logo text...): read the box itself as one line
  if (!picked.length) { const h = y1 - y0; if (h < 6 || x1 - x0 < 6) return Object.assign(box, {text: "", conf: 0, ms: 0, state: "done"}); picked.push({quad: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], bbox: [x0, y0, x1, y1], h, whole: true}); }
  // reading order: rows (centres close in y), left to right inside a row
  picked.sort((p, q) => (p.bbox[1] + p.bbox[3]) - (q.bbox[1] + q.bbox[3]));
  const rows = []; for (const p of picked) { const cy = (p.bbox[1] + p.bbox[3]) / 2, r = rows[rows.length - 1]; if (r && Math.abs(cy - r.cy) < 0.5 * Math.min(p.h, r.h)) r.items.push(p); else rows.push({cy, h: p.h, items: [p]}); }
  const order = rows.flatMap(r => r.items.sort((p, q) => p.bbox[0] - q.bbox[0]));
  const res = await T.recognize(order.map(p => T.cropLine(im.canvas, p.quad, 48)));
  let k = 0; const text = rows.map(r => r.items.map(() => (res[k++].text || "").trim()).filter(Boolean).join(r.items.length > 1 ? "\t" : "")).filter(Boolean).join("\n");
  const conf = res.length ? res.reduce((a, r) => a + r.confidence, 0) / res.length : 0;
  return Object.assign(box, {text, conf, lines: order.length, ms: performance.now() - t0, state: "done"});
}
function selCopy(text) { if (!text) { toast("nothing to copy"); return; } navigator.clipboard.writeText(text).then(() => toast("copied"), () => toast("copy blocked by the browser")); }
function renderSelect() {
  const f = SEL.files[SEL.cur];
  view.innerHTML = `
  <div class="head"><div class="grow"><h1>Select</h1><p>Add photos, scans or PDFs, then drag a box over any part of a page. That part is read at once, ready to copy. Nothing is saved.</p></div>
    <div class="tools"><label class="small mut" style="display:inline-flex;gap:6px;align-items:center;cursor:pointer" title="Copy each new result to the clipboard"><input type="checkbox" id="s_auto" ${SEL.autoCopy ? "checked" : ""}> Copy automatically</label>
      ${SEL.files.length ? `<button class="btn p" id="s_add">${icon("upload")} Add files</button>` : ""}</div></div>
  ${!SEL.files.length ? `<div class="drop sel-empty" id="s_drop"><div class="ico">${icon("upload", "l")}</div><div class="grow"><b>Drop images or PDFs here</b><div class="small">JPG, PNG, WebP, TIFF, PDF · or paste with Ctrl+V · then drag a box over any part to read it</div></div>
    <div class="acts"><button class="btn p" id="s_browse">${icon("folder")}Choose files</button><button class="btn" id="s_cam">${icon("camera")}Camera</button></div></div>` : `
  <div class="sel-grid">
   <div class="sel-files card" id="s_files">${SEL.files.map((x, i) => `<button class="sel-file ${i === SEL.cur ? "cur" : ""}" data-i="${i}" title="${esc(x.name)}"><span class="th">${x.thumb ? `<img src="${x.thumb}" alt="">` : icon("image")}</span><span class="nm">${esc(x.name)}</span>${x.boxes.length ? `<span class="count">${x.boxes.length}</span>` : ""}<span class="rm" data-rm="${i}" title="Remove">${icon("x", "s")}</span></button>`).join("")}</div>
   <div class="card sel-stage-card"><div class="panehead"><span style="color:var(--ink)">${esc(f.name)}</span><div class="grow"></div><span class="small mut" id="s_hint">Drag to select · click a box to see it</span></div>
     <div class="stage sel-stage" id="s_drop"><div class="sel-page" id="s_page"><div class="sel-wait" id="s_wait"><span class="spin"></span> opening…</div></div></div></div>
   <div class="sel-results" id="s_res"></div>
  </div>`}`;
  if ($("#s_add")) $("#s_add").onclick = () => pickFiles(selAdd); if ($("#s_browse")) { $("#s_browse").onclick = () => pickFiles(selAdd); $("#s_cam").onclick = () => pickFiles(selAdd, true); }
  $("#s_auto").onchange = e => { SEL.autoCopy = e.target.checked; localStorage.setItem("thaocr.selAutoCopy", SEL.autoCopy ? "1" : "0"); };
  if ($("#s_drop")) wireDrop($("#s_drop"), selAdd);
  if (!f) return;
  view.querySelectorAll(".sel-file").forEach(b => b.onclick = e => { const rm = e.target.closest("[data-rm]");
    if (rm) { const i = +rm.dataset.rm; SEL.files.splice(i, 1); SEL.cur = Math.min(SEL.cur >= i && SEL.cur > 0 ? SEL.cur - 1 : SEL.cur, SEL.files.length - 1); renderSelect(); return; }
    SEL.cur = +b.dataset.i; renderSelect(); });
  selResults(f);
  // thumbnails of files not decoded yet
  SEL.files.forEach((x, i) => { if (!x.thumb) selImage(x).then(() => { const b = view.querySelector(`.sel-file[data-i="${i}"] .th`); if (b && SEL.files[i] === x) b.innerHTML = `<img src="${x.thumb}" alt="">`; }).catch(() => { }); });
  selImage(f).then(im => { if (SEL.files[SEL.cur] !== f || !$("#s_page")) return; selMountPage(f, im); selLines(f).catch(e => toast("models: " + e.message)); })
    .catch(e => { $("#s_wait").textContent = "Could not open this file: " + e.message; });
}
function selMountPage(f, im) {
  const page = $("#s_page"); page.innerHTML = ""; const c = im.canvas; c.className = "sel-canvas"; page.appendChild(c);
  const layer = document.createElement("div"); layer.className = "sel-layer"; page.appendChild(layer);
  const toImg = e => { const r = c.getBoundingClientRect(); return [Math.min(im.width, Math.max(0, (e.clientX - r.left) / r.width * im.width)), Math.min(im.height, Math.max(0, (e.clientY - r.top) / r.height * im.height))]; };
  const pctStyle = r => `left:${r[0] / im.width * 100}%;top:${r[1] / im.height * 100}%;width:${(r[2] - r[0]) / im.width * 100}%;height:${(r[3] - r[1]) / im.height * 100}%`;
  const draw = () => { layer.innerHTML = f.boxes.map((b, i) => `<div class="sel-box ${b.state} ${b.id === f.focus ? "focus" : ""}" data-id="${b.id}" style="${pctStyle(b.r)}"><span class="tag">${i + 1}</span>${b.state === "reading" ? '<span class="sweep"></span>' : ""}</div>`).join(""); };
  f.redraw = draw; draw();
  let start = null, live = null;
  layer.onpointerdown = e => { if (e.button !== 0) return; const hit = e.target.closest(".sel-box"); if (hit) { selFocus(f, hit.dataset.id); return; }
    start = toImg(e); live = document.createElement("div"); live.className = "sel-box live"; layer.appendChild(live); layer.setPointerCapture(e.pointerId); e.preventDefault(); };
  layer.onpointermove = e => { if (!start) return; const p = toImg(e); live.setAttribute("style", pctStyle([Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])])); };
  layer.onpointerup = async e => { if (!start) return; const p = toImg(e), r = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])]; start = null; live.remove();
    const disp = c.getBoundingClientRect().width / im.width; if ((r[2] - r[0]) * disp < 8 || (r[3] - r[1]) * disp < 8) return;  // a click, not a drag
    const box = {id: Math.random().toString(36).slice(2), r, state: "reading", text: ""}; f.boxes.push(box); f.focus = box.id; draw(); selResults(f); selFileCount(f);
    try { await selRead(f, box); if (SEL.autoCopy && box.text) selCopy(box.text); }
    catch (err) { box.state = "failed"; box.err = err.message; }
    if (f.redraw) f.redraw(); selResults(f); };
  layer.onpointercancel = () => { start = null; if (live) live.remove(); };
}
function selFileCount(f) { const i = SEL.files.indexOf(f), b = view.querySelector(`.sel-file[data-i="${i}"]`); if (!b) return; let c = b.querySelector(".count"); if (!c) { c = document.createElement("span"); c.className = "count"; b.insertBefore(c, b.querySelector(".rm")); } c.textContent = f.boxes.length || ""; }
function selFocus(f, id) { f.focus = id; if (f.redraw) f.redraw(); view.querySelectorAll(".sel-item").forEach(el => el.classList.toggle("focus", el.dataset.id === id)); const it = view.querySelector(`.sel-item[data-id="${id}"]`); if (it) it.scrollIntoView({block: "nearest", behavior: "smooth"}); }
function selResults(f) {
  const el = $("#s_res"); if (!el) return;
  const all = f.boxes.filter(b => b.state === "done" && b.text).map(b => b.text).join("\n\n");
  el.innerHTML = `<div class="card pad sel-reshead"><b class="grow">Selections${f.boxes.length ? ` · ${f.boxes.length}` : ""}</b>${f.boxes.length > 1 ? `<button class="btn sm" id="s_copyall">${icon("copy", "s")} Copy all</button>` : ""}${f.boxes.length ? `<button class="btn sm ghost" id="s_clear" title="Remove all boxes">${icon("trash", "s")}</button>` : ""}</div>
   ${f.boxes.length ? f.boxes.map((b, i) => `<div class="card sel-item ${b.id === f.focus ? "focus" : ""}" data-id="${b.id}">
      <div class="sel-ih"><span class="tag">${i + 1}</span><span class="small mut grow">${b.state === "reading" ? "reading…" : b.state === "failed" ? "failed" : `${b.lines || 0} line${b.lines === 1 ? "" : "s"} · ${Math.round((b.conf || 0) * 100)}% sure · ${fmtMs(b.ms || 0)}`}</span>
        <button class="btn sm" data-copy="${b.id}" ${b.state !== "done" ? "disabled" : ""}>${icon("copy", "s")} Copy</button><button class="btn sm ghost" data-del="${b.id}" title="Remove">${icon("x", "s")}</button></div>
      ${b.state === "reading" ? `<div class="sel-skel"><i></i><i></i><i></i></div>` : b.state === "failed" ? `<div class="small" style="color:var(--bad)">${esc(b.err || "")}</div>` : `<textarea class="sel-text" data-id="${b.id}" rows="${Math.min(10, Math.max(2, (b.text.match(/\n/g) || []).length + 1))}" spellcheck="false" placeholder="No text found in this box">${esc(b.text)}</textarea>`}</div>`).join("")
     : `<div class="card pad small mut">Drag a box over the text you want. Each box appears here with a Copy button. You can edit the text before copying.</div>`}`;
  const byId = id => f.boxes.find(b => b.id === id);
  el.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => selCopy(byId(b.dataset.copy).text));
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { f.boxes = f.boxes.filter(x => x.id !== b.dataset.del); if (f.redraw) f.redraw(); selResults(f); selFileCount(f); });
  el.querySelectorAll(".sel-text").forEach(t => t.oninput = () => { byId(t.dataset.id).text = t.value; });
  el.querySelectorAll(".sel-item").forEach(it => it.onmouseenter = () => { if (f.focus !== it.dataset.id) { f.focus = it.dataset.id; if (f.redraw) f.redraw(); } });
  if ($("#s_copyall")) $("#s_copyall").onclick = () => selCopy(f.boxes.filter(b => b.state === "done" && b.text).map(b => b.text).join("\n\n"));
  if ($("#s_clear")) $("#s_clear").onclick = () => { f.boxes = []; if (f.redraw) f.redraw(); selResults(f); selFileCount(f); };
  void all;
}

/* ---------------------------------------------------------------- router + boot */
const ROUTES = {select: renderSelect, scan: renderScan, process: renderProcess, review: a => renderReview(a), documents: renderDocuments, settings: renderSettings, help: renderHelp, dashboard: renderScan, new: renderScan, batch: renderDocuments};
function route() { closeMenus(); const [, r = "scan", arg = ""] = location.hash.split("/"); sidebar(); (ROUTES[r] || renderScan)(arg); window.scrollTo(0, 0); }
window.addEventListener("hashchange", route);
(async () => {
  setSideCollapsed(localStorage.getItem("thaocr.sideCollapsed") === "1");
  try { const m = sessionStorage.getItem("thaocr.resetMsg"); if (m) { sessionStorage.removeItem("thaocr.resetMsg"); setTimeout(() => toast(m), 600); } } catch { }
  $("#sidetog").onclick = () => setSideCollapsed(!$("#shell").classList.contains("collapsed"));
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); setSideCollapsed(!$("#shell").classList.contains("collapsed")); } });
  await store.init();
  const preload = () => { if (RECO && RECO.tier !== "low" && !(DEVICE && DEVICE.saveData)) ensureModels(() => {}).then(() => { if (location.hash === "#/scan") renderScan(); }).catch(e => console.warn("model preload failed", e)); };
  // the notice is shown on the first visit and after a hard reload (Ctrl+Shift+R / Cmd+Shift+R / Ctrl+F5),
  // not after a normal reload. The page cannot tell the two reloads apart afterwards, so the hard-reload keys are
  // caught before the page unloads and remembered in sessionStorage. Models are fetched before the notice is
  // confirmed only if the user already accepted it once (they are then in the browser cache anyway).
  const seenBefore = !!store.settings.noticeSeen;
  let hard = false;
  try { hard = sessionStorage.getItem("thaocr.hardReload") === "1"; sessionStorage.removeItem("thaocr.hardReload"); } catch { }
  document.addEventListener("keydown", e => {
    const k = (e.key || "").toLowerCase();
    if (((e.ctrlKey || e.metaKey) && e.shiftKey && k === "r") || (k === "f5" && (e.ctrlKey || e.shiftKey)))
      try { sessionStorage.setItem("thaocr.hardReload", "1"); } catch { }
  }, true);
  if (!seenBefore || hard) $("#notice").classList.remove("hide");
  $("#notice_ok").onclick = () => { $("#notice").classList.add("hide"); if (!seenBefore) { store.settings.noticeSeen = true; store.save(); preload(); } };
  if (!location.hash) location.hash = "#/scan"; else route(); sidebar();
  try { await deviceCheck(); } catch (e) { console.warn(e); }
  sidebar(); if (location.hash === "#/scan") renderScan();
  // warm up in the background on capable devices: the first scan then starts at once
  if (seenBefore) preload(); // nothing is downloaded before the user has read the notice the first time
})();
