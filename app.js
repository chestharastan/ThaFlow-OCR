/* ThaOCR — client-only app. Everything (models, OCR, storage) runs in this browser; there is no server.
   Views: scan (home) · process · review & export · documents · settings · help. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const fmtMs = v => v == null ? "–" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms";
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
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
  async put(doc, blob) { const i = this.docs.findIndex(d => d.page_id === doc.page_id); if (!blob && i >= 0 && this.docs[i] !== doc) return false; /* a stale copy: the page was read again meanwhile */ const {image_url, ...rest} = doc; await T.db.put(rest, blob); if (blob) doc.image_url = await T.db.imageUrl(doc.page_id); if (i >= 0) this.docs[i] = doc; else this.docs.unshift(doc); },
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
const docStatus = d => d.status === "failed" ? ["Failed", "bad"] : d.status === "processing" ? ["Processing", "ink"] : (d.low - Object.keys(d.reviewed || {}).length) > 0 ? ["Needs review", "warn"] : ["Done", "ok"];

/* ---------------------------------------------------------------- theme: system / light / dark
   index.html sets data-theme before the first paint; this keeps it in sync with the saved choice and the OS. */
const THEME_KEY = "thaocr.theme", darkMq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : {matches: false};
const themePref = () => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; } };
function applyTheme(animate) {
  const pref = themePref(), dark = pref === "dark" || (pref === "system" && darkMq.matches), root = document.documentElement;
  if (animate && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { root.classList.add("theme-anim"); clearTimeout(applyTheme.t); applyTheme.t = setTimeout(() => root.classList.remove("theme-anim"), 320); }
  root.dataset.theme = dark ? "dark" : "light";
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#0f0f10" : "#f7f7f5";
  const to = dark ? "Light mode" : "Dark mode";  // top-right button (desktop) and top-bar button (phones)
  document.querySelectorAll(".themetog").forEach(b => { b.dataset.tip = to; b.setAttribute("aria-label", "Switch to " + to.toLowerCase()); if (!b.classList.contains("tip")) b.title = to; });
  document.querySelectorAll("#s_theme button").forEach(x => { const on = x.dataset.v === pref; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
}
function setTheme(t) { try { if (t === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { } applyTheme(true); }
if (darkMq.addEventListener) darkMq.addEventListener("change", () => { if (themePref() === "system") applyTheme(true); });

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
/* Paragraphs flow as one text: the lines of a paragraph are joined the way the pipeline joins them (no space between
   Khmer syllables, a space otherwise), from the CURRENT line texts so edits are included. */
const joinWrapped = (a, b) => T.pipeline && T.pipeline.joinWrapped ? T.pipeline.joinWrapped(a, b) : (a && b ? a + " " + b : a || b);
/** a text block's paragraphs in reading order -> [{level, bullet, lines}] (a line outside every paragraph keeps its own row) */
function blockParas(b) {
  const lines = (b.lines || []).filter(l => l.text), byOrder = new Map(lines.map(l => [l.reading_order, l])), used = new Set(), out = [];
  for (const p of b.paragraphs || []) { const pl = (p.lines || []).map(o => byOrder.get(o)).filter(l => l && !used.has(l)); if (!pl.length) continue; pl.forEach(l => used.add(l)); out.push({level: p.indent_level || 0, bullet: p.bullet || pl[0].bullet || null, lines: pl}); }
  for (const l of lines) if (!used.has(l)) out.push({level: l.indent_level || 0, bullet: l.bullet || null, lines: [l]});
  return out.sort((p, q) => p.lines[0].reading_order - q.lines[0].reading_order);
}
/** width of the text column each block sits in (decides which line breaks are wraps; see T.pipeline.softBreaks):
    - blocks of a side-by-side header/footer row (letterhead, motto): the page's text width, so their stacked lines stay;
    - body blocks with another block beside them over several lines (two-column text, text next to a figure): the
      span between those neighbours; otherwise the page's text width. */
function columnWidths(page) {
  const doc = page.document, W = page.width, m = doc && doc.margins, left = m ? m.left : 0.08 * W, right = m ? W - m.right : 0.92 * W, full = Math.max(1, right - left);
  const inRow = new Set(), mark = e => { if (e.columns) e.columns.forEach(c => c.elements.forEach(mark)); else if (e.items) e.items.forEach(mark); else if (e.block) inRow.add(e.block); };
  if (doc && doc.elements) doc.elements.forEach(e => { if (e.columns) mark(e); });
  const boxes = (page.blocks || []).map(b => ({id: b.id, x0: b.box.x, y0: b.box.y, x1: b.box.x + b.box.width, y1: b.box.y + b.box.height, lh: U_median((b.lines || []).map(l => l.box.height)) || 0}));
  const cache = new Map();
  return id => { if (cache.has(id)) return cache.get(id); let w = full; const me = boxes.find(b => b.id === id);
    if (me && !inRow.has(id) && me.lh) { let L = left, R = right;
      for (const o of boxes) { if (o.id === id) continue; const ov = Math.min(me.y1, o.y1) - Math.max(me.y0, o.y0); if (ov < 2.5 * me.lh) continue;
        if (o.x0 >= me.x1 - 2) R = Math.min(R, o.x0); else if (o.x1 <= me.x0 + 2) L = Math.max(L, o.x1); }
      w = Math.max(1, R - L); }
    cache.set(id, w); return w; };
}
const U_median = a => { if (!a.length) return 0; const v = a.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
const hasJoin = () => !!(T.pipeline && T.pipeline.joinLines);
const paraText = (p, cw) => hasJoin() ? T.pipeline.joinLines(p.lines, cw) : p.lines.reduce((a, l) => joinWrapped(a, l.text), "");
const paraHtml = (p, cw) => (hasJoin() ? T.pipeline.runsWithBreaks(p.lines, cw) : [{text: paraText(p, cw)}]).map(r => r.bold ? `<b>${esc(r.text)}</b>` : esc(r.text)).join("");
function blockTextMd(b, cw) { if (b.table) return b.table.rows.map(r => r.cells.map(c => c.text || "").join("\t")).join("\n"); return blockParas(b).map(p => "\t".repeat(p.level) + (p.bullet ? p.bullet + " " : "") + paraText(p, cw)).join("\n"); }
function pageText(page) { const cw = columnWidths(page); return [...page.blocks].sort((a, b) => a.reading_order - b.reading_order).map(b => blockTextMd(b, cw(b.id))).filter(Boolean).join("\n\n"); }


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
  document.querySelectorAll(".nav").forEach(a => { const on = a.dataset.r === r || (r === "process" && a.dataset.r === "scan") || (r === "review" && a.dataset.r === "documents");
    a.classList.toggle("cur", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#n_docs").textContent = groups(store.docs).length || "";
  const job = JOB && JOB.status === "running", pill = $("#running");
  pill.classList.toggle("hide", !(job || RERUN) || (job && r === "process"));
  if (job) { pill.href = "#/process"; $("#running_txt").textContent = "Working…"; $("#running_pct").textContent = Math.round(JOB.done / JOB.total * 100) + "%"; }
  else if (RERUN) { pill.href = "#/review/" + RERUN.pid; $("#running_txt").textContent = "Re-reading…"; $("#running_pct").textContent = Math.min(99, Math.round((RERUN.i - 1 + RERUN.frac) / RERUN.n * 100)) + "%"; }
  $("#dev").textContent = "Private · " + (T.loaded() ? (T.backendUsed === "webgpu" ? "GPU" : "CPU") + " ready" : DEVICE ? (DEVICE.webgpu ? "GPU" : "CPU") : "checking…");
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
function groupStatus(g) { if (g.some(d => d.status === "failed")) return ["Failed", "bad"]; if (g.some(d => d.status === "processing")) return ["Processing", "ink"]; return g.some(d => (d.low - Object.keys(d.reviewed || {}).length) > 0) ? ["Needs review", "warn"] : ["Done", "ok"]; }
function groupConf(g) { const n = g.reduce((a, d) => a + d.lines, 0); return n ? g.reduce((a, d) => a + d.avg_conf * d.lines, 0) / n : 0; }
const groupText = g => g.length === 1 ? pageText(g[0].result) : g.map((d, i) => `----- page ${i + 1} -----\n\n` + pageText(d.result)).join("\n\n");
async function deleteGroup(g) { for (const d of g) await store.del(d.page_id); }
async function rerunGroup(g) { if (!(await rerunPages(g))) return; afterRerun(g); }
/** after a re-run: redraw the re-read document's review page; refresh the Documents list keeping its search; leave any
    other page (and what the user is typing there) alone */
function afterRerun(g) { const h = location.hash; if (g.some(d => h === "#/review/" + d.page_id)) route(); else if (h === "#/documents") { if ($("#q") && $("#q").value) $("#q").dispatchEvent(new Event("input")); else route(); } }
const TIER_LABEL = {high: "Best quality", mid: "Balanced", low: "Light"};
const TIER_SUB = {high: "GPU or fast computer", mid: "Most computers", low: "Phones · smallest models"};
const TIER_TECH = {high: "fp32 recogniser v2.4, detector at 2200 px", mid: "int8 recogniser, detector at 1800 px", low: "int8 recogniser and layout model, detector at 1300 px"};
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------------------------------------------------------------- documents table (shared) */
function docsTable(docs, searching) {
  const gs = groups(docs);
  if (!gs.length) return searching ? `<div class="empty"><div class="ico">${icon("search", "l")}</div><b>No matches</b><span>Try another word.</span></div>`
    : `<div class="empty"><div class="ico">${icon("folder", "l")}</div><b>No documents yet</b><span>Your scans will appear here.</span><a class="btn p" href="#/scan">${icon("scan")}Scan a page</a></div>`;
  return `<table class="tbl"><thead><tr><th>Name</th><th>Status</th><th class="c-conf">Confidence</th><th class="c-date">Date</th><th><span class="sr">Actions</span></th></tr></thead><tbody>
  ${gs.map(g => { const d = g[0], [st, cls] = groupStatus(g), pc = Math.round(groupConf(g) * 1000) / 10, lines = g.reduce((a, x) => a + x.lines, 0), pdfText = g.filter(x => x.result && x.result.source === "pdf-text").length; return `<tr class="click" data-id="${d.page_id}" data-g="${esc(groupKey(d))}" tabindex="0">
   <td><div class="doc"><div class="ic"><img src="${d.image_url}" alt="" loading="lazy"></div><div class="grow"><b>${esc(groupName(d))}</b><span>${[g.length > 1 ? plural(g.length, "page") : "", plural(lines, "line"), pdfText ? "PDF text" : ""].filter(Boolean).join(" · ")}</span></div></div></td>
   <td><span class="badge ${cls}"><span class="dot"></span>${st}</span></td>
   <td class="c-conf"><span class="acc"><span class="bar"><i class="${pc >= 95 ? "ok" : "warn"}" style="width:${pc}%"></i></span><span class="num">${pc.toFixed(1)}%</span></span></td>
   <td class="c-date mut">${when(d.created)}</td>
   <td style="width:52px"><div class="rel"><button class="btn ghost sm icon more" data-id="${d.page_id}" title="More" aria-label="More actions" aria-haspopup="menu">${icon("more")}</button></div></td></tr>`; }).join("")}</tbody></table>`;
}
function wireDocsTable() {
  view.querySelectorAll("tr.click").forEach(tr => { tr.onclick = e => { if (e.target.closest(".more") || e.target.closest(".menu")) return; location.hash = "#/review/" + tr.dataset.id; };
    tr.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target === tr) { e.preventDefault(); location.hash = "#/review/" + tr.dataset.id; } }; });
  view.querySelectorAll(".more").forEach(btn => btn.onclick = e => { e.stopPropagation(); closeMenus(); const m = document.createElement("div"); m.className = "menu"; m.setAttribute("role", "menu");
    m.innerHTML = `<button data-a="open" role="menuitem">${icon("external")}Open</button><button data-a="docx" role="menuitem">${icon("file")}Word (.docx)</button><button data-a="txt" role="menuitem">${icon("list")}Text (.txt)</button><hr><button data-a="rerun" role="menuitem">${icon("refresh")}Run OCR again</button><button data-a="del" class="danger" role="menuitem">${icon("trash")}Delete</button>`;
    btn.parentElement.appendChild(m); openMenu(m); m.onclick = async ev => { const a = ev.target.closest("button")?.dataset.a, d = store.get(btn.dataset.id); closeMenus(); if (!d) return; const g = groupDocs(groupKey(d));
      if (a === "open") location.hash = "#/review/" + d.page_id; if (a === "rerun") await rerunGroup(g); if (a === "docx") exportDocx(g); if (a === "txt") download(groupTitle(g) + ".txt", groupText(g), "text/plain;charset=utf-8");
      if (a === "del") { if (!confirm(g.length > 1 ? `Delete this document and its ${g.length} pages?` : "Delete this document?")) return; await deleteGroup(g); route(); toast("Deleted"); } }; });
}
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.remove()); }
/** keyboard for a popup menu: focus the first item, arrows move, Esc closes and returns focus to the opener */
function openMenu(m) { const opener = document.activeElement, items = [...m.querySelectorAll("button")]; if (items[0] && opener && opener.matches && opener.matches(":focus-visible")) items[0].focus();
  m.onkeydown = e => { const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeMenus(); if (opener && opener.focus) opener.focus(); } }; }
document.addEventListener("click", e => { if (!e.target.closest(".menu") && !e.target.closest(".more") && !e.target.closest("#r_export")) closeMenus(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.querySelector(".menu")) closeMenus(); });

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
  if (!DEVICE || !RECO) return `<div class="chips"><span class="chip"><span class="spin"></span>Checking device…</span></div>`;
  const b = T.benchmarkStored(), est = b ? T.estimate(b, 40) : null, tier = store.settings.tier || RECO.tier;
  return `<div class="chips">
    <span class="chip" title="${esc(RECO.reasons.join(" · "))}">${icon("cpu", "s")}${DEVICE.webgpu ? "GPU" : "CPU"} · ${DEVICE.threads} threads${DEVICE.memoryGB ? ` · ${DEVICE.memoryGB} GB` : ""}</span>
    <a class="chip" href="#/settings" title="Model set${tier === RECO.tier ? " (recommended)" : ""} · change in Settings">${icon("layers", "s")}${TIER_LABEL[tier]}</a>
    ${est ? `<span class="chip" title="Typical 40-line page on this device">${icon("clock", "s")}~${est} s / page</span>` : ""}
    <span class="chip ${T.loaded() ? "ok" : ""}">${icon(T.loaded() ? "check-circle" : "download", "s")}<span id="dl_line">${T.loaded() ? "Models ready" : "Models"}</span></span></div>`;
}
async function fillDownloadLine() { const el = $("#dl_line"); if (!el || T.loaded()) return; try { const plan = await T.downloadPlan(chosenModels()), dl = plan.bytes; el.textContent = dl > 0 ? `${T.fmtBytes(dl)} one-time download` : "Models on device";
    if (dl > 0 && DEVICE.downlinkMbps) el.parentElement.title = `About ${Math.max(1, Math.round(dl * 8 / (DEVICE.downlinkMbps * 1e6)))} s on your connection`; } catch { el.parentElement.remove(); } }
/** a drop zone opens the file picker when clicked anywhere except its own buttons */
const clickToBrowse = (zone, btn) => { if (zone && btn) zone.onclick = e => { if (!e.target.closest("button,a,input")) btn.click(); }; };
function renderScan() {
  const n = pending.length, lowres = pending.filter(p => p.w && p.w < 1000), recent = store.docs.slice(0, 5), b = T.benchmarkStored();
  const nPages = pending.reduce((a, p) => a + (p.pdf ? Math.max(1, p.pdf.pages) : 1), 0), hasPdf = pending.some(p => p.pdf);
  const est = b ? Math.max(2, Math.round(nPages * T.estimate(b, 40))) : null;
  const meta = p => [p.pdf ? (p.pdf.pages ? `PDF · ${plural(p.pdf.pages, "page")}` : "PDF") : (p.w ? `${p.w} × ${p.h}` : ""), fmtSize(p.file.size)].filter(Boolean).join(" · ");
  view.innerHTML = `
  <div class="head"><div class="grow"><h1>Scan</h1><p>Photo, scan or PDF → editable Khmer &amp; English text.</p></div></div>
  ${devicePanel()}
  <div class="drop ${n ? "compact" : ""}" id="drop"><div class="ico">${icon("upload", "l")}</div><div class="grow"><b>${n ? "Add more" : "Drop files here"}</b><div class="small">Images or PDF · or paste with Ctrl+V</div></div>
    <div class="acts"><button class="btn ${n ? "" : "p"}" id="s_browse">${icon("folder")}Choose files</button><button class="btn" id="s_cam">${icon("camera")}Camera</button></div></div>
  ${n ? `<div class="card">
    <div class="rowhead"><h2>${plural(n, "file")}</h2><div class="grow"></div><button class="btn ghost sm" id="s_clear">Clear</button></div>
    <div class="flist">${pending.map((p, i) => `<div class="frow">${p.url ? `<img src="${p.url}" alt="">` : `<div class="fico">${icon("file")}</div>`}<div class="grow"><b title="${esc(p.file.name)}">${esc(p.file.name)}</b><span class="small mut">${meta(p)}</span></div>
      ${p.pdf && p.pdf.error ? `<span class="badge bad"><span class="dot"></span>${esc(p.pdf.error)}</span>` : ""}${p.w && p.w < 1000 ? '<span class="badge warn" title="Small Khmer marks may be missed"><span class="dot"></span>Low res</span>' : ""}<button class="x" data-i="${i}" title="Remove" aria-label="Remove ${esc(p.file.name)}">${icon("x", "s")}</button></div>`).join("")}</div>
    ${lowres.length ? `<div class="note" style="margin:0 18px 14px">${icon("alert")}<div>Low resolution${lowres.length > 1 ? ` (${plural(lowres.length, "file")})` : ""}: small Khmer marks may be missed. Use 1500 px+ or a 300 DPI scan.</div></div>` : ""}
    <div class="startbar"><span class="small mut">${hasPdf ? plural(nPages, "page") : ""}${hasPdf && est ? " · " : ""}${est ? `${icon("clock", "s")}${hasPdf ? "up to" : "about"} ${est} s` : ""}</span><div class="grow"></div><button class="btn p lg" id="s_start">Start OCR ${icon("arrow-right")}</button></div></div>` : ""}
  ${recent.length ? `<div class="sec"><div class="sechead"><h2>Recent</h2><div class="grow"></div><a class="btn ghost sm" href="#/documents">View all ${icon("chevron-right", "s")}</a></div><div class="card">${docsTable(recent)}</div></div>` : ""}
  <p class="fine">${icon("shield", "s")}Files never leave this device. They are saved in this browser only, so export what you need.</p>`;
  fillDownloadLine();
  wireDrop($("#drop"), async f => { await addFiles(f); renderScan(); });
  $("#s_browse").onclick = () => pickFiles(async f => { await addFiles(f); renderScan(); });
  $("#s_cam").onclick = () => pickFiles(async f => { await addFiles(f); renderScan(); }, true);
  clickToBrowse($("#drop"), $("#s_browse"));
  if (n) {
    $("#s_clear").onclick = () => { pending = []; renderScan(); };
    view.querySelectorAll(".frow .x").forEach(b => b.onclick = () => { pending.splice(+b.dataset.i, 1); renderScan(); });
    $("#s_start").onclick = startJob;
  }
  wireDocsTable();
}

/* ---------------------------------------------------------------- job runner */
function startJob() {
  if (ocrBusy()) { busyToast(); return; }
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
    const needModels = async () => { if (modelsReady) { JOB.load = null; return; } await ensureModels((msg, frac) => { JOB.load = {msg, frac}; renderIfProcess(); }); modelsReady = true; JOB.load = null; };
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
  if (!JOB) { view.innerHTML = `<div class="head"><div class="grow"><h1>Processing</h1></div></div><div class="card empty"><div class="ico">${icon("scan", "l")}</div><b>Nothing running</b><a class="btn p" href="#/scan">${icon("scan")}Scan a page</a></div>`; return; }
  const cur = JOB.files[Math.min(JOB.current ?? 0, JOB.files.length - 1)], last = JOB.results[JOB.results.length - 1], running = JOB.status === "running";
  const stepIdx = {pdf: 0, decode: 0, layout: 1, textdet: 2, rec: 3, font: 4, structure: 4, done: 5}; const si = JOB.step ? stepIdx[JOB.step.stage] : -1;
  const recFrac = JOB.step && JOB.step.stage === "rec" && JOB.step.total ? JOB.step.done / JOB.step.total : 0;
  const fileFrac = cur.status === "running" ? Math.min(0.95, (si < 0 ? 0 : si === 3 ? 0.35 + 0.5 * recFrac : si >= 4 ? 0.9 : si * 0.12)) : 0;
  const pct = JOB.load ? Math.round(JOB.load.frac * 100) : Math.round((JOB.done + (running ? fileFrac : 0)) / JOB.total * 100);
  const t = last ? last.timings : null, blocks = last ? last.blocks : [], n = cls => blocks.filter(b => b.cls === cls).length;
  const count = (k, w) => n(k) ? plural(n(k), w) : "";
  const stepsHtml = [
    ["Open file", last ? `${last.width} × ${last.height} px` : "", si > 0 || !!last, null],
    ["Find regions", t ? [plural(blocks.length, "region"), count("table", "table"), count("stamp", "stamp")].filter(Boolean).join(" · ") : "", si > 1 || !!t, t && t.layout_ms],
    ["Find lines", t ? plural(t.lines_detected, "line") : "", si > 2 || !!t, t && t.textdet_ms],
    ["Read text", t ? plural(t.lines_recognized, "line") : (JOB.step && JOB.step.stage === "rec" && JOB.step.total ? `${JOB.step.done} / ${JOB.step.total} lines` : ""), si > 3 || !!t, t && t.rec_ms],
    ["Fonts & order", t ? (t.structure === "model" ? "Learned structure" : "Layout rules") : "", si > 4 || !!t, t && ((t.font_ms || 0) + (t.structure_ms || 0))],
    ["Build document", t ? "Ready" : "", !!t, null]];
  const failed = JOB.files.filter(f => f.status === "failed");
  const b = T.benchmarkStored(), remaining = running ? (JOB.load ? "" : `~${Math.max(1, Math.round((JOB.total - JOB.done - fileFrac) * (b ? T.estimate(b, 40) : 8)))} s left`) : `Took ${fmtMs(Date.now() - JOB.started)}`;
  const headHtml = `<div class="grow"><h1>${JOB.load ? "Getting ready…" : running ? "Reading…" : "Done"}</h1><p>${esc(JOB.name)}${JOB.total > 1 ? ` · ${Math.min(JOB.done + 1, JOB.total)} / ${JOB.total}` : ""}</p></div>
    ${running ? `<a class="btn" href="#/scan" title="OCR keeps running while you browse">Run in background</a>` : `<a class="btn p lg" href="#/review/${esc((JOB.files.find(x => x.page_id) || {}).page_id || "")}">Review ${icon("arrow-right")}</a>`}`;
  const badgeCls = `badge ${running ? "ink" : "ok"}`, badgeTxt = JOB.load ? "Loading" : running ? "Working" : "Done";
  const msg = JOB.load ? JOB.load.msg : remaining;
  const note = JOB.load ? `One-time download. Next scans start instantly.` : "";
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
   <div class="card"><div class="panehead"><span class="ph-t" id="p_name">${esc(cur.name)}</span><div class="grow"></div><span class="${badgeCls}" id="p_badge"><span class="dot"></span><span class="t">${badgeTxt}</span></span></div>
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
/* Re-reading stored pages: one OCR at a time (a scan or a re-run), with progress in the sidebar pill. */
let RERUN = null;  // {key, pid, n, i, frac} while pages are read again
const ocrBusy = () => (JOB && JOB.status === "running") || !!RERUN;
const busyToast = () => toast("OCR is already running · wait for it to finish");
const STAGE_FRAC = {decode: 0.02, layout: 0.1, textdet: 0.25, rec: 0.35, font: 0.88, structure: 0.95};
async function rerun(d, label, silent) { toast("Running OCR" + (label ? " · " + label : "") + "…"); try { await ensureModels(); const blob = await T.db.imageBlob(d.page_id); if (!blob) throw new Error("page image missing");
    const res = await T.process(blob, st => { if (!RERUN) return; RERUN.frac = st.stage === "rec" && st.total ? 0.35 + 0.5 * st.done / st.total : (STAGE_FRAC[st.stage] ?? RERUN.frac); sidebar(); });
    if (!store.get(d.page_id)) return false;  // deleted while it was being read: it stays deleted
    res.page_id = d.page_id; const nd = summarize(res, d.filename, d.job, d.size); nd.created = d.created; for (const k of ["group", "group_name", "page_no", "page_count"]) if (d[k] != null) nd[k] = d[k]; await store.put(nd, res.image_blob); if (!silent) { toast("Done"); route(); } return true; } catch (e) { toast("Failed: " + e.message); return false; } }
/** Read pages of one document again, one after the other -> false if another OCR is running */
async function rerunPages(pages) {
  if (ocrBusy()) { busyToast(); return false; }
  const all = groupDocs(groupKey(pages[0])); RERUN = {key: groupKey(pages[0]), pid: pages[0].page_id, n: pages.length, i: 0, frac: 0}; sidebar(); markRerunButtons();
  let ok = true;
  try { for (const d of pages) { RERUN.i++; RERUN.frac = 0; sidebar(); if (!store.get(d.page_id)) continue; ok = (await rerun(d, all.length > 1 ? `page ${pageNo(d)} of ${all.length}` : "", true)) && ok; } }
  finally { RERUN = null; sidebar(); markRerunButtons(); }
  if (ok) toast("Done"); return true;
}
/** While OCR re-reads pages, the re-run buttons are disabled and their icon turns */
function markRerunButtons() { for (const b of view.querySelectorAll("#r_ocr, #r_rerun, [data-ocr]")) { b.disabled = !!RERUN; b.classList.toggle("busy", !!RERUN); } }
/* ---------------------------------------------------------------- full-size viewer */
function openLightbox(d, img, onClose) {
  if ($("#lightbox")) return;
  const page = d.result, el = document.createElement("div"); el.className = "lb"; el.id = "lightbox"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Full-size page");
  el.innerHTML = `<div class="lb-bar" role="toolbar" aria-label="Full-size view"><b>${esc(docTitle(d))}</b><span class="mut">${page.width} × ${page.height} px</span><div class="grow"></div>
      <button class="tool" data-a="out" title="Zoom out (−)" aria-label="Zoom out (−)">${icon("zoom-out", "s")}</button><button class="tool pct mono" data-a="toggle" title="Switch fit / 100%" aria-label="Switch fit / 100%"></button><button class="tool" data-a="in" title="Zoom in (+)" aria-label="Zoom in (+)">${icon("zoom-in", "s")}</button>
      <button class="tool" data-a="fit" title="Fit to screen (0)" aria-label="Fit to screen (0)">${icon("fit", "s")}</button>
      <span class="opts"><label class="small"><input type="checkbox" data-a="boxes" ${REVIEW.boxes ? "checked" : ""}> Boxes</label><label class="small"><input type="checkbox" data-a="labels" ${REVIEW.labels ? "checked" : ""}> Labels</label></span>
      <button class="tool" data-a="tab" title="Open image in a new tab" aria-label="Open image in a new tab">${icon("external", "s")}</button><button class="tool" data-a="dl" title="Download image" aria-label="Download image">${icon("download", "s")}</button><button class="tool" data-a="close" title="Close (Esc)" aria-label="Close (Esc)">${icon("x", "s")}</button></div>
    <div class="lb-body"><canvas></canvas></div><div class="lb-hint">Ctrl + scroll or double-click to zoom · Esc to close</div>`;
  const opener = document.activeElement; document.body.appendChild(el); document.body.style.overflow = "hidden"; $('[data-a="close"]', el).focus();
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
  const close = () => { document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); el.remove(); document.body.style.overflow = ""; if (opener && opener.isConnected && opener.focus) opener.focus(); if (onClose) onClose(); };
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
  const textOut = s => { const colW = columnWidths(s.result); return [...s.result.blocks].sort((a, b) => a.reading_order - b.reading_order).filter(b => (b.lines || []).some(l => l.text)).map(b => { const cw = colW(b.id); return `<div class="blk ${b.align || ""}"><div class="lbl">${esc(ROLE[b.cls] || b.cls)}</div>${b.table ? esc(blockTextMd(b)) : blockParas(b).map(p => `<div class="para"${p.level ? ` style="padding-left:${p.level * 2}em"` : ""}>${p.bullet ? esc(p.bullet) + " " : ""}${paraHtml(p, cw)}</div>`).join("")}</div>`; }).join(""); };
  const source = pdfTextPages === pages.length ? "PDF text · no OCR" : pdfTextPages ? `PDF text on ${pdfTextPages} / ${pages.length} pages` : (d.result.pdf_text && d.result.pdf_text.reason ? `OCR (PDF text: ${esc(d.result.pdf_text.reason)})` : "");
  const doubtful = pages.filter(s => s.result.source === "pdf-text" && s.result.pdf_text && s.result.pdf_text.broken > 0.01);
  const ocrLabel = pdfTextPages ? "Run OCR instead" : "Run OCR again", ocrTip = pdfTextPages ? "Ignore the PDF text and read the page images with OCR" : "Read the document again";
  const modes = [["side", "Split", "split"], ["text", "Text", "type"], ["original", "Original", "image"]];
  view.innerHTML = `
  <div class="head"><div class="grow"><a class="back" href="#/documents">${icon("arrow-left", "s")}Documents</a><h1 class="title-row">${esc(groupTitle(pages))} <span class="badge ${cls}"><span class="dot"></span>${st}</span></h1>
    <p>${[multi ? plural(pages.length, "page") : "", `${(conf * 100).toFixed(1)}% confidence`, lows.length ? `<span class="warn-t">${lows.length} to check</span>` : ""].filter(Boolean).join(" · ")}</p></div>
    <div class="tools"><div class="seg" id="r_mode" role="group" aria-label="View">${modes.map(([k, t, ic]) => `<button class="${REVIEW.mode === k ? "on" : ""}" data-m="${k}" aria-pressed="${REVIEW.mode === k}">${icon(ic, "s")}${t}</button>`).join("")}</div>
    ${REVIEW.side ? "" : `<button class="btn tip" id="r_side_open" data-tip="Lines to check" aria-label="Show lines to check">${icon("panel-right")}${lows.length ? `<span class="badge warn">${lows.length}</span>` : ""}</button>`}
    <button class="btn icon tip" id="r_ocr" data-tip="${ocrLabel}" aria-label="${ocrLabel}">${icon("refresh")}</button>
    <button class="btn" id="r_copy">${icon("copy")}Copy</button>
    <div class="rel"><button class="btn p" id="r_export" aria-haspopup="menu">${icon("download")}Export ${icon("chevron-down", "s")}</button></div></div></div>
  <div class="card review ${REVIEW.mode === "side" ? "" : REVIEW.mode} ${multi ? "" : "one"} ${REVIEW.side ? "" : "noside"}">
   ${multi ? `<div class="thumbs">${pages.map((s, i) => `<div class="th ${s.page_id === id ? "cur" : ""}" data-id="${s.page_id}" title="Page ${i + 1}" role="button" tabindex="0"><img src="${s.image_url}" alt="">${i + 1}</div>`).join("")}</div>` : ""}
   ${REVIEW.mode !== "text" ? `<div><div class="panehead"><span class="ph-t">${icon("image", "s")}Original</span><div class="grow"></div><button class="tool" id="r_zoomout" title="Zoom out" aria-label="Zoom out">${icon("zoom-out", "s")}</button><span class="num small">${Math.round(REVIEW.zoom * 100)}%</span><button class="tool" id="r_zoomin" title="Zoom in" aria-label="Zoom in">${icon("zoom-in", "s")}</button><button class="tool" id="r_full" title="Full size (F)" aria-label="Full size">${icon("expand", "s")}</button><span class="opts"><label class="tg"><input type="checkbox" id="r_boxes" ${REVIEW.boxes ? "checked" : ""}>Boxes</label><label class="tg"><input type="checkbox" id="r_labels" ${REVIEW.labels ? "checked" : ""}>Labels</label></span></div>
     <div class="panebody" id="r_orig">${pages.map((s, i) => `<div class="pagewrap" data-pid="${s.page_id}">${pageLabel(s, i, true)}<div class="view" data-pid="${s.page_id}" title="Open full size"><canvas data-pid="${s.page_id}"></canvas></div></div>`).join("")}</div></div>` : ""}
   ${REVIEW.mode === "side" ? `<div><div class="panehead"><div class="seg" id="r_pane" role="group" aria-label="Result view">${hasDoc ? `<button class="${REVIEW.pane === "document" ? "on" : ""}" data-p="document">Document</button>` : ""}<button class="${REVIEW.pane === "overlay" || !hasDoc ? "on" : ""}" data-p="overlay">Overlay</button></div><div class="grow"></div><span class="mut small">${icon("pencil", "s")} Click to edit · <span id="r_saved">Saved</span></span></div><div class="panebody" id="r_docwrap">${pages.map((s, i) => `<div class="pagewrap" data-pid="${s.page_id}">${pageLabel(s, i)}<div class="pgbody" data-pid="${s.page_id}"></div></div>`).join("")}</div></div>` : ""}
   ${REVIEW.mode === "text" ? `<div><div class="panehead"><span class="ph-t">${icon("type", "s")}Text</span><div class="grow"></div><span class="mut small">Reading order</span></div><div class="panebody white"><div class="textout" id="r_text">${pages.map((s, i) => (multi ? `<div class="lbl" style="margin:${i ? 28 : 0}px 0 10px">Page ${i + 1}</div>` : "") + textOut(s)).join("")}</div></div></div>` : ""}
   ${REVIEW.side ? `<div><div class="panehead"><span class="ph-t">To check</span><span class="badge ${lows.length ? "warn" : "ok"}">${lows.length}</span><div class="grow"></div><button class="tool" id="r_side_close" title="Close panel" aria-label="Close panel">${icon("x", "s")}</button></div>
    <div class="panebody white" style="max-height:none">
     <div id="r_lows">${lows.length ? lows.slice(0, 12).map((x, i) => `<div class="rev ${i === 0 ? "cur" : ""}" data-key="${lineKey(x.b, x.l)}" data-pid="${x.d.page_id}"><div class="rev-h"><span class="badge warn">${Math.round(x.l.confidence * 100)}%</span>${multi ? `<span>Page ${pageNo(x.d)}</span>` : ""}</div><div class="snip"><canvas data-key="${lineKey(x.b, x.l)}" data-pid="${x.d.page_id}"></canvas></div><input value="${esc(x.l.text)}" aria-label="Text of this line"><div class="acts"><button class="btn p sm" data-a="accept">${icon("check", "s")}Accept</button><button class="btn sm ghost" data-a="ignore">Ignore</button></div></div>`).join("") : `<div class="allgood">${icon("check-circle")}All lines look good</div>`}</div>
     ${lows.length ? `<button class="btn block" id="r_acceptall">${icon("check-circle")}Accept all</button>` : ""}
     <h3 class="sub-h">Details</h3>
     ${multi ? `<div class="kv"><span>Pages</span><b>${pages.length}</b></div>` : ""}
     <div class="kv"><span>Regions</span><b>${regions}${extras ? " · " + extras : ""}</b></div>
     <div class="kv"><span>Text</span><b>${plural(nLines, "line")} · ${nChars} chars</b></div>
     <div class="kv"><span>Fonts</span><b>${esc(fonts.join(", ") || "–")}</b></div>
     ${source ? `<div class="kv"><span>Source</span><b>${source}</b></div>` : ""}
     ${doubtful.length ? `<div class="note" style="margin:8px 0">${icon("alert")}<div>PDF text may be damaged${multi ? ` on page${doubtful.length > 1 ? "s" : ""} ${doubtful.map(s => pageNo(s)).join(", ")}` : ""}. Try <b>Run OCR instead</b>.</div></div>` : ""}
     <div class="kv"><span>Time</span><b>${fmtMs(totalMs)}</b></div>
     <div class="btnrow"><button class="btn sm" id="r_rerun" title="${ocrTip}">${icon("refresh", "s")}${ocrLabel}</button><button class="btn sm danger" id="r_del">${icon("trash", "s")}Delete</button></div></div></div>` : ""}</div>`;
  view.querySelectorAll("#r_mode button").forEach(b => b.onclick = () => { REVIEW.mode = b.dataset.m; renderReview(id); });
  for (const [sel, on] of [["#r_side_close", false], ["#r_side_open", true]]) { const b = view.querySelector(sel); if (b) b.onclick = () => { REVIEW.side = on; localStorage.setItem("thaocr.reviewSide", on ? "1" : "0"); renderReview(id); }; }
  // page strip: scroll both panes to that page
  let buildDocUpTo = null;  // set by the Document pane: builds the flowing pages up to a page so a jump lands on it
  const scrollToPage = pid => { if (buildDocUpTo) buildDocUpTo(pid); for (const el of view.querySelectorAll(`.pagewrap[data-pid="${pid}"]`)) el.scrollIntoView({block: "start", behavior: "smooth"}); view.querySelectorAll(".thumbs .th").forEach(t => t.classList.toggle("cur", t.dataset.id === pid)); REVIEW.cur = pid; };
  view.querySelectorAll(".thumbs .th").forEach(t => { t.onclick = () => scrollToPage(t.dataset.id); t.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); scrollToPage(t.dataset.id); } }; });
  const orig = $("#r_orig"); if (orig && multi && window.IntersectionObserver) { const io = new IntersectionObserver(es => { const top = es.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (top) view.querySelectorAll(".thumbs .th").forEach(t => t.classList.toggle("cur", t.dataset.id === top.target.dataset.pid)); }, {root: orig, threshold: [0.25, 0.5, 0.75]}); orig.querySelectorAll(".pagewrap").forEach(el => io.observe(el)); }
  $("#r_copy").onclick = () => navigator.clipboard.writeText(groupText(pages)).then(() => toast("Copied"), () => toast("Copy blocked by the browser"));
  if ($("#r_rerun")) $("#r_rerun").onclick = () => rerunGroup(pages);
  $("#r_ocr").onclick = () => { if (ocrBusy()) { busyToast(); return; } if (!multi || confirm(`Run OCR on all ${pages.length} pages? This replaces the current text.`)) rerunGroup(pages); };
  view.querySelectorAll("[data-ocr]").forEach(b => b.onclick = async e => { e.stopPropagation(); const s = byId[b.dataset.ocr]; if (!(await rerunPages([s]))) return; afterRerun(groupDocs(groupKey(s)).concat([s])); if (!location.hash.startsWith("#/review/")) return; setTimeout(() => { for (const el of view.querySelectorAll(`.pagewrap[data-pid="${s.page_id}"]`)) el.scrollIntoView({block: "start"}); }, 50); });
  if ($("#r_del")) $("#r_del").onclick = async () => { if (confirm(multi ? `Delete this document and its ${pages.length} pages from this browser?` : "Delete this document from this browser?")) { await deleteGroup(pages); location.hash = "#/documents"; toast("Deleted"); } };
  $("#r_export").onclick = e => { e.stopPropagation(); if (document.querySelector("#r_export + .menu")) { closeMenus(); return; } closeMenus(); const m = document.createElement("div"); m.className = "menu"; m.setAttribute("role", "menu");
    m.innerHTML = `<button data-a="docx" role="menuitem">${icon("file")}Word (.docx)</button><button data-a="txt" role="menuitem">${icon("list")}Text (.txt)</button><button data-a="json" role="menuitem">${icon("braces")}JSON</button><button data-a="png" role="menuitem">${icon("image")}Page image${multi ? "s" : ""}</button>`;
    $("#r_export").parentElement.appendChild(m); openMenu(m); m.onclick = ev => { const a = ev.target.closest("button")?.dataset.a; closeMenus(); const base = groupTitle(pages);
      if (a === "docx") exportDocx(pages); if (a === "txt") download(base + ".txt", groupText(pages), "text/plain;charset=utf-8");
      if (a === "json") download(base + ".json", JSON.stringify(multi ? pages.map(s => s.result) : d.result, null, 1), "application/json");
      if (a === "png") pages.forEach((s, i) => setTimeout(() => { const x = document.createElement("a"); x.href = s.image_url; x.download = multi ? `${base} page ${i + 1}.jpg` : s.filename; x.click(); }, i * 400)); }; };
  // page images + canvases
  const imgs = {}; for (const s of pages) { const im = new Image(); im.src = s.image_url; imgs[s.page_id] = im; }
  // Pages are painted only while near the viewport, at display resolution (a 100-page PDF must not hold 100 full
  // canvases in memory); the full-size view is the lightbox.
  const near = new Set(); let io = null;
  const sizeView = s => { const v = view.querySelector(`.view[data-pid="${s.page_id}"]`); if (!v) return 0; const page = s.result, w = Math.min(page.width, (v.parentElement.parentElement.clientWidth - 32)) * REVIEW.zoom; v.style.width = w + "px"; v.style.height = (w * page.height / page.width) + "px"; return w; };
  const paintPage = s => { const im = imgs[s.page_id], cv = view.querySelector(`.view canvas[data-pid="${s.page_id}"]`); if (!cv || !im || !im.complete || !im.naturalWidth) return; const page = s.result, w = sizeView(s);
    if (multi && !near.has(s.page_id)) { if (cv.width > 1) { cv.width = 1; cv.height = 1; } return; }
    const k = Math.min(1, (w * (window.devicePixelRatio || 1)) / page.width); drawOriginal(cv, im, page, {boxes: REVIEW.boxes, labels: REVIEW.labels, lines: REVIEW.boxes, scale: k}); cv.style.width = "100%"; cv.style.height = "100%"; };
  pages.forEach(sizeView);
  if (orig && multi && window.IntersectionObserver) { io = new IntersectionObserver(es => { for (const e of es) { const pid = e.target.dataset.pid; if (e.isIntersecting) near.add(pid); else near.delete(pid); paintPage(byId[pid]); } }, {root: orig, rootMargin: "150% 0px"}); orig.querySelectorAll(".view[data-pid]").forEach(el => io.observe(el)); }
  else pages.forEach(s => near.add(s.page_id));
  const paintSnips = () => { for (const c of view.querySelectorAll(".snip canvas")) { const s = byId[c.dataset.pid], im = imgs[c.dataset.pid]; if (!s || !im || !im.complete || !im.naturalWidth) continue; const page = s.result, [bid, lo] = c.dataset.key.split(":"); const b = page.blocks.find(x => x.id === bid), l = b && b.lines.find(x => String(x.reading_order) === lo); if (!l) continue;
      const pad = l.box.height * 0.3, sx = Math.max(0, l.box.x - pad), sy = Math.max(0, l.box.y - pad), sw = Math.min(page.width - sx, l.box.width + 2 * pad), sh = Math.min(page.height - sy, l.box.height + 2 * pad);
      c.width = Math.round(sw * 2); c.height = Math.round(sh * 2); c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height); } };
  const paintAll = () => { pages.forEach(paintPage); paintSnips(); };
  for (const s of pages) { const im = imgs[s.page_id]; const v = view.querySelector(`.view[data-pid="${s.page_id}"]`); if (!s.image_url && v) v.innerHTML = `<div class="small" style="padding:40px 20px;text-align:center;color:#6b6b6b">Page image not stored · text still available</div>`;
    im.onload = () => { paintPage(s); paintSnips(); }; if (im.complete && im.naturalWidth) im.onload(); }
  if ($("#r_zoomin")) { $("#r_zoomin").onclick = () => { REVIEW.zoom = Math.min(3, REVIEW.zoom + 0.25); renderReview(id); }; $("#r_zoomout").onclick = () => { REVIEW.zoom = Math.max(0.5, REVIEW.zoom - 0.25); renderReview(id); };
    $("#r_boxes").onchange = e => { REVIEW.boxes = e.target.checked; paintAll(); }; $("#r_labels").onchange = e => { REVIEW.labels = e.target.checked; paintAll(); };
    const full = pid => { const s = byId[pid] || byId[REVIEW.cur] || d; openLightbox(s, imgs[s.page_id], () => { if ($("#r_boxes")) { $("#r_boxes").checked = REVIEW.boxes; $("#r_labels").checked = REVIEW.labels; } paintAll(); }); };
    $("#r_full").onclick = () => full(REVIEW.cur); view.querySelectorAll(".view[data-pid]").forEach(v => v.onclick = () => full(v.dataset.pid));
    REVIEW.key = e => { if (e.key.toLowerCase() === "f" && !(e.target.closest && e.target.closest("input,textarea,[contenteditable]")) && !$("#lightbox")) full(REVIEW.cur); };
    document.addEventListener("keydown", REVIEW.key); }
  const wrap = $("#r_docwrap");
  if (wrap) {
    const avail = Math.max(innerWidth < 861 ? 320 : 160, wrap.clientWidth - 32)  /* the page fits the pane's real width (no overflow); phones reflow */, rendered = new Set();
    const renderPage = s => { if (rendered.has(s.page_id)) return; rendered.add(s.page_id); const body = wrap.querySelector(`.pgbody[data-pid="${s.page_id}"]`), page = s.result; if (!body) return; body.style.minHeight = "";
    buildDocUpTo = pid => { const k = pages.findIndex(x => x.page_id === pid); pages.slice(0, k + 1).forEach(renderPage); };
      if (REVIEW.pane === "document" && window.DocView && page.document) body.appendChild(DocView.render(page, {flow: innerWidth < 861, natural: true, columnWidth: columnWidths(page), scale: Math.min(1, avail / page.width), editable: true, onEdit: (bid, orders, text) => applyParagraphEdit(s, bid, orders, text)}));
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
    card.querySelector('[data-a="ignore"]').onclick = () => { if (stale(s)) return; s.reviewed = s.reviewed || {}; s.reviewed[key] = "ignored"; syncDocument(s); store.put(s); renderReview(id); }; });
  if (RERUN) markRerunButtons();
  if ($("#r_acceptall")) $("#r_acceptall").onclick = () => { if (lows.some(x => stale(x.d))) return; for (const x of lows) { x.d.reviewed = x.d.reviewed || {}; x.d.reviewed[lineKey(x.b, x.l)] = "accepted"; } for (const s of new Set(lows.map(x => x.d))) { syncDocument(s); store.put(s); } renderReview(id); toast("All lines accepted"); };
}
/** the page object a handler holds was replaced by a re-run: show the new text instead of saving the old one */
function stale(d) { const cur = store.get(d.page_id); if (cur === d) return false; if (cur) { toast("This page was just read again · showing the new text"); if (location.hash.startsWith("#/review/")) route(); } return true; }  /* gone: deleted, nothing to save */
function applyParagraphEdit(d, blockId, orders, text) {
  if (stale(d)) return; const b = d.result.blocks.find(x => x.id === blockId); if (!b) return;
  const lines = orders.map(o => b.lines.find(l => l.reading_order === o)).filter(Boolean); if (!lines.length) return;
  const parts = text.split("\n"), perLine = lines.length > 1 && parts.length === lines.length;  // kept breaks still there: one piece per line
  lines.forEach((l, i) => { if (l.confidence_before == null) l.confidence_before = l.confidence; l.text = perLine ? parts[i] : i ? "" : text; l.spans = []; l.confidence = Math.max(l.confidence, 0.99); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = "edited"; });
  b.text = blockTextMd(b);
  const para = (b.paragraphs || []).find(p => p.lines.join() === orders.join()); if (para) { para.text = text; para.runs = [{text, bold: false}]; }
  const de = (d.result.document || {elements: []}).elements; for (const e of de) { const items = e.type === "list" ? e.items : e.columns ? e.columns.flatMap(c => c.elements) : [e]; for (const it of items) if (it.block === blockId && (it.lines || []).join() === orders.join()) { it.text = text; it.runs = [{text, bold: false}]; it.low = false; } }
  recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
/** Line edits (Accept, Ignore, typing in the Overlay) also update the structured document, so the Document view and the
    Word export show the corrected text and drop the "check" highlight of lines that were looked at. */
function syncDocument(d) {
  const page = d.result, doc = page.document; if (!doc || !doc.elements || !(T.pipeline && T.pipeline.paragraphRuns)) return;
  const blocks = Object.fromEntries(page.blocks.map(b => [b.id, b])), rev = d.reviewed || {};
  const fix = e => { const b = blocks[e.block]; if (!b || !(e.lines || []).length && !e.table) return; const byOrder = new Map((b.lines || []).map(l => [l.reading_order, l]));
    if (e.type === "table" && e.table) { for (const r of e.table.rows) for (const c of r.cells) if ((c.lines || []).some(o => { const l = byOrder.get(o); return l && rev[lineKey(b, l)] === "edited"; })) { const cl = c.lines.map(o => byOrder.get(o)).filter(l => l && l.text); c.text = cl.length >= 2 && cl.some(l => l.bullet) ? cl.map(l => (l.bullet ? l.bullet + " " : "") + l.text).join("\n") : cl.reduce((a, l) => T.pipeline.joinWrapped(a, l.text), ""); } return; }
    const pl = e.lines.map(o => byOrder.get(o)).filter(l => l && l.text);
    e.runs = pl.length ? T.pipeline.paragraphRuns(pl) : []; e.text = e.runs.map(r => r.text).join(""); e.low = pl.some(l => l.confidence < LOW && !rev[lineKey(b, l)]); };
  const walk = e => { if (e.columns) e.columns.forEach(c => c.elements.forEach(walk)); else if (e.type === "list") e.items.forEach(fix); else fix(e); };
  doc.elements.forEach(walk);
}
function applyEdit(d, b, l, text) {
  if (stale(d)) return;
  const changed = text !== l.text; if (changed && l.confidence_before == null) l.confidence_before = l.confidence; l.text = text; if (changed) { l.spans = []; l.confidence = Math.max(l.confidence, 0.99); }
  b.text = blockTextMd(b); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = changed ? "edited" : "accepted";
  syncDocument(d); recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
function recount(d) { const all = d.result.blocks.flatMap(x => x.lines || []).filter(x => x.text); d.chars = all.reduce((a, x) => a + x.text.length, 0); d.avg_conf = all.reduce((a, x) => a + x.confidence, 0) / Math.max(1, all.length); d.low = all.filter(x => x.confidence < LOW).length; }
function download(name, data, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------------------------------------------------------------- Word export (docx library, in the browser) */
let docxLib = null;
async function loadDocx() { if (docxLib) return docxLib; if (!window.docx) { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/docx@9.15.3/dist/index.iife.js"; s.onload = res; s.onerror = () => rej(new Error("docx library not found")); document.head.appendChild(s); }); } docxLib = window.docx; return docxLib; }
const dataUrlBytes = u => { const b = atob(u.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
function docxParagraphs(D, page) {
  const {Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TabStopType, TabStopPosition, LeaderType, Tab} = D, out = [], W = page.width, doc = page.document;
  const none = {style: BorderStyle.NONE, size: 0, color: "FFFFFF"}, noBorders = {top: none, bottom: none, left: none, right: none};
  const contentW = Math.max(1, W - ((doc && doc.margins) ? doc.margins.left + doc.margins.right : 0.16 * W)), pageWidthTwips = 9026; // A4 text width at 2 cm margins
  const align = a => a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
  const byId = Object.fromEntries(page.blocks.map(b => [b.id, b])), colW = columnWidths(page);
  const lineRuns = e => { const b = byId[e.block]; if (!b || !(e.lines || []).length || !(T.pipeline && T.pipeline.runsWithBreaks)) return null; const want = new Set(e.lines), pl = (b.lines || []).filter(l => want.has(l.reading_order) && l.text); return pl.length ? T.pipeline.runsWithBreaks(pl, colW(e.block)) : null; };
  // wrapped lines flow as one paragraph; a break that was kept on purpose (stacked title lines, addresses) is a Word line break
  const runs = (e, fallbackBold) => (lineRuns(e) || (e.runs && e.runs.length ? e.runs : [{text: e.text || "", bold: !!fallbackBold}])).flatMap(r => String(r.text).split("\n").map((t, k) => new TextRun({text: t, break: k ? 1 : undefined, bold: !!r.bold || !!fallbackBold, italics: e.style && e.style.slant === "italic", font: e.style && e.style.family && !/^Latin/.test(e.style.family) ? e.style.family : undefined, size: e.style && e.style.font_px ? Math.max(16, Math.round(e.style.font_px / W * 1190)) : undefined})));
  const one = e => {
    if (e.type === "row" || e.type === "footer_row") { e.columns.forEach(c => c.elements.forEach(one)); return; }
    if (e.type === "list") { e.items.forEach(it => out.push(new Paragraph({children: runs(it), bullet: {level: Math.min(8, it.level || 0)}, alignment: align(e.align)}))); return; }
    if (e.type === "figure" || e.type === "decoration") { if (!e.crop) return; try { const wIn = Math.max(0.3, Math.min(6.3, 6.3 * (e.box[2] / contentW))), hIn = wIn * (e.box[3] / Math.max(1, e.box[2])); out.push(new Paragraph({alignment: align(e.align), children: [new ImageRun({type: "png", data: dataUrlBytes(e.crop), transformation: {width: Math.round(wIn * 96), height: Math.round(hIn * 96)}})]})); } catch (err) { console.warn(err); } return; }
    if (e.type === "table" && e.table) { const t = e.table, total = Math.max(1, t.cols[t.cols.length - 1].x1 - t.cols[0].x0), widths = t.cols.map(c => Math.max(300, Math.round(9026 * (c.x1 - c.x0) / total)));
      out.push(new Table({width: {size: 9026 * Math.min(1, total / contentW), type: WidthType.DXA}, columnWidths: widths, rows: t.rows.map(r => new TableRow({children: r.cells.map((c, i) => new TableCell({width: {size: c.colspan > 1 ? widths.reduce((p, q) => p + q, 0) : widths[i], type: WidthType.DXA}, columnSpan: c.colspan > 1 ? c.colspan : undefined, borders: t.borders ? undefined : noBorders, children: (c.text || "").split("\n").map(tx => new Paragraph({alignment: align(c.colspan > 1 ? "left" : t.cols[i].align), children: runs({text: tx, style: e.style}, c.colspan > 1)}))}))}))}));
      out.push(new Paragraph({children: [], spacing: {after: 60}})); return; }
    if ((e.text || "").includes("\t") && e.type === "paragraph") { const [before, after] = e.text.split("\t"); out.push(new Paragraph({tabStops: [{type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT}], children: [...runs({text: before, style: e.style}), new TextRun({children: [new Tab(), after || ""], font: e.style && e.style.family && !/^Latin/.test(e.style.family) ? e.style.family : undefined})]})); return; }
    if (e.type === "heading") { out.push(new Paragraph({children: runs(e, true), heading: e.heading === 1 ? HeadingLevel.HEADING_1 : e.heading === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, alignment: align(e.align)})); return; }
    out.push(new Paragraph({children: runs(e), alignment: align(e.align), indent: e.level ? {left: 720 * e.level} : (e.first_line_indent ? {firstLine: 720} : undefined), spacing: {after: 120}}));
  };
  if (doc && doc.elements) doc.elements.forEach(one);
  else [...page.blocks].sort((a, b) => a.reading_order - b.reading_order).forEach(b => { if (b.crop && b.crop.url) one({type: "figure", crop: b.crop.url, box: [b.box.x, b.box.y, b.box.width, b.box.height], align: b.align}); else b.lines.filter(l => l.text).forEach(l => out.push(new Paragraph({children: [new TextRun({text: (l.bullet ? l.bullet + " " : "") + l.text})]}))); });
  void pageWidthTwips; return out;
}
async function exportDocx(docs) {
  toast("Building Word file…");
  try { const D = await loadDocx(); const sections = docs.map((d, i) => ({properties: {page: {margin: {top: 1134, bottom: 1134, left: 1134, right: 1134}}}, children: docxParagraphs(D, d.result)}));
    const file = new D.Document({creator: "ThaOCR", title: docTitle(docs[0]), styles: {default: {document: {run: {font: "Khmer OS Siemreap", size: 22}}}}, sections});
    const blob = await D.Packer.toBlob(file); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = docTitle(docs[0]) + ".docx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast("Downloaded"); }
  catch (e) { console.error(e); toast("Export failed: " + String(e.message || e).slice(0, 80)); }
}

/* ---------------------------------------------------------------- documents / settings / help */
function renderDocuments() {
  const filter = q => store.docs.filter(d => !q || d.filename.toLowerCase().includes(q.toLowerCase()) || pageText(d.result).includes(q));
  const n = groups(store.docs).length;
  view.innerHTML = `<div class="head"><div class="grow"><h1>Documents</h1><p>${n ? `${plural(n, "document")} on this device` : "Nothing saved yet"}</p></div>
    <div class="tools doctools">${n ? `<label class="search">${icon("search", "s")}<input id="q" type="search" placeholder="Search name or text" aria-label="Search documents"></label><button class="btn danger" id="d_clear">${icon("trash")}Clear all</button>` : ""}<a class="btn p" href="#/scan">${icon("plus")}New scan</a></div></div>
    <div class="card" id="doclist">${docsTable(store.docs)}</div>
    ${n ? `<p class="fine">${icon("shield", "s")}Stored in this browser only, with no backup. Export what you need.</p>` : ""}`;
  wireDocsTable();
  if ($("#q")) $("#q").oninput = e => { const q = e.target.value.trim(); $("#doclist").innerHTML = docsTable(filter(q), !!q); wireDocsTable(); };
  if ($("#d_clear")) $("#d_clear").onclick = async () => {
    if (ocrBusy()) { busyToast(); return; }
    const m = groups(store.docs).length; if (!m) { renderDocuments(); return; }  // counted now: a scan may have finished since the list was drawn
    if (!confirm(`Delete ${m === 1 ? "1 document" : `all ${m} documents`} from this browser?\n\nExport anything you want to keep first. This cannot be undone.`)) return;
    await store.clear(); sidebar(); renderDocuments(); view.focus({preventScroll: true}); toast("All documents deleted"); };
}
async function renderSettings() {
  view.innerHTML = `<div class="head"><div class="grow"><h1>Settings</h1></div></div><div class="chips"><span class="chip"><span class="spin"></span>Loading…</span></div>`;
  await T.loadManifestSafe(); if (!RECO) await deviceCheck();
  const choice = chosenModels(), b = T.benchmarkStored(), tier = store.settings.tier || RECO.tier, tp = themePref();
  const stage = (k, title, sub) => { const opts = T.modelsFor(k); return `<div class="field"><label for="m_${k}">${title}</label><div class="sel"><select id="m_${k}" data-stage="${k}">${opts.map(m => `<option value="${esc(m.id)}" ${m.id === choice[k] ? "selected" : ""}>${esc(m.label || m.id)}${T.manifest.sizes && T.manifest.sizes[m.file] ? " · " + T.fmtBytes(T.manifest.sizes[m.file]) : ""}</option>`).join("")}</select></div><div class="small mut">${sub}</div></div>`; };
  const sr = await storageReport(); const bytes = Math.max(0, sr.usage - sr.models);
  const dev = [plural(DEVICE.threads, "thread"), DEVICE.memoryGB ? DEVICE.memoryGB + " GB" : "", DEVICE.webgpu ? "WebGPU" + (DEVICE.gpuName ? " (" + esc(DEVICE.gpuName) + ")" : "") : "no WebGPU", DEVICE.threadsOK ? "" : "single-thread", DEVICE.mobile ? "mobile" : ""].filter(Boolean).join(" · ");
  const opt = (v, cur, t) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`;
  view.innerHTML = `<div class="head"><div class="grow"><h1>Settings</h1><p>For this browser only.</p></div></div>
  ${ocrBusy() ? `<div class="note">${icon("info")}<div>OCR is running. Changes to models and stored data wait until it finishes.</div></div>` : ""}
  <div class="grid g-main"><div class="col">
   <div class="card pad"><h2>Appearance</h2>
    <div class="row-set"><div class="grow">Theme</div><div class="seg" id="s_theme" role="group" aria-label="Theme">${[["system", "System", "monitor"], ["light", "Light", "sun"], ["dark", "Dark", "moon"]].map(([k, t, ic]) => `<button type="button" data-v="${k}" class="${tp === k ? "on" : ""}" aria-pressed="${tp === k}">${icon(ic, "s")}${t}</button>`).join("")}</div></div></div>
   <div class="card pad"><h2>Performance</h2>
    <p class="small mut" style="margin:-6px 0 14px" title="${esc(RECO.reasons.join(" · "))}">${icon("cpu", "s")} ${dev}</p>
    <div class="field"><label>Model set</label><div class="tiers" id="s_tiers">${["high", "mid", "low"].map(t => `<button type="button" class="tier ${tier === t ? "on" : ""}" data-t="${t}" aria-pressed="${tier === t}" title="${TIER_TECH[t]}"><b>${TIER_LABEL[t]}</b><span>${TIER_SUB[t]}</span>${RECO.tier === t ? `<i class="rec">Recommended</i>` : ""}</button>`).join("")}</div></div>
    <div class="field"><label for="s_backend">Compute</label><div class="sel"><select id="s_backend">${opt("auto", store.settings.backend, "Automatic")}${opt("webgpu", store.settings.backend, "GPU (WebGPU)")}${opt("wasm", store.settings.backend, "CPU (WebAssembly)")}</select></div></div>
    ${b ? `<div class="kv"><span>Speed</span><b title="Regions ${fmtMs(b.layoutMs)} · lines ${fmtMs(b.detMs)} · ${b.recMsPerLine.toFixed(0)} ms per text line · ${b.backend}">~${T.estimate(b, 40)} s per page</b></div>` : `<p class="small mut" style="margin:0">Speed is measured after the first load.</p>`}
    <div class="btnrow"><button class="btn sm" id="s_bench">${icon("refresh", "s")}Measure again</button><button class="btn sm" id="s_load">${icon("download", "s")}Load models now</button></div></div>
   <div class="card pad"><h2>Layout</h2>
    <div class="field" style="margin:0"><label for="s_rules">Page analysis</label><div class="sel"><select id="s_rules">${opt("rules", store.settings.rules !== false ? "rules" : "model", "Models + layout rules (recommended)")}${opt("model", store.settings.rules !== false ? "rules" : "model", "Models only")}</select></div><div class="small mut">Rules join paragraphs, tables and label columns. Applies to the next scan.</div></div></div>
   <details class="card adv"><summary><span class="grow"><b>Models</b><span class="small mut">Advanced · overrides the model set</span></span>${icon("chevron-down")}</summary><div class="adv-body">
    ${stage("layout", "Layout", "Paragraphs, tables, stamps, logos")}${stage("textdet", "Text lines", "Finds each line")}${stage("rec", "Recogniser", "Reads Khmer &amp; English · int8 is faster, fp32 more accurate")}${stage("font", "Fonts", "Typeface, weight and size")}${stage("structure", "Structure", "Paragraphs and reading order")}
    <button class="btn sm ghost" id="s_reset">${icon("undo", "s")}Use recommended</button></div></details></div>
   <div class="col"><div class="card pad"><h2>Storage</h2>
     <div class="kv"><span>Documents</span><b>${plural(store.docs.length, "page")} · ${fmtSize(bytes)}</b></div>
     <div class="kv"><span>Models</span><b>${sr.modelFiles ? `${plural(sr.modelFiles, "file")} · ${fmtSize(sr.models)}` : "None"}</b></div>
     <div class="kv"><span>Total</span><b>${sr.usage ? `${fmtSize(sr.usage)}${sr.quota ? ` of ${fmtSize(sr.quota)}` : ""}` : "Unknown"}</b></div>
     <div class="btnrow"><button class="btn sm" id="s_clear">${icon("trash", "s")}Delete documents</button><button class="btn sm" id="s_cache">${icon("x", "s")}Remove models</button></div></div>
   <div class="card pad"><h2>Improve the models</h2><p class="small mut" style="margin:-6px 0 14px">Your corrected lines are training data. Export and share them to retrain the recogniser. Nothing is sent automatically.</p><button class="btn" id="s_corr">${icon("download")}Export corrections (${correctedLines().length})</button></div>
   <div class="card pad danger"><h2>Reset</h2><p class="small mut" style="margin:-6px 0 14px">Removes all documents, models and settings from this browser.</p><button class="btn danger" id="s_wipe">${icon("trash")}Reset everything</button></div></div></div>`;
  view.querySelectorAll("#s_theme button").forEach(x => x.onclick = () => setTheme(x.dataset.v));
  $("#s_rules").onchange = e => { store.settings.rules = e.target.value === "rules"; store.save(); applyScale(); toast("Saved · applies to the next scan"); };
  $("#s_backend").onchange = e => { store.settings.backend = e.target.value; store.save(); resetModels(); renderSettings(); };
  view.querySelectorAll("#s_tiers .tier").forEach(t => t.onclick = () => { store.settings.tier = t.dataset.t === RECO.tier ? null : t.dataset.t; store.settings.models = {}; const fake = T.recommend(Object.assign({}, DEVICE, {webgpu: t.dataset.t === "high", mobile: t.dataset.t === "low", threads: t.dataset.t === "high" ? 8 : t.dataset.t === "low" ? 4 : 6, memoryGB: t.dataset.t === "low" ? 4 : 8})); RECO = Object.assign({}, RECO, {choice: fake.choice, scale: fake.scale}); store.settings.longMin = null; store.settings.longMax = null; store.save(); resetModels(); renderSettings(); });
  view.querySelectorAll("select[data-stage]").forEach(sel => sel.onchange = () => { store.settings.models = Object.assign({}, store.settings.models, {[sel.dataset.stage]: sel.value}); store.save(); resetModels(); toast("Saved · loads on the next scan"); });
  $("#s_reset").onclick = () => { store.settings.models = {}; store.settings.tier = null; store.save(); resetModels(); deviceCheck().then(renderSettings); };
  $("#s_bench").onclick = async () => { toast("Measuring…"); try { await ensureModels(); await T.benchmark(); renderSettings(); toast("Done"); } catch (e) { toast("Failed: " + e.message); } };
  $("#s_load").onclick = async () => { try { await ensureModels((m) => toast(m)); renderSettings(); } catch (e) { toast("Failed: " + e.message); } };
  $("#s_clear").onclick = async () => { if (confirm("Delete all documents from this browser? This cannot be undone.")) { await store.clear(); sidebar(); renderSettings(); toast("Documents deleted"); } };
  $("#s_cache").onclick = async () => { await T.clearModelCache(); localStorage.removeItem("thaocr.device.v1"); resetModels(); toast("Models removed"); renderSettings(); };
  $("#s_corr").onclick = exportCorrections;
  $("#s_wipe").onclick = async () => {
    if (!confirm("Reset ThaOCR in this browser?\n\nAll documents, edits, downloaded models and settings on this device will be removed. Export anything you want to keep first.\n\nThis cannot be undone.")) return;
    const b = $("#s_wipe"); b.disabled = true; b.textContent = "Resetting…";
    try { const before = await resetEverything();
      sessionStorage.setItem("thaocr.resetMsg", before.usage ? `Reset done · ${fmtSize(before.usage)} freed` : "Reset done"); }
    catch (e) { console.error(e); toast("Reset failed: " + e.message); b.disabled = false; return; }
    location.hash = "#/scan"; location.reload(); };
  // While a scan or re-run is running, changes that unload the models or remove data wait: they would break that run
  // ("models not loaded"). The theme and exporting corrections stay available.
  const guard = (el, ev) => { if (!el || !el[ev]) return; const h = el[ev]; el[ev] = e => { if (ocrBusy()) { toast("OCR is running · change this when it finishes"); renderSettings(); return; } return h.call(el, e); }; };
  ["#s_rules", "#s_backend"].forEach(sel => guard($(sel), "onchange")); view.querySelectorAll("select[data-stage]").forEach(el => guard(el, "onchange"));
  view.querySelectorAll("#s_tiers .tier").forEach(el => guard(el, "onclick")); ["#s_reset", "#s_bench", "#s_load", "#s_clear", "#s_cache", "#s_wipe"].forEach(sel => guard($(sel), "onclick"));
}
/* ---------------------------------------------------------------- corrections -> training data */
function correctedLines() { const out = []; for (const d of store.docs) for (const b of d.result.blocks) for (const l of (b.lines || [])) { const k = lineKey(b, l); if ((d.reviewed || {})[k] === "edited" && l.text) out.push({d, b, l}); } return out; }
async function exportCorrections() {
  const items = correctedLines(); if (!items.length) { toast("No corrections yet"); return; }
  toast(`Packing ${plural(items.length, "line")}…`);
  const imgs = new Map(), rows = [];
  for (const {d, b, l} of items) {
    let im = imgs.get(d.page_id); if (!im) { im = new Image(); im.src = d.image_url; try { await im.decode(); } catch { continue; } imgs.set(d.page_id, im); }
    const pad = l.box.height * 0.25, sx = Math.max(0, l.box.x - pad), sy = Math.max(0, l.box.y - pad * 0.5), sw = Math.min(d.width - sx, l.box.width + 2 * pad), sh = Math.min(d.height - sy, l.box.height + pad);
    const c = document.createElement("canvas"); c.width = Math.round(sw); c.height = Math.round(sh); c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
    rows.push({text: l.text, image_png_base64: c.toDataURL("image/png").split(",")[1], width: c.width, height: c.height, source: d.result.source || "ocr", block: b.cls, confidence_before: l.confidence_before ?? null, document: groupName(d), page: pageNo(d), page_id: d.page_id, line: l.reading_order});
  }
  const meta = {format: "thaocr-corrections/1", exported: new Date().toISOString(), lines: rows.length, note: "Each item is a line crop (PNG) with the text as corrected by the user. Grey-scale, height-normalise to 48 px and train the CRNN with training/rec."};
  download(`thaocr-corrections-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({meta, items: rows}), "application/json"); toast(`Exported ${plural(rows.length, "line")}`);
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
  const tile = (ic, t, p) => `<div class="card tile"><div class="ti">${icon(ic)}</div><b>${t}</b><p>${p}</p></div>`;
  const keys = [["<kbd>Ctrl</kbd> <kbd>V</kbd>", "Paste an image or PDF"], ["<kbd>F</kbd>", "Full-size page (review)"], ["<kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd>", "Zoom in, out, fit (full-size view)"], ["<kbd>Esc</kbd>", "Close full-size view or menu"], ["<kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>S</kbd>", "Show or hide the sidebar"]];
  view.innerHTML = `<div class="head"><div class="grow"><h1>Help</h1><p>Quick tips for the best results.</p></div></div>
  <div class="tiles">
   ${tile("shield", "Private", "Runs in your browser. Files are never uploaded. No account, no server.")}
   ${tile("folder", "Saved on this device", "Kept in this browser only. Clearing site data deletes them, so export to keep.")}
   ${tile("camera", "Better photos", "Flat page, even light, at least 1500 px wide or a 300 DPI scan.")}
   ${tile("file", "PDF files", "Pages with text are read exactly, without OCR. Scans use OCR. Wrong text? Use <b>Run OCR instead</b>.")}
   ${tile("pencil", "Check &amp; edit", `Lines under ${Math.round(LOW * 100)}% confidence are highlighted. Click any text to fix it.`)}
   ${tile("download", "Export", "Word keeps headings, tables, fonts and images. Text and JSON too.")}
   ${tile("select", "Select", "Drag a box over part of a page to read and copy only that part.")}
   ${tile("clock", "Speed", "First visit downloads ~40 MB once. Seconds per page on a laptop, longer on a phone.")}
  </div>
  <div class="card pad"><h2>Shortcuts</h2><div class="keys">${keys.map(([k, t]) => `<span>${k}</span><span>${t}</span>`).join("")}</div></div>`;
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
      catch (e) { toast("Can't open " + f.name); } }
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
  if (!f.linesP) f.linesP = (async () => { const hint = $("#s_hint"); if (!T.loaded() && hint) hint.innerHTML = `<span class="spin" style="vertical-align:-2px"></span> Loading models (first time only)…`;
    try { await ensureModels(); } finally { const h = $("#s_hint"); if (h) h.innerHTML = `${icon("select", "s")} Drag to select`; } applyScale(); const im = await selImage(f); const ls = await T.detectLines(im.canvas); return ls.map(l => Object.assign(l, {bbox: l.bbox || T.util.bboxOf(l.quad)})); })();
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
function selCopy(text) { if (!text) { toast("Nothing to copy"); return; } navigator.clipboard.writeText(text).then(() => toast("Copied"), () => toast("Copy blocked by the browser")); }
function renderSelect() {
  const f = SEL.files[SEL.cur];
  view.innerHTML = `
  <div class="head"><div class="grow"><h1>Select</h1><p>Drag a box over text to read and copy it. Nothing is saved.</p></div>
    <div class="tools"><label class="tg" title="Copy each new result to the clipboard"><input type="checkbox" id="s_auto" ${SEL.autoCopy ? "checked" : ""}>Auto-copy</label>
      ${SEL.files.length ? `<button class="btn p" id="s_add">${icon("plus")}Add files</button>` : ""}</div></div>
  ${!SEL.files.length ? `<div class="drop sel-empty" id="s_drop"><div class="ico">${icon("select", "l")}</div><div class="grow"><b>Drop files here</b><div class="small">Images or PDF · or paste with Ctrl+V</div></div>
    <div class="acts"><button class="btn p" id="s_browse">${icon("folder")}Choose files</button><button class="btn" id="s_cam">${icon("camera")}Camera</button></div></div>` : `
  <div class="sel-grid">
   <div class="sel-files card" id="s_files">${SEL.files.map((x, i) => `<button class="sel-file ${i === SEL.cur ? "cur" : ""}" data-i="${i}" title="${esc(x.name)}"><span class="th">${x.thumb ? `<img src="${x.thumb}" alt="">` : icon("image")}</span><span class="nm">${esc(x.name)}</span>${x.boxes.length ? `<span class="count">${x.boxes.length}</span>` : ""}<span class="rm" data-rm="${i}" title="Remove" aria-label="Remove">${icon("x", "s")}</span></button>`).join("")}</div>
   <div class="card sel-stage-card"><div class="panehead"><span class="ph-t">${esc(f.name)}</span><div class="grow"></div><span class="small mut" id="s_hint">${icon("select", "s")} Drag to select</span></div>
     <div class="stage sel-stage" id="s_drop"><div class="sel-page" id="s_page"><div class="sel-wait" id="s_wait"><span class="spin"></span> Opening…</div></div></div></div>
   <div class="sel-results" id="s_res"></div>
  </div>`}`;
  if ($("#s_add")) $("#s_add").onclick = () => pickFiles(selAdd); if ($("#s_browse")) { $("#s_browse").onclick = () => pickFiles(selAdd); $("#s_cam").onclick = () => pickFiles(selAdd, true); }
  $("#s_auto").onchange = e => { SEL.autoCopy = e.target.checked; localStorage.setItem("thaocr.selAutoCopy", SEL.autoCopy ? "1" : "0"); };
  if ($("#s_drop")) wireDrop($("#s_drop"), selAdd); clickToBrowse($(".drop#s_drop"), $("#s_browse"));
  if (!f) return;
  view.querySelectorAll(".sel-file").forEach(b => b.onclick = e => { const rm = e.target.closest("[data-rm]");
    if (rm) { const i = +rm.dataset.rm; SEL.files.splice(i, 1); SEL.cur = Math.min(SEL.cur >= i && SEL.cur > 0 ? SEL.cur - 1 : SEL.cur, SEL.files.length - 1); renderSelect(); return; }
    SEL.cur = +b.dataset.i; renderSelect(); });
  selResults(f);
  // thumbnails of files not decoded yet
  SEL.files.forEach((x, i) => { if (!x.thumb) selImage(x).then(() => { const b = view.querySelector(`.sel-file[data-i="${i}"] .th`); if (b && SEL.files[i] === x) b.innerHTML = `<img src="${x.thumb}" alt="">`; }).catch(() => { }); });
  selImage(f).then(im => { if (SEL.files[SEL.cur] !== f || !$("#s_page")) return; selMountPage(f, im); selLines(f).catch(e => toast("Models: " + e.message)); })
    .catch(e => { $("#s_wait").textContent = "Can't open this file: " + e.message; });
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
  el.innerHTML = `<div class="card sel-reshead"><b class="grow">Selections${f.boxes.length ? ` · ${f.boxes.length}` : ""}</b>${f.boxes.length > 1 ? `<button class="btn sm" id="s_copyall">${icon("copy", "s")}Copy all</button>` : ""}${f.boxes.length ? `<button class="btn sm ghost icon" id="s_clear" title="Remove all boxes" aria-label="Remove all boxes">${icon("trash", "s")}</button>` : ""}</div>
   ${f.boxes.length ? f.boxes.map((b, i) => `<div class="card sel-item ${b.id === f.focus ? "focus" : ""}" data-id="${b.id}">
      <div class="sel-ih"><span class="tag">${i + 1}</span><span class="small mut grow">${b.state === "reading" ? "Reading…" : b.state === "failed" ? "Failed" : `${plural(b.lines || 0, "line")} · ${Math.round((b.conf || 0) * 100)}% · ${fmtMs(b.ms || 0)}`}</span>
        <button class="btn sm" data-copy="${b.id}" ${b.state !== "done" ? "disabled" : ""}>${icon("copy", "s")}Copy</button><button class="btn sm ghost icon" data-del="${b.id}" title="Remove" aria-label="Remove selection ${i + 1}">${icon("x", "s")}</button></div>
      ${b.state === "reading" ? `<div class="sel-skel"><i></i><i></i><i></i></div>` : b.state === "failed" ? `<div class="small" style="color:var(--bad)">${esc(b.err || "")}</div>` : `<textarea class="sel-text" data-id="${b.id}" rows="${Math.min(10, Math.max(2, (b.text.match(/\n/g) || []).length + 1))}" spellcheck="false" placeholder="No text found" aria-label="Text of selection ${i + 1}">${esc(b.text)}</textarea>`}</div>`).join("")
     : `<div class="card sel-hint">${icon("select", "l")}<span>Draw a box on the page.<br>The text appears here.</span></div>`}`;
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
const TITLES = {scan: "Scan", select: "Select", process: "Processing", review: "Review", documents: "Documents", settings: "Settings", help: "Help"};
function route(e) { closeMenus(); const [, r = "scan", arg = ""] = location.hash.split("/"); sidebar(); document.title = (TITLES[r] ? TITLES[r] + " · " : "") + "ThaOCR";
  const wide = r === "review" || r === "select"; view.classList.toggle("wide", wide); $(".topbar").classList.toggle("wide", wide);
  view.classList.add("enter"); clearTimeout(route.t); route.t = setTimeout(() => view.classList.remove("enter"), 350);  // entry animation on page change only, not on re-renders
  (ROUTES[r] || renderScan)(arg); window.scrollTo(0, 0);
  if (e && e.type === "hashchange" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".page"))) view.focus({preventScroll: true});  // screen readers land on the new page
}
window.addEventListener("hashchange", route);
(async () => {
  $(".skip").onclick = e => { e.preventDefault(); view.focus(); };  // "#view" would be read as a route
  applyTheme(); document.querySelectorAll(".themetog").forEach(b => b.onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
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
  if (!seenBefore || hard) { $("#notice").classList.remove("hide"); setTimeout(() => $("#notice_ok").focus(), 60); }
  $("#notice_ok").onclick = () => { $("#notice").classList.add("hide"); if (!seenBefore) { store.settings.noticeSeen = true; store.save(); preload(); } };
  if (!location.hash) location.hash = "#/scan"; else route(); sidebar();
  try { await deviceCheck(); } catch (e) { console.warn(e); }
  sidebar(); if (location.hash === "#/scan") renderScan();
  // warm up in the background on capable devices: the first scan then starts at once
  if (seenBefore) preload(); // nothing is downloaded before the user has read the notice the first time
})();
