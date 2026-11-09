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
  settings: {output: "docx", name: "Local user", models: {}, backend: "auto", tier: null, noticeSeen: false, longMin: null, longMax: null},
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
T.loadManifestSafe = async () => { if (T.manifest) return T.manifest; const r = await fetch(T.config.manifestBase + "models.json"); T.manifest = await r.json(); return T.manifest; };
function chosenModels() { const base = RECO ? RECO.choice : (T.manifest ? T.manifest.defaults : {}); return Object.assign({}, base, store.settings.models || {}); }
function applyScale() { const sc = RECO ? RECO.scale : {longMin: 1600, longMax: 2200}; T.config.longMin = store.settings.longMin || sc.longMin; T.config.longMax = store.settings.longMax || sc.longMax; T.config.backend = store.settings.backend || "auto"; }
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
  const S = Math.max(1, page.width / 1000), c = canvas.getContext("2d");
  canvas.width = page.width; canvas.height = page.height; c.drawImage(img, 0, 0, page.width, page.height);
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
function blockTextMd(b) { return (b.lines || []).filter(l => l.text).map(l => "\t".repeat(l.indent_level || 0) + (l.bullet ? l.bullet + " " : "") + l.text).join("\n"); }
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
  $("#n_docs").textContent = store.docs.length || "";
  const running = JOB && JOB.status === "running";
  $("#running").classList.toggle("hide", !running || r === "process");
  if (running) { $("#running_pct").textContent = Math.round(JOB.done / JOB.total * 100) + "%"; }
  $("#dev").textContent = T.loaded() ? (T.backendUsed === "webgpu" ? "GPU" : "CPU") + " · models ready" : DEVICE ? `${DEVICE.threads} threads${DEVICE.webgpu ? " · WebGPU" : ""}` : "checking device…";
}
const docTitle = d => d.filename.replace(/\.[^.]+$/, "");
const outputSel = (id, cur) => `<select id="${id}">${[["docx", "Word (.docx)"], ["txt", "Plain text"], ["json", "JSON"]].map(([k, t]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
const TIER_LABEL = {high: "Best quality", mid: "Balanced", low: "Light"};

/* ---------------------------------------------------------------- documents table (shared) */
function docsTable(docs) {
  if (!docs.length) return `<div class="empty">No documents yet. Scan a page to start.</div>`;
  return `<table class="tbl"><thead><tr><th>Document</th><th>Status</th><th>Confidence</th><th>Scanned</th><th></th></tr></thead><tbody>
  ${docs.map(d => { const [st, cls] = docStatus(d); const pc = Math.round(d.avg_conf * 1000) / 10; return `<tr class="click" data-id="${d.page_id}">
   <td><div class="doc"><div class="ic"><img src="${d.image_url}" alt=""></div><div><b>${esc(d.filename)}</b><span>${d.lines} lines · ${d.width}×${d.height}${d.size ? " · " + fmtSize(d.size) : ""}${d.result && d.result.source === "pdf-text" ? " · PDF text" : ""}</span></div></div></td>
   <td><span class="badge ${cls}"><span class="dot"></span>${st}</span></td>
   <td><span class="acc"><span class="bar"><i class="${pc >= 95 ? "ok" : "warn"}" style="width:${pc}%"></i></span><span class="mono">${pc.toFixed(1)}%</span></span></td>
   <td class="mut">${when(d.created)}</td>
   <td style="width:48px"><div class="rel"><button class="btn ghost sm more" data-id="${d.page_id}" title="More">${icon("more")}</button></div></td></tr>`; }).join("")}</tbody></table>`;
}
function wireDocsTable() {
  view.querySelectorAll("tr.click").forEach(tr => tr.onclick = e => { if (e.target.closest(".more") || e.target.closest(".menu")) return; location.hash = "#/review/" + tr.dataset.id; });
  view.querySelectorAll(".more").forEach(btn => btn.onclick = e => { e.stopPropagation(); closeMenus(); const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<button data-a="open">${icon("external")}Open</button><button data-a="docx">${icon("file")}Download Word</button><button data-a="txt">${icon("list")}Download text</button><hr><button data-a="rerun">${icon("refresh")}Run OCR again</button><button data-a="del" class="danger">${icon("trash")}Delete</button>`;
    btn.parentElement.appendChild(m); m.onclick = async ev => { const a = ev.target.closest("button")?.dataset.a, d = store.get(btn.dataset.id); closeMenus(); if (!d) return;
      if (a === "open") location.hash = "#/review/" + d.page_id; if (a === "rerun") await rerun(d); if (a === "docx") exportDocx([d]); if (a === "txt") download(docTitle(d) + ".txt", pageText(d.result), "text/plain;charset=utf-8");
      if (a === "del") { await store.del(d.page_id); route(); toast("deleted"); } }; });
}
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.remove()); }
document.addEventListener("click", e => { if (!e.target.closest(".menu") && !e.target.closest(".more") && !e.target.closest("#r_export")) closeMenus(); });

/* ---------------------------------------------------------------- scan (home) */
function pickFiles(cb, camera) { const inp = $("#fileinput"); if (camera) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture"); inp.value = ""; inp.onchange = () => cb([...inp.files]); inp.click(); }
function wireDrop(el, cb) { el.ondragover = e => { e.preventDefault(); el.classList.add("on"); }; el.ondragleave = () => el.classList.remove("on"); el.ondrop = e => { e.preventDefault(); el.classList.remove("on"); cb([...e.dataTransfer.files].filter(f => /^image\//.test(f.type) || /\.(tiff?)$/i.test(f.name) || T.pdf.isPdf(f))); }; }
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith("image/") || T.pdf.isPdf(x)); if (f.length) addAndShow(f); });
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
        const pages = Array.from({length: n}, (_, k) => ({name: n > 1 ? `${base} · page ${k + 1}` : f.name, url: k === 0 ? f.url : "", size: k === 0 ? f.size : 0, status: "queued", page_id: null, error: null, src: f.src, pdf: {page: k + 1, pages: n}}));
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
          res = await T.pdf.processPage(doc, f.pdf.page, {forceOcr: !probe.usable, onStep: s => { JOB.step = s; renderIfProcess(); }}); }
        else { await needModels(); res = await T.process(f.src.file, s => { JOB.step = s; renderIfProcess(); }); }
        res.client_ms = performance.now() - t0;
        const doc = summarize(res, f.name, JOB.id, f.size); await store.put(doc, res.image_blob); f.status = "done"; f.page_id = res.page_id; f.url = doc.image_url; JOB.results.push(doc.result); JOB.lastImage = doc.image_url;
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
  view.innerHTML = `
  <div class="head"><div class="grow"><h1>${JOB.load ? "Getting ready…" : running ? "Reading your document…" : "Done"}</h1><p>${esc(JOB.name)}${JOB.total > 1 ? ` · file ${Math.min(JOB.done + 1, JOB.total)} of ${JOB.total}` : ""} · on this device</p></div>
    ${running ? `<a class="btn" href="#/scan">Keep working, I'll wait</a>` : `<a class="btn p lg" href="#/review/${esc((JOB.files.find(x => x.page_id) || {}).page_id || "")}">Review results ${icon("arrow-right")}</a>`}</div>
  <div class="grid g-main">
   <div class="card"><div class="panehead"><span style="color:var(--ink)">${esc(cur.name)}</span><div class="grow"></div><span class="badge ${running ? "ink" : "ok"}"><span class="dot"></span>${JOB.load ? "Loading models" : running ? "Working" : "Finished"}</span></div>
    <div class="stage"><div class="pageimg" id="p_stage"><img id="p_img" src="${esc(last && last.page_id === cur.page_id ? JOB.lastImage : cur.url)}" alt="" style="display:block;max-width:100%;max-height:70vh"><canvas id="p_cv" class="hide"></canvas>${running && cur.status === "running" && !JOB.load ? '<div class="scanline"></div>' : ""}</div></div></div>
   <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card pad"><div style="display:flex;align-items:baseline;gap:14px"><div class="prog">${pct}%</div><div class="mut small grow" style="text-align:right">${JOB.load ? esc(JOB.load.msg) : remaining}</div></div><div class="bar" style="height:8px;margin-top:12px"><i style="width:${pct}%"></i></div>
      ${JOB.load ? `<div class="small mut" style="margin-top:10px">First visit: the OCR models are downloaded once and kept in this browser. Later scans start immediately.</div>` : ""}</div>
    <div class="card pad"><div class="pipe">${stepsHtml.map(([tt, s, done, ms], i) => `<div class="step ${done ? "done" : running && !JOB.load && i === Math.max(0, si) ? "run" : ""}"><span class="n">${done ? icon("check", "s") : i + 1}</span><div class="grow"><b>${tt}</b>${s ? `<span>${esc(s)}</span>` : ""}</div>${ms != null ? `<span class="ms mono">${fmtMs(ms)}</span>` : ""}</div>`).join("")}</div></div>
    ${JOB.total > 1 ? `<div class="card pad">${JOB.files.map(f => `<div class="kv"><span style="color:var(--ink)">${esc(f.name)}</span><span class="badge ${f.status === "done" ? "ok" : f.status === "failed" ? "bad" : f.status === "running" ? "ink" : ""}">${f.status === "done" ? "Done" : f.status === "failed" ? "Failed" : f.status === "running" ? "Working" : "Waiting"}</span></div>`).join("")}</div>` : ""}
    ${failed.length ? `<div class="note">${icon("alert")}<div>${failed.map(f => `<b>${esc(f.name)}</b>: ${esc(f.error)}`).join("<br>")}</div></div>` : ""}</div></div>`;
  if (last && last.page_id === cur.page_id) { const img = $("#p_img"), cv = $("#p_cv"); img.onload = () => { drawOriginal(cv, img, last, {boxes: true, labels: false, lines: true}); cv.classList.remove("hide"); cv.style.maxWidth = "100%"; cv.style.maxHeight = "70vh"; cv.style.width = "auto"; img.classList.add("hide"); }; if (img.complete) img.onload(); }
}

/* ---------------------------------------------------------------- review & export */
let REVIEW = {mode: "side", zoom: 1, boxes: true, labels: false, cur: null, pane: "document", side: localStorage.getItem("thaocr.reviewSide") !== "0"};
async function rerun(d) { toast("running OCR again…"); try { await ensureModels(); const blob = await T.db.imageBlob(d.page_id); if (!blob) throw new Error("page image missing"); const res = await T.process(blob); res.page_id = d.page_id; const nd = summarize(res, d.filename, d.job, d.size); nd.created = d.created; await store.put(nd, res.image_blob); toast("done"); route(); } catch (e) { toast("failed: " + e.message); } }
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
  const page = d.result, siblings = d.job ? store.docs.filter(x => x.job === d.job).sort((a, b) => a.created - b.created) : [d];
  const lines = page.blocks.flatMap(b => (b.lines || []).filter(l => l.text).map(l => ({b, l}))), lows = lines.filter(x => x.l.confidence < LOW && !(d.reviewed || {})[lineKey(x.b, x.l)]).sort((a, b) => a.l.confidence - b.l.confidence);
  const [st, cls] = docStatus(d), kinds = {};
  for (const b of page.blocks) kinds[b.cls] = (kinds[b.cls] || 0) + 1;
  const extras = Object.entries(kinds).filter(([k]) => ["table", "stamp", "logo", "figure", "handwriting"].includes(k)).map(([k, v]) => `${v} ${(ROLE[k] || k).toLowerCase()}${v > 1 ? "s" : ""}`).join(" · ");
  const hasDoc = !!(page.document && window.DocView);
  view.innerHTML = `
  <div class="head" style="align-items:center"><div class="grow"><h1 style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${esc(docTitle(d))} <span class="badge ${cls}"><span class="dot"></span>${st}</span></h1>
    <p>${siblings.length > 1 ? siblings.length + " pages · " : ""}${(d.avg_conf * 100).toFixed(1)}% confidence · ${lows.length ? `<span style="color:var(--warn)">${lows.length} line${lows.length === 1 ? "" : "s"} to check</span>` : "nothing to check"} · <a href="#/documents">all documents</a></p></div>
    <div class="seg" id="r_mode">${[["side", "Side by side"], ["text", "Text"], ["original", "Original"]].map(([k, t]) => `<button class="${REVIEW.mode === k ? "on" : ""}" data-m="${k}">${t}</button>`).join("")}</div>
    ${REVIEW.side ? "" : `<button class="btn" id="r_side_open" title="Show the check panel">${icon("panel-right")}Check lines${lows.length ? ` <span class="badge warn">${lows.length}</span>` : ""}</button>`}
    <button class="btn" id="r_copy">${icon("copy")}Copy text</button>
    <div class="rel"><button class="btn p" id="r_export">${icon("download")}Export ${icon("chevron-down", "s")}</button></div></div>
  <div class="card review ${REVIEW.mode === "side" ? "" : REVIEW.mode} ${siblings.length > 1 ? "" : "one"} ${REVIEW.side ? "" : "noside"}">
   ${siblings.length > 1 ? `<div class="thumbs">${siblings.map((s, i) => `<div class="th ${s.page_id === id ? "cur" : ""}" data-id="${s.page_id}"><img src="${s.image_url}" alt="">${i + 1}</div>`).join("")}</div>` : ""}
   ${REVIEW.mode !== "text" ? `<div><div class="panehead"><span>Original</span><div class="grow"></div><button class="tool" id="r_zoomout" title="Zoom out">${icon("zoom-out", "s")}</button><span class="mono">${Math.round(REVIEW.zoom * 100)}%</span><button class="tool" id="r_zoomin" title="Zoom in">${icon("zoom-in", "s")}</button><button class="tool" id="r_full" title="Open full size (F)">${icon("expand", "s")}</button><span class="opts"><label class="small"><input type="checkbox" id="r_boxes" ${REVIEW.boxes ? "checked" : ""}> boxes</label><label class="small"><input type="checkbox" id="r_labels" ${REVIEW.labels ? "checked" : ""}> labels</label></span></div>
     <div class="panebody"><div class="view" id="r_view" title="Click to open full size"><canvas id="r_cv"></canvas></div></div></div>` : ""}
   ${REVIEW.mode === "side" ? `<div><div class="panehead"><div class="seg" id="r_pane">${hasDoc ? `<button class="${REVIEW.pane === "document" ? "on" : ""}" data-p="document">Document</button>` : ""}<button class="${REVIEW.pane === "overlay" || !hasDoc ? "on" : ""}" data-p="overlay">Overlay</button></div><div class="grow"></div><span class="mut">Click text to edit · <span id="r_saved">Saved</span></span></div><div class="panebody" id="r_docwrap"></div></div>` : ""}
   ${REVIEW.mode === "text" ? `<div><div class="panehead"><span>Text in reading order</span></div><div class="panebody white"><div class="textout" id="r_text">${[...page.blocks].sort((a, b) => a.reading_order - b.reading_order).filter(b => (b.lines || []).some(l => l.text)).map(b => `<div class="blk ${b.align || ""}"><div class="lbl">${esc(ROLE[b.cls] || b.cls)}</div>${b.lines.filter(l => l.text).map(l => "\t".repeat(l.indent_level || 0) + (l.bullet ? esc(l.bullet) + " " : "") + ((l.spans && l.spans.length) ? l.spans.map(s => s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text)).join(" ") : (l.bold ? `<b>${esc(l.text)}</b>` : esc(l.text)))).join("\n")}</div>`).join("")}</div></div></div>` : ""}
   ${REVIEW.side ? `<div><div class="panehead"><b style="color:var(--ink)">Check these lines</b><div class="grow"></div><span class="badge ${lows.length ? "warn" : "ok"}">${lows.length}</span><button class="tool" id="r_side_close" title="Close panel">${icon("x", "s")}</button></div>
    <div class="panebody white" style="max-height:none">
     <div id="r_lows">${lows.length ? lows.slice(0, 12).map((x, i) => `<div class="rev ${i === 0 ? "cur" : ""}" data-key="${lineKey(x.b, x.l)}"><div class="w"><span>${esc(x.l.text.length > 28 ? x.l.text.slice(0, 28) + "…" : x.l.text)}</span><span class="pc">${Math.round(x.l.confidence * 100)}%</span></div><div class="snip"><canvas data-key="${lineKey(x.b, x.l)}"></canvas></div><input value="${esc(x.l.text)}"><div class="acts"><button class="btn p sm" data-a="accept">${icon("check", "s")}Accept</button><button class="btn sm" data-a="ignore">Ignore</button></div></div>`).join("") : `<div class="small mut" style="padding:8px 0 16px">Every line was read with good confidence.</div>`}</div>
     ${lows.length ? `<button class="btn" style="width:100%;margin-bottom:18px" id="r_acceptall">${icon("check-circle")}Accept all</button>` : ""}
     <h3 style="margin:4px 0 6px">About this page</h3>
     <div class="kv"><span>Content</span><b>${page.blocks.length} regions${extras ? " · " + extras : ""}</b></div>
     <div class="kv"><span>Text</span><b>${d.lines} lines · ${d.chars} characters</b></div>
     <div class="kv"><span>Fonts</span><b>${esc([...new Set(page.blocks.map(b => b.font && b.font.family).filter(Boolean))].slice(0, 3).join(", ") || "–")}</b></div>
     ${page.source === "pdf-text" ? `<div class="kv"><span>Source</span><b>PDF text layer · no OCR needed</b></div>` : ""}
     <div class="kv"><span>Time</span><b>${fmtMs(d.timings.total_ms)} on this device</b></div>
     <div style="display:flex;gap:8px;margin-top:16px"><button class="btn sm" id="r_rerun" title="${page.source === "pdf-text" ? "Ignore the PDF text and read the page image with OCR instead" : "Process this page again"}">${icon("refresh")}${page.source === "pdf-text" ? "Run OCR instead" : "Run OCR again"}</button><button class="btn sm danger" id="r_del">${icon("trash")}Delete</button></div></div></div>` : ""}</div>`;
  view.querySelectorAll("#r_mode button").forEach(b => b.onclick = () => { REVIEW.mode = b.dataset.m; renderReview(id); });
  for (const [sel, on] of [["#r_side_close", false], ["#r_side_open", true]]) { const b = view.querySelector(sel); if (b) b.onclick = () => { REVIEW.side = on; localStorage.setItem("thaocr.reviewSide", on ? "1" : "0"); renderReview(id); }; }
  view.querySelectorAll(".thumbs .th").forEach(t => t.onclick = () => location.hash = "#/review/" + t.dataset.id);
  $("#r_copy").onclick = () => navigator.clipboard.writeText(pageText(page)).then(() => toast("text copied"));
  if ($("#r_rerun")) $("#r_rerun").onclick = () => rerun(d);  // the check panel (and these buttons) can be closed
  if ($("#r_del")) $("#r_del").onclick = async () => { if (confirm("Delete this document from this browser?")) { await store.del(d.page_id); location.hash = "#/documents"; toast("deleted"); } };
  $("#r_export").onclick = e => { e.stopPropagation(); closeMenus(); const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<button data-a="docx">${icon("file")}Word document (.docx)</button>${siblings.length > 1 ? `<button data-a="docxall">${icon("layers")}All ${siblings.length} pages as one .docx</button>` : ""}<button data-a="txt">${icon("list")}Plain text (.txt)</button><button data-a="json">${icon("braces")}JSON (full result)</button><button data-a="png">${icon("image")}Page image</button>`;
    $("#r_export").parentElement.appendChild(m); m.onclick = ev => { const a = ev.target.closest("button")?.dataset.a; closeMenus(); const base = docTitle(d);
      if (a === "docx") exportDocx([d]); if (a === "docxall") exportDocx(siblings); if (a === "txt") download(base + ".txt", pageText(page), "text/plain;charset=utf-8");
      if (a === "json") download(base + ".json", JSON.stringify(page, null, 1), "application/json"); if (a === "png") { const x = document.createElement("a"); x.href = d.image_url; x.download = d.filename; x.click(); } }; };
  const img = new Image(); img.src = d.image_url;
  const paint = () => { const cv = $("#r_cv"); if (cv) { drawOriginal(cv, img, page, {boxes: REVIEW.boxes, labels: REVIEW.labels, lines: REVIEW.boxes}); const v = $("#r_view"); v.style.width = Math.min(page.width, (v.parentElement.clientWidth - 32)) * REVIEW.zoom + "px"; }
    for (const c of view.querySelectorAll(".snip canvas")) { const [bid, lo] = c.dataset.key.split(":"); const b = page.blocks.find(x => x.id === bid), l = b && b.lines.find(x => String(x.reading_order) === lo); if (!l) continue;
      const pad = l.box.height * 0.3, sx = Math.max(0, l.box.x - pad), sy = Math.max(0, l.box.y - pad), sw = Math.min(page.width - sx, l.box.width + 2 * pad), sh = Math.min(page.height - sy, l.box.height + 2 * pad);
      c.width = Math.round(sw * 2); c.height = Math.round(sh * 2); c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); } };
  img.onload = paint; if (img.complete) paint();
  if ($("#r_zoomin")) { $("#r_zoomin").onclick = () => { REVIEW.zoom = Math.min(3, REVIEW.zoom + 0.25); renderReview(id); }; $("#r_zoomout").onclick = () => { REVIEW.zoom = Math.max(0.5, REVIEW.zoom - 0.25); renderReview(id); };
    $("#r_boxes").onchange = e => { REVIEW.boxes = e.target.checked; paint(); }; $("#r_labels").onchange = e => { REVIEW.labels = e.target.checked; paint(); };
    const full = () => openLightbox(d, img, () => { if ($("#r_boxes")) { $("#r_boxes").checked = REVIEW.boxes; $("#r_labels").checked = REVIEW.labels; } paint(); });
    $("#r_full").onclick = full; $("#r_view").onclick = full;
    REVIEW.key = e => { if (e.key.toLowerCase() === "f" && !(e.target.closest && e.target.closest("input,textarea,[contenteditable]")) && !$("#lightbox")) full(); };
    document.addEventListener("keydown", REVIEW.key); }
  const wrap = $("#r_docwrap");
  if (wrap) {
    if (REVIEW.pane === "document" && hasDoc) { const avail = Math.max(320, wrap.clientWidth - 32); wrap.appendChild(DocView.render(page, {scale: Math.min(1, avail / page.width), editable: true, onEdit: (bid, orders, text) => applyParagraphEdit(d, bid, orders, text)})); }
    else { const dp = buildDocPage(d, (b, l, text) => applyEdit(d, b, l, text)); wrap.appendChild(dp); const fit = () => scaleToFit(wrap, dp, page.width, page.height); fit(); window.addEventListener("resize", fit, {once: true}); }
    view.querySelectorAll("#r_pane button").forEach(b => b.onclick = () => { REVIEW.pane = b.dataset.p; renderReview(id); });
  }
  view.querySelectorAll(".rev").forEach(card => { const key = card.dataset.key, [bid, lo] = key.split(":"), b = page.blocks.find(x => x.id === bid), l = b.lines.find(x => String(x.reading_order) === lo);
    card.onclick = e => { view.querySelectorAll(".rev").forEach(x => x.classList.remove("cur")); card.classList.add("cur"); const ln = view.querySelector(`.docpage .ln[data-key="${key}"]`); if (ln && !e.target.closest("button,input")) { ln.scrollIntoView({block: "center", behavior: "smooth"}); ln.focus(); } };
    card.querySelector('[data-a="accept"]').onclick = () => { applyEdit(d, b, l, card.querySelector("input").value); renderReview(id); };
    card.querySelector('[data-a="ignore"]').onclick = () => { d.reviewed = d.reviewed || {}; d.reviewed[key] = "ignored"; store.put(d); renderReview(id); }; });
  if ($("#r_acceptall")) $("#r_acceptall").onclick = () => { for (const x of lows) { d.reviewed = d.reviewed || {}; d.reviewed[lineKey(x.b, x.l)] = "accepted"; } store.put(d); renderReview(id); toast("all lines accepted"); };
}
function applyParagraphEdit(d, blockId, orders, text) {
  const b = d.result.blocks.find(x => x.id === blockId); if (!b) return;
  const lines = orders.map(o => b.lines.find(l => l.reading_order === o)).filter(Boolean); if (!lines.length) return;
  lines.forEach((l, i) => { l.text = i ? "" : text; l.spans = []; l.confidence = Math.max(l.confidence, 0.99); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = "edited"; });
  b.text = blockTextMd(b);
  const para = (b.paragraphs || []).find(p => p.lines.join() === orders.join()); if (para) { para.text = text; para.runs = [{text, bold: false}]; }
  const de = (d.result.document || {elements: []}).elements; for (const e of de) { const items = e.type === "list" ? e.items : e.columns ? e.columns.flatMap(c => c.elements) : [e]; for (const it of items) if (it.block === blockId && (it.lines || []).join() === orders.join()) { it.text = text; it.runs = [{text, bold: false}]; it.low = false; } }
  recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
function applyEdit(d, b, l, text) {
  const changed = text !== l.text; l.text = text; if (changed) { l.spans = []; l.confidence = Math.max(l.confidence, 0.99); }
  b.text = blockTextMd(b); d.reviewed = d.reviewed || {}; d.reviewed[lineKey(b, l)] = changed ? "edited" : "accepted";
  recount(d); store.put(d); const s = $("#r_saved"); if (s) s.textContent = "Saved just now";
}
function recount(d) { const all = d.result.blocks.flatMap(x => x.lines || []).filter(x => x.text); d.chars = all.reduce((a, x) => a + x.text.length, 0); d.avg_conf = all.reduce((a, x) => a + x.confidence, 0) / Math.max(1, all.length); d.low = all.filter(x => x.confidence < LOW).length; }
function download(name, data, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------------------------------------------------------------- Word export (docx library, in the browser) */
let docxLib = null;
async function loadDocx() { if (docxLib) return docxLib; if (!window.docx) { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/docx@9.15.3/dist/index.iife.js"; s.onload = res; s.onerror = () => rej(new Error("docx library not found")); document.head.appendChild(s); }); } docxLib = window.docx; return docxLib; }
const dataUrlBytes = u => { const b = atob(u.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
function docxParagraphs(D, page) {
  const {Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun} = D, out = [], W = page.width, doc = page.document;
  const contentW = Math.max(1, W - ((doc && doc.margins) ? doc.margins.left + doc.margins.right : 0.16 * W)), pageWidthTwips = 9026; // A4 text width at 2 cm margins
  const align = a => a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
  const runs = (e, fallbackBold) => (e.runs && e.runs.length ? e.runs : [{text: e.text || "", bold: !!fallbackBold}]).map(r => new TextRun({text: r.text, bold: !!r.bold || !!fallbackBold, italics: e.style && e.style.slant === "italic", font: e.style && e.style.family && !/^Latin/.test(e.style.family) ? e.style.family : undefined, size: e.style && e.style.font_px ? Math.max(16, Math.round(e.style.font_px / W * 1190)) : undefined}));
  const one = e => {
    if (e.type === "row" || e.type === "footer_row") { e.columns.forEach(c => c.elements.forEach(one)); return; }
    if (e.type === "list") { e.items.forEach(it => out.push(new Paragraph({children: runs(it), bullet: {level: Math.min(8, it.level || 0)}, alignment: align(e.align)}))); return; }
    if (e.type === "figure" || e.type === "decoration") { if (!e.crop) return; try { const wIn = Math.max(0.3, Math.min(6.3, 6.3 * (e.box[2] / contentW))), hIn = wIn * (e.box[3] / Math.max(1, e.box[2])); out.push(new Paragraph({alignment: align(e.align), children: [new ImageRun({type: "png", data: dataUrlBytes(e.crop), transformation: {width: Math.round(wIn * 96), height: Math.round(hIn * 96)}})]})); } catch (err) { console.warn(err); } return; }
    if (e.type === "heading") { out.push(new Paragraph({children: runs(e, true), heading: e.heading === 1 ? HeadingLevel.HEADING_1 : e.heading === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, alignment: align(e.align)})); return; }
    out.push(new Paragraph({children: runs(e), alignment: align(e.align), indent: e.level ? {left: 720 * e.level} : (e.first_line_indent ? {firstLine: 720} : undefined), spacing: {after: 120}}));
  };
  if (doc && doc.elements) doc.elements.forEach(one);
  else [...page.blocks].sort((a, b) => a.reading_order - b.reading_order).forEach(b => { if (b.crop && b.crop.url) one({type: "figure", crop: b.crop.url, box: [b.box.x, b.box.y, b.box.width, b.box.height], align: b.align}); else b.lines.filter(l => l.text).forEach(l => out.push(new Paragraph({children: [new TextRun({text: (l.bullet ? l.bullet + " " : "") + l.text})]}))); });
  void pageWidthTwips; return out;
}
async function exportDocx(docs) {
  toast("building Word document…");
  try { const D = await loadDocx(); const sections = docs.map((d, i) => ({properties: {page: {margin: {top: 1134, bottom: 1134, left: 1134, right: 1134}}}, children: docxParagraphs(D, d.result)}));
    const file = new D.Document({creator: "ThaOCR", title: docTitle(docs[0]), styles: {default: {document: {run: {font: "Khmer OS Siemreap", size: 22}}}}, sections});
    const blob = await D.Packer.toBlob(file); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = docTitle(docs[0]) + ".docx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast("downloaded .docx"); }
  catch (e) { console.error(e); toast("export failed: " + String(e.message || e).slice(0, 80)); }
}

/* ---------------------------------------------------------------- documents / settings / help */
function renderDocuments() {
  const filter = q => store.docs.filter(d => !q || d.filename.toLowerCase().includes(q.toLowerCase()) || pageText(d.result).includes(q));
  view.innerHTML = `<div class="head"><div class="grow"><h1>Documents</h1><p>${store.docs.length} document${store.docs.length === 1 ? "" : "s"} kept in this browser, on this device only.</p></div>
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
  const bytes = await T.db.bytes();
  view.innerHTML = `<div class="head"><div class="grow"><h1>Settings</h1><p>Models, device and local data. Everything here applies to this browser only.</p></div></div>
  <div class="grid g-main"><div style="display:flex;flex-direction:column;gap:16px">
   <div class="card pad"><h2 style="margin-bottom:4px">Your device</h2><div class="small mut" style="margin-bottom:14px">${DEVICE.threads} threads${DEVICE.memoryGB ? " · " + DEVICE.memoryGB + " GB memory" : ""} · ${DEVICE.webgpu ? "WebGPU" + (DEVICE.gpuName ? " (" + esc(DEVICE.gpuName) + ")" : "") : "no WebGPU"} · ${DEVICE.threadsOK ? "multi-thread" : "single-thread"} WebAssembly${DEVICE.mobile ? " · mobile" : ""}</div>
    <div class="small mut" style="margin-bottom:10px">${RECO.reasons.map(esc).join(" · ")}</div>
    <div class="field"><label>Model set</label><div class="tiers" id="s_tiers">${["high", "mid", "low"].map(t => `<div class="tier ${tier === t ? "on" : ""}" data-t="${t}"><b>${TIER_LABEL[t]}${RECO.tier === t ? " · recommended" : ""}</b>${t === "high" ? "fp32 recogniser v2.4, detector at 2200 px" : t === "mid" ? "int8 recogniser, detector at 1800 px" : "int8 recogniser, detector at 1300 px, for phones"}</div>`).join("")}</div></div>
    <div class="field"><label>Compute</label><div class="sel"><select id="s_backend"><option value="auto" ${store.settings.backend === "auto" ? "selected" : ""}>Automatic (GPU when available)</option><option value="webgpu" ${store.settings.backend === "webgpu" ? "selected" : ""}>WebGPU</option><option value="wasm" ${store.settings.backend === "wasm" ? "selected" : ""}>CPU (WebAssembly)</option></select></div></div>
    ${b ? `<div class="kv"><span>Measured speed</span><b>regions ${fmtMs(b.layoutMs)} · lines ${fmtMs(b.detMs)} · ${b.recMsPerLine.toFixed(0)} ms per text line · ${b.backend}</b></div><div class="kv"><span>Estimate</span><b>about ${T.estimate(b, 40)} s for a 40-line page</b></div>` : `<div class="small mut">Speed is measured when the models are first loaded.</div>`}
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" id="s_bench">${icon("refresh")}Measure again</button><button class="btn sm" id="s_load">${icon("download")}Load models now</button></div></div>
   <div class="card pad"><h2 style="margin-bottom:12px">Models <span class="small mut" style="font-weight:400">(overrides the model set)</span></h2>
    ${stage("layout", "Layout", "Finds paragraphs, titles, tables, stamps, logos and handwriting.")}${stage("textdet", "Text lines", "Finds each line of text.")}${stage("rec", "Text recogniser", "Reads Khmer and English. int8 = smaller and faster, fp32 = slightly more accurate.")}${stage("font", "Font classifier", "Typeface, weight, slant and size per line.")}${stage("structure", "Structure", "Paragraphs, roles and reading order.")}
    <button class="btn sm ghost" id="s_reset">Back to the recommended set</button></div>
   <div class="card pad"><h2 style="margin-bottom:12px">Preferences</h2>
    <div class="field"><label>Your name</label><div class="sel"><input id="s_name" value="${esc(store.settings.name)}"></div></div>
    <div class="field"><label>Default export</label><div class="sel">${outputSel("s_out", store.settings.output)}</div></div></div></div>
   <div style="display:flex;flex-direction:column;gap:16px"><div class="card pad"><h3>Local data</h3><p class="small mut" style="margin:8px 0 12px">Documents, page images and your edits are kept in this browser only (${fmtSize(bytes)} used). There is no server copy. Clearing site data in the browser also removes them.</p><button class="btn danger" id="s_clear">Delete all documents</button></div>
   <div class="card pad"><h3>Downloaded models</h3><p class="small mut" style="margin:8px 0 12px">Model files are cached by the browser so they download only once.</p><button class="btn" id="s_cache">Remove cached models</button></div></div></div>`;
  $("#s_out").onchange = e => { store.settings.output = e.target.value; store.save(); };
  $("#s_name").onchange = e => { store.settings.name = e.target.value.trim() || "Local user"; store.save(); };
  $("#s_backend").onchange = e => { store.settings.backend = e.target.value; store.save(); resetModels(); renderSettings(); };
  view.querySelectorAll("#s_tiers .tier").forEach(t => t.onclick = () => { store.settings.tier = t.dataset.t === RECO.tier ? null : t.dataset.t; store.settings.models = {}; const fake = T.recommend(Object.assign({}, DEVICE, {webgpu: t.dataset.t === "high", mobile: t.dataset.t === "low", threads: t.dataset.t === "high" ? 8 : t.dataset.t === "low" ? 4 : 6, memoryGB: t.dataset.t === "low" ? 4 : 8})); RECO = Object.assign({}, RECO, {choice: fake.choice, scale: fake.scale}); store.settings.longMin = null; store.settings.longMax = null; store.save(); resetModels(); renderSettings(); });
  view.querySelectorAll("select[data-stage]").forEach(sel => sel.onchange = () => { store.settings.models = Object.assign({}, store.settings.models, {[sel.dataset.stage]: sel.value}); store.save(); resetModels(); toast("model changed; it loads on the next scan"); });
  $("#s_reset").onclick = () => { store.settings.models = {}; store.settings.tier = null; store.save(); resetModels(); deviceCheck().then(renderSettings); };
  $("#s_bench").onclick = async () => { toast("measuring…"); try { await ensureModels(); await T.benchmark(); renderSettings(); toast("done"); } catch (e) { toast("failed: " + e.message); } };
  $("#s_load").onclick = async () => { try { await ensureModels((m) => toast(m)); renderSettings(); } catch (e) { toast("failed: " + e.message); } };
  $("#s_clear").onclick = async () => { if (confirm("Remove all documents from this browser? This cannot be undone.")) { await store.clear(); sidebar(); renderSettings(); } };
  $("#s_cache").onclick = async () => { await T.clearModelCache(); localStorage.removeItem("thaocr.device.v1"); resetModels(); toast("cached models removed"); renderSettings(); };
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

/* ---------------------------------------------------------------- router + boot */
const ROUTES = {scan: renderScan, process: renderProcess, review: a => renderReview(a), documents: renderDocuments, settings: renderSettings, help: renderHelp, dashboard: renderScan, new: renderScan, batch: renderDocuments};
function route() { closeMenus(); const [, r = "scan", arg = ""] = location.hash.split("/"); sidebar(); (ROUTES[r] || renderScan)(arg); window.scrollTo(0, 0); }
window.addEventListener("hashchange", route);
(async () => {
  setSideCollapsed(localStorage.getItem("thaocr.sideCollapsed") === "1");
  $("#sidetog").onclick = () => setSideCollapsed(!$("#shell").classList.contains("collapsed"));
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); setSideCollapsed(!$("#shell").classList.contains("collapsed")); } });
  await store.init();
  if (!store.settings.noticeSeen) { $("#notice").classList.remove("hide"); $("#notice_ok").onclick = () => { $("#notice").classList.add("hide"); store.settings.noticeSeen = true; store.save(); }; }
  if (!location.hash) location.hash = "#/scan"; else route(); sidebar();
  try { await deviceCheck(); } catch (e) { console.warn(e); }
  sidebar(); if (location.hash === "#/scan") renderScan();
  // warm up in the background on capable devices: the first scan then starts at once
  if (RECO && RECO.tier !== "low" && !(DEVICE && DEVICE.saveData)) ensureModels(() => {}).then(() => { if (location.hash === "#/scan") renderScan(); }).catch(e => console.warn("model preload failed", e));
})();
