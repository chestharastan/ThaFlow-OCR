/* ThaOCR — Home (#/home): the welcome page. What the app does, why it is safe to use, what this device can run (filled in
   live from ocr/device.js and the manifest), and a before -> after demo on a made-up sample page.
   Opening it downloads nothing: the device check reads the manifest and the Cache API only. The models load when the
   visitor scans or presses "Read this page for real" (the demo runs the normal job, so the first scan's download card shows).
   Loaded before app.js; everything from app.js is used inside functions only. Every top-level name starts with home / HOME_. */
"use strict";

const HOME_ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  "wifi-off": '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-1.9-1.5M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/>',
  stamp: '<path d="M9.5 3.5a2.5 2.5 0 0 1 5 0c0 1.8-1 3-1 5.5h-3c0-2.5-1-3.7-1-5.5Z"/><path d="M5 12h14a1 1 0 0 1 1 1v3H4v-3a1 1 0 0 1 1-1ZM5 20h14"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
};

/* The demo page: made up for the demo (a community library notice, no names). Drawn on a canvas with the bundled Khmer
   fonts, so the same picture is shown and, on request, read for real. "|" marks where a line may break. */
const HOME_DEMO_TEXT = {
  title: "សេចក្តីជូនដំណឹង",
  sub: "ម៉ោងបើកថ្មីរបស់បណ្ណាល័យសហគមន៍",
  para: "ចាប់ពី|ខែ|ក្រោយ |បណ្ណាល័យ|សហគមន៍|នឹង|បើក|ទ្វារ|យូរ|ជាង|មុន |ដើម្បី|ឱ្យ|សិស្ស |និង|អ្នក|ភូមិ|អាច|មក|អាន|សៀវភៅ |ខ្ចី|សៀវភៅ |និង|ប្រើ|កុំព្យូទ័រ|បាន|ស្រួល។ |សេវា|ទាំងអស់|គឺ|ឥតគិតថ្លៃ។",
  rows: [["ថ្ងៃ", "ម៉ោងបើក"], ["ថ្ងៃច័ន្ទ - ថ្ងៃសុក្រ", "៧:០០ - ១៧:០០"], ["ថ្ងៃសៅរ៍", "៨:០០ - ១២:០០"], ["ថ្ងៃអាទិត្យ", "បិទ"]],
  listHead: "សូមចងចាំ៖",
  items: ["សូមរក្សាភាពស្ងាត់ស្ងៀមក្នុងបន្ទប់អាន", "សៀវភៅខ្ចីអាចយកទៅផ្ទះបាន ៧ ថ្ងៃ", "សូមកុំញ៉ាំអាហារក្នុងបណ្ណាល័យ"],
  en: "Free entry · Everyone is welcome",
  end: "សូមអរគុណ!",
  foot: "ទំព័រគំរូសម្រាប់សាកល្បង ThaOCR",
};
const HOME_DEMO = {p: null, url: "", blob: null};
let HOME_TOK = 0, HOME_DC = null;

const homeReduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
/** the visitor chose to go on from Home: the welcome notice has been read (it says what Home says) */
function homeAccept() { if (!store.settings.noticeSeen) { store.settings.noticeSeen = true; store.save(); } }
/** one device check at a time (the boot runs one too) */
function homeDeviceReady() { if (DEVICE && RECO) return Promise.resolve(); return HOME_DC || (HOME_DC = deviceCheck().finally(() => { HOME_DC = null; })); }

function renderHome() {
  Object.assign(ICONS, HOME_ICONS);
  const tok = ++HOME_TOK, D = HOME_DEMO_TEXT;
  const tile = (ic, t, p, eg) => `<div class="card tile"><div class="ti">${ic.length === 1 ? `<span class="h-glyph" lang="km">${ic}</span>` : icon(ic)}</div><b>${t}</b><p>${p}</p>${eg ? `<span class="h-eg">${eg}</span>` : ""}</div>`;
  const trust = (ic, t, p) => `<div class="h-why"><span class="h-why-i">${ic.length === 1 ? `<span class="h-glyph" lang="km">${ic}</span>` : icon(ic)}</span><div><b>${t}</b><p>${p}</p></div></div>`;
  const limit = (ic, t, p, id) => `<li><span class="h-lim-i">${icon(ic)}</span><div><b>${t}</b><p${id ? ` id="${id}"` : ""}>${p}</p></div></li>`;
  const scanBtn = (cls = "p lg") => `<a class="btn ${cls}" href="#/scan" data-go>${icon("scan")}Scan a document</a>`;
  const pdfBtn = (cls = "lg") => `<a class="btn ${cls}" href="#/pdf" data-go>${icon("files")}PDF tools</a>`;
  const after = `
    <div class="h-t">${esc(D.title)}</div>
    <div class="h-s">${esc(D.sub)}</div>
    <p class="h-p">${esc(D.para.replace(/\|/g, ""))}</p>
    <table class="h-tb"><tbody>${D.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="h-lh"><b>${esc(D.listHead)}</b></p>
    <ul class="h-ul">${D.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
    <p class="h-en" lang="en">${esc(D.en)}</p>
    <p class="h-end"><b>${esc(D.end)}</b></p>
    <p class="h-foot">${esc(D.foot)}</p>`;

  view.innerHTML = `<div class="home">
  <section class="h-hero" aria-labelledby="h_title">
   <div class="h-deco" aria-hidden="true" lang="km"><span>ក</span><span>ខ</span><span>A</span><span>គ</span></div>
   <span class="h-eyebrow">${icon("shield", "s")}Private · free · Khmer &amp; English</span>
   <h1 id="h_title">Turn photos and scans into text you can edit</h1>
   <p class="h-km" lang="km">បម្លែងរូបថត និងឯកសារស្កេន ទៅជាអក្សរដែលអាចកែបាន</p>
   <p class="h-lead">Take a picture of a letter, a notice or a book page. ThaOCR reads the Khmer and English on it and gives you text you can correct, copy and save as Word or PDF. It all happens here, in your browser.</p>
   <div class="h-cta">${scanBtn()}<button class="btn lg" type="button" id="h_to_demo">${icon("play")}See the demo</button>${pdfBtn("lg ghost")}</div>
   <ul class="h-pills" aria-label="Why ThaOCR">
    <li>${icon("shield", "s")}Files stay on your device</li><li>${icon("lock", "s")}No account</li><li>${icon("gift", "s")}Free</li><li>${icon("wifi-off", "s")}Reads without internet after setup</li></ul>
  </section>

  <section class="h-sec" id="h_demo" aria-labelledby="h_demo_t">
   <div class="h-sechead"><h2 id="h_demo_t">See it in action</h2><p>A sample page, before and after. The page is made up for this demo.</p></div>
   <div class="h-ba">
    <figure class="h-pane"><figcaption><span class="badge">Before</span>A photo of a printed page</figcaption>
     <div class="h-paper h-before" id="h_before"><span class="spin" aria-hidden="true"></span><span class="sr">Sample page: a library notice in Khmer with a table and a list</span></div></figure>
    <div class="h-arrow" aria-hidden="true">${icon("arrow-right")}</div>
    <figure class="h-pane"><figcaption><span class="badge ok">After</span><span id="h_after_cap">Text you can edit · click a word and type</span></figcaption>
     <div class="h-paper h-after" id="h_after" contenteditable="true" spellcheck="false" lang="km" role="textbox" aria-multiline="true" aria-label="The text ThaOCR gives back. You can edit it.">${after}</div></figure>
   </div>
   <div class="h-demobar"><button class="btn p" type="button" id="h_demo_run">${icon("play")}Read this page for real</button><span class="small mut" id="h_demo_note">Runs on your device. You'll see each step, then the editable result.</span></div>
  </section>

  <section class="h-sec" aria-labelledby="h_can_t">
   <div class="h-sechead"><h2 id="h_can_t">What it can do</h2><p>For letters, notices, forms, school papers, book pages, anything printed.</p></div>
   <div class="tiles h-tiles">
    ${tile("camera", "Photos and scans to text", "Take a photo or open a scan. Get the words back as text you can copy, search and change.", "A printed letter → a paragraph you paste into a message")}
    ${tile("ក", "Khmer and English", "Reads Khmer with its subscripts and vowels, Khmer numbers, and English, even mixed on one page.", "ថ្ងៃទី ១៥ · Phnom Penh · ១២:០០")}
    ${tile("table", "Keeps tables, headings and lists", "Titles stay titles, lists stay lists, and tables come back as real tables with rows and columns.", "A timetable photo → a table you can edit in Word")}
    ${tile("download", "Save as Word, PDF or text", "Keep working on it in Word, share a PDF people can search and copy from, or take plain text.", "Notice.jpg → Notice.docx")}
    ${tile("file", "PDFs too", "Scanned PDFs are read page by page. A PDF that already has text is read exactly, in a moment.", "A 10-page scan → one editable document")}
    ${tile("files", "PDF page tools", "Merge PDFs, drag pages into order, rotate, split, or take out only the pages you need.", "Two PDFs → one, with page 3 turned the right way")}
    ${tile("pencil", "Fix mistakes, keep the fixes", "Words it is unsure about are highlighted. Click to correct them; your corrections are saved.", "Yellow line → click → fixed")}
    ${tile("select", "Copy just one part", "Draw a box over part of a page to read and copy only that bit.", "One phone number from a whole poster")}
   </div>
  </section>

  <section class="h-sec" aria-labelledby="h_how_t">
   <div class="h-sechead"><h2 id="h_how_t">How it works</h2></div>
   <ol class="h-steps">
    <li><span class="n">1</span><div><b>Add a page</b><p>Choose a photo, a scan or a PDF, or use your camera.</p></div></li>
    <li><span class="n">2</span><div><b>ThaOCR reads it</b><p>On your device. The first time, it downloads its reading models once.</p></div></li>
    <li><span class="n">3</span><div><b>Check and save</b><p>Fix anything it got wrong, then save as Word, PDF or text.</p></div></li>
   </ol>
  </section>

  <section class="h-sec" aria-labelledby="h_why_t">
   <div class="h-sechead"><h2 id="h_why_t">Why you can trust it</h2><p>Your documents are yours. ThaOCR is built so that they never have to leave your hands.</p></div>
   <div class="h-whys">
    ${trust("shield", "Your files never leave this device", "The reading happens inside your browser. Photos and documents are never uploaded, to us or to anyone else.")}
    ${trust("lock", "No account, no sign-up", "Open the page and start. Nobody asks for your name, email or phone number.")}
    ${trust("gift", "Free", "No payment and no subscription.")}
    ${trust("wifi-off", "Reads without internet", "After the first download the reading models stay on your device. With ThaOCR open, you can scan with Wi-Fi off.")}
    ${trust("ក", "Made for Khmer", "Trained on Khmer documents: subscript letters, vowels, Khmer numbers, and the usual Khmer fonts.")}
   </div>
  </section>

  <section class="h-sec" id="h_device" aria-labelledby="h_dev_t">
   <div class="h-sechead"><h2 id="h_dev_t">What this device can do</h2><p>Checked just now, in this browser. Nothing is downloaded until you scan.</p></div>
   <div class="card pad h-dev" id="h_dev"><div class="chips"><span class="chip"><span class="spin"></span>Checking this device…</span></div></div>
  </section>

  <section class="h-sec" aria-labelledby="h_lim_t">
   <div class="h-sechead"><h2 id="h_lim_t">Good to know</h2><p>What ThaOCR does not do well yet, so there are no surprises.</p></div>
   <ul class="card pad h-lims">
    ${limit("pencil", "Handwriting and text under stamps are harder", "They are read, but with more mistakes. Lines it is unsure about are highlighted for you to check.")}
    ${limit("camera", "Very poor photos give poor text", "Blurry, dark, bent or tiny pictures lose the small Khmer marks. A flat page in good light, filling the photo, works best.")}
    ${limit("stamp", "Red stamps are not lifted off the text yet", "Text covered by a red stamp may come out wrong. The stamp itself is kept as a picture.")}
    ${limit("download", "The first scan needs a download", "The reading models download once, then stay in this browser. Opening ThaOCR itself still needs a connection: it is a website.", "h_lim_dl")}
    ${limit("folder", "Saved in this browser only", "There is no cloud copy. Clearing your browser data deletes your documents, so export what you want to keep.")}
   </ul>
  </section>

  <section class="h-end-cta">
   <h2>Ready to try it on your own page?</h2>
   <p>Start with a photo from your phone or any PDF.</p>
   <div class="h-cta">${scanBtn()}${pdfBtn()}</div>
  </section>
 </div>`;

  document.querySelectorAll("#view [data-go], #lhead [data-go]").forEach(a => a.addEventListener("click", homeAccept));   // before the page changes: Scan then warms up the models (the same listener is added once)
  // leaving Home any other way (sidebar, back) also counts: Home says everything the welcome notice says
  if (!store.settings.noticeSeen && !renderHome.leave) { renderHome.leave = () => { if ((location.hash.split("/")[1] || "") !== "home") { homeAccept(); window.removeEventListener("hashchange", renderHome.leave); renderHome.leave = null; } };
    window.addEventListener("hashchange", renderHome.leave); }
  $("#h_to_demo").onclick = () => $("#h_demo").scrollIntoView({behavior: homeReduced() ? "auto" : "smooth", block: "start"});
  $("#h_demo_run").onclick = homeRunDemo;
  const ed = $("#h_after"); ed.addEventListener("input", () => { const c = $("#h_after_cap"); if (c) c.textContent = "Edited · in ThaOCR your changes are saved"; }, {once: true});
  homeDemoImage().then(img => { if (tok !== HOME_TOK) return; const b = $("#h_before"); if (!b) return;
    b.innerHTML = `<img src="${img.url}" alt="Sample page: a library notice in Khmer with a title, a paragraph, a table of opening hours and a list" width="${img.w}" height="${img.h}">${homeReduced() ? "" : `<div class="scanline soft"></div>`}`; })
    .catch(e => { console.warn("demo page", e); const b = $("#h_before"); if (b) b.innerHTML = `<span class="small mut">The sample page could not be drawn in this browser.</span>`; });
  homeFillDevice(tok);
}

/* ---------------------------------------------------------------- the demo page (canvas -> JPEG) */
async function homeDemoFonts() {
  const faces = [["ThaDemo Muol", "KhmerOSmuollight.ttf", "400"], ["ThaDemo", "KhmerOSbattambang.ttf", "400"], ["ThaDemo", "Battambang-Bold.ttf", "700"]];
  await Promise.all(faces.map(async ([fam, file, weight]) => { const f = new FontFace(fam, `url("fonts/${file}")`, {weight}); await f.load(); document.fonts.add(f); }));
}
function homeRng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** the sample page, drawn once per tab: {url, blob, w, h}. Looks like a photo of a print: cream paper, soft light,
    a slight tilt, grain and a little blur, but clean enough to read well. */
function homeDemoImage() {
  if (HOME_DEMO.p) return HOME_DEMO.p;
  HOME_DEMO.p = (async () => {
    await homeDemoFonts();
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // after the page has painted
    const D = HOME_DEMO_TEXT, W = 1200, H = 1500, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    x.fillStyle = "#f4f1e9"; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W * 0.42, H * 0.38, H * 0.15, W * 0.5, H * 0.5, H * 0.8); g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(105,90,64,.17)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H / 2); x.rotate(-0.0045); x.translate(-W / 2, -H / 2);
    const ink = "rgba(26,26,28,.93)", L = 120, R = 1080, F = (px, w = 400, fam = '"ThaDemo"') => `${w} ${px}px ${fam}`;
    x.fillStyle = ink; x.strokeStyle = ink; x.textBaseline = "alphabetic";
    const center = (t, y, f) => { x.font = f; x.textAlign = "center"; x.fillText(t, W / 2, y); x.textAlign = "left"; };
    center(D.title, 160, F(48, 400, '"ThaDemo Muol"'));
    center(D.sub, 232, F(34, 700));
    x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - 80, 268); x.lineTo(W / 2 + 80, 268); x.stroke();
    // paragraph: wrapped at the marked word breaks, first-line indent
    x.font = F(31); let y = 344, line = "", indent = 60;
    for (const w of D.para.split("|")) { if (line && x.measureText(line + w).width > R - L - indent) { x.fillText(line.trimEnd(), L + indent, y); y += 56; line = ""; indent = 0; } line += w; }
    x.fillText(line, L + indent, y);
    // table with ruling lines
    const top = y + 54, rh = 62, cx = 560, n = D.rows.length;
    x.fillStyle = "rgba(0,0,0,.05)"; x.fillRect(L, top, R - L, rh); x.fillStyle = ink;
    D.rows.forEach((r, i) => { x.font = F(30, i ? 400 : 700); x.fillText(r[0], L + 22, top + i * rh + 42); x.fillText(r[1], cx + 22, top + i * rh + 42); });
    x.lineWidth = 2;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(L, top + i * rh); x.lineTo(R, top + i * rh); x.stroke(); }
    for (const xx of [L, cx, R]) { x.beginPath(); x.moveTo(xx, top); x.lineTo(xx, top + n * rh); x.stroke(); }
    // list
    y = top + n * rh + 78; x.font = F(31, 700); x.fillText(D.listHead, L, y); y += 58; x.font = F(31);
    for (const it of D.items) { x.fillText("-", L + 26, y); x.fillText(it, L + 60, y); y += 56; }
    y += 34; x.font = '30px "Liberation Serif", Georgia, "Times New Roman", serif'; x.fillText(D.en, L, y);
    y += 92; x.font = F(31, 700); x.textAlign = "right"; x.fillText(D.end, R, y); x.textAlign = "left";
    x.fillStyle = "rgba(26,26,28,.6)"; center(D.foot, H - 64, F(22));
    x.restore();
    // grain and dust
    const rnd = homeRng(7);
    for (let i = 0; i < 16000; i++) { const a = rnd() * 0.1, big = rnd() < 0.04; x.fillStyle = rnd() < 0.55 ? `rgba(70,58,40,${a})` : `rgba(255,255,255,${a * 1.4})`; x.fillRect(rnd() * W, rnd() * H, big ? 2 : 1, big ? 2 : 1); }
    // a slight blur, like a phone camera (browsers without canvas filters copy it as it is)
    const c2 = document.createElement("canvas"); c2.width = W; c2.height = H; const x2 = c2.getContext("2d"); x2.filter = "blur(0.55px)"; x2.drawImage(c, 0, 0);
    const blob = await new Promise((res, rej) => c2.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", 0.9));
    HOME_DEMO.blob = blob; HOME_DEMO.url = URL.createObjectURL(blob);
    return {url: HOME_DEMO.url, blob, w: W, h: H};
  })().catch(e => { HOME_DEMO.p = null; throw e; });
  return HOME_DEMO.p;
}
/** "Read this page for real": the sample goes through the normal scan (download card on the first time, then the review page) */
async function homeRunDemo() {
  if (ocrBusy()) { busyToast(); return; }
  const btn = $("#h_demo_run"); if (btn) btn.disabled = true;
  try {
    const img = await homeDemoImage(); homeAccept();
    const file = new File([img.blob], "ThaOCR demo page.jpg", {type: "image/jpeg", lastModified: Date.now()});
    const keep = pending; pending = [];          // only the sample: files waiting on the Scan page stay there
    try { await addFiles([file]); startJob(); } finally { pending = keep; }
  } catch (e) { console.warn(e); toast("The demo could not start: " + (e.message || e)); if (btn && btn.isConnected) btn.disabled = false; }
}

/* ---------------------------------------------------------------- "What this device can do" */
const HOME_STAGES = [
  {k: "layout", name: "Page layout", ic: "grid", what: "Finds the parts of a page: paragraphs, titles, tables, stamps, logos and signatures."},
  {k: "textdet", name: "Line finder", ic: "list", what: "Finds every line of text, even small or slightly tilted ones."},
  {k: "rec", name: "Reader", ic: "ក", what: "Reads each line, letter by letter, in Khmer and English."},
  {k: "font", name: "Font matcher", ic: "type", what: "Spots the typeface, bold text and size, so Word and PDF look like the original."},
  {k: "structure", name: "Order and structure", ic: "layers", what: "Works out the reading order, and which lines are headings, paragraphs or lists."},
  {k: "alt", name: "Handwriting second opinion", ic: "pencil", what: "Reads unsure lines (handwriting, text under a stamp) a second time and keeps the better reading."},
  {k: "doclayout", name: "PaddleOCR-VL layout (optional)", ic: "sparkles", what: "A much larger layout model from PaddleOCR-VL that finds regions and reading order in one pass. Off unless you turn it on in Settings."},
];
const HOME_STAGE_NAME = {layout: "Page layout", textdet: "Line finder", rec: "Reader", font: "Font matcher", structure: "Order and structure"};
const homeSize = id => { const s = T.spec(id); return s && T.manifest && T.manifest.sizes ? T.manifest.sizes[s.file] || 0 : 0; };
/** a short, plain name for a model: "Reader v3 · compact" */
function homeModelName(id) {
  const s = T.spec(id); if (!s) return id;
  if (s.kind === "pp_doclayout_onnx") return (/PP-DocLayoutV\d/.exec(s.label || "") || [id])[0];
  const base = {layout: "Layout", textdet: "Line finder", rec: /hw/.test(id) ? "Handwriting reader" : "Reader", font: "Fonts", structure: "Structure"}[s.stage] || s.stage;
  return `${base} ${s.version}${/int8/.test(id) ? " · compact" : s.stage === "rec" ? " · full size" : ""}`;
}
/** why this model set, in plain words */
function homeWhy(info, tier) {
  if (info.mobile) return "This is a phone or tablet, so ThaOCR uses its smallest models: a quicker first download and less memory.";
  if (tier === "high") return info.webgpu ? "This computer has a graphics chip the browser can use, so it can run the most accurate reader." : "This is a fast computer, so it can run the most accurate reader.";
  if (tier === "mid") return "A typical computer: a compact reader that is quick and accurate.";
  return info.saveData ? "Data Saver is on, so ThaOCR uses its smallest models." : "This computer has few processor cores or little memory, so ThaOCR uses its smallest models.";
}

async function homeFillDevice(tok) {
  const live = () => tok === HOME_TOK && $("#h_dev");
  try { await homeDeviceReady(); await T.loadManifestSafe(); } catch (e) { console.warn(e); }
  if (!live()) return;
  const box = $("#h_dev");
  if (!DEVICE || !RECO || !T.manifest) { box.innerHTML = `<p class="mut" style="margin:0 0 12px">ThaOCR could not check this device just now (no connection?). Scanning still works: the models are picked when you start.</p><button class="btn sm" type="button" id="h_dev_retry">${icon("refresh", "s")}Try again</button>`;
    $("#h_dev_retry").onclick = () => { box.innerHTML = `<div class="chips"><span class="chip"><span class="spin"></span>Checking this device…</span></div>`; homeFillDevice(HOME_TOK); }; return; }
  const info = DEVICE, rec = T.recommend(info), picked = store.settings.tier || rec.tier, choice = chosenModels();
  const be = T.plannedBackend(store.settings.backend || "auto", info), gpu = be === "webgpu";
  const rt = T.RUNTIME_BYTES[be];
  const setChoice = t => t === rec.tier ? rec.choice : tierModels(t).choice;
  const stageIds = ch => ["layout", "textdet", "rec", "font", "structure"].map(k => ch[k]).filter(Boolean);
  const setBytes = t => stageIds(setChoice(t)).reduce((a, id) => a + homeSize(id), 0);
  let plan = null, cached = {};
  try { plan = await downloadPlanHere(choice);   // the same plan as the Scan chip, the download card, the notice and Help
    await Promise.all(T.manifest.models.map(async m => { cached[m.id] = await T.isCached(T.modelUrl(m)); })); } catch (e) { console.warn(e); }
  if (!live()) return;
  const loaded = T.loaded(), mfiles = plan ? plan.files.filter(f => f.stage !== "runtime") : [], have = mfiles.filter(f => f.cached).length;
  const rtNeed = !loaded && !!plan && !plan.files[0].cached;   // the reading engine comes with the first scan; then the browser keeps it
  const need = loaded || !plan ? 0 : plan.bytes;
  const b = T.benchmarkStored(), est = b ? T.estimate(b, 40) : null;
  const free = info.storage && info.storage.quota ? Math.max(0, info.storage.quota - info.storage.usage) : 0;
  const recM = T.spec(choice.rec), altNeeded = !(recM && recM.handwriting);
  const altId = (() => { const hw = T.manifest.models.filter(m => m.stage === "rec" && /hw/.test(m.id)); return (hw.find(m => /int8/.test(m.id)) || hw[0] || {}).id || null; })();
  const rank = {low: 0, mid: 1, high: 2}, tooBig = info.mobile || rec.tier === "low";

  const fact = (ic, label, val, sub) => `<div class="h-fact"><span class="h-fact-i">${icon(ic, "s")}</span><div><span class="small mut">${label}</span><b>${val}</b>${sub ? `<span class="small mut">${sub}</span>` : ""}</div></div>`;
  const computeSub = gpu ? "The fastest way to read." : info.mobile ? "The steadiest choice on a phone." : info.webgpu ? "Picked in Settings." : "This browser can't use the graphics chip.";
  const dlVal = loaded ? "Nothing: ready" : need ? `${T.fmtBytes(need)}, once` : "Nothing: all here";
  const dlSub = loaded ? "The models are loaded." : `${have} of ${mfiles.length} models already on this device${rtNeed ? ` · includes the ${T.fmtBytes(rt)} reading engine` : ""}`;
  const speedVal = est ? `About ${est} s a page` : "Measured after your first scan";
  const speedSub = est ? "Measured on this device, for a full page." : "A computer is faster than a phone.";
  const setBadge = t => { const out = [];
    if (t === rec.tier) out.push(`<i class="rec">Recommended</i>`);
    if (rank[t] > rank[rec.tier]) out.push(`<i class="h-warn">${rank[t] - rank[rec.tier] > 1 || (tooBig && t === "high") ? "Not recommended here" : "May be slow here"}</i>`);
    return out.join(""); };

  const status = (txt, cls = "") => `<span class="badge ${cls}">${cls ? `<span class="dot"></span>` : ""}${txt}</span>`;
  const row = (s, model, size, st) => `<div class="h-model"><span class="h-model-i">${s.ic.length === 1 ? `<span class="h-glyph" lang="km">${s.ic}</span>` : icon(s.ic, "s")}</span>
    <div class="grow"><b>${s.name}</b><p>${s.what}</p>${model ? `<span class="small mut">${esc(model)}${size ? ` · ${T.fmtBytes(size)}` : ""}</span>` : ""}</div><div class="h-model-st">${st}</div></div>`;
  const usedSt = id => loaded && T.active && Object.values(T.active).includes(id) ? status("Loaded", "ok") : cached[id] ? status("On this device", "ok") : status("Downloads at first scan");
  const docEngines = T.manifest.models.filter(m => m.kind === "pp_doclayout_onnx"), engineOn = docEngines.find(m => m.id === choice.layout);
  const rows = HOME_STAGES.map(s => {
    if (s.k === "alt") return altNeeded && altId ? row(s, homeModelName(altId), homeSize(altId), cached[altId] ? status("On this device", "ok") : status("Only when needed"))
      : row(s, "", 0, status("Not needed here") + `<span class="small mut">This device's reader already learned handwriting.</span>`);
    if (s.k === "doclayout") return row(s, docEngines.map(m => `${homeModelName(m.id)} ${T.fmtBytes(homeSize(m.id))}`).join(" · "), 0,
      engineOn ? status("In use", "ok") : tooBig ? status("Too heavy for this device", "warn") : status("Optional · off"));
    return row(s, homeModelName(choice[s.k]), homeSize(choice[s.k]), usedSt(choice[s.k])); }).join("");

  // details: every model in the manifest, grouped by stage
  const sets = {low: setChoice("low"), mid: setChoice("mid"), high: setChoice("high")};
  const mStatus = m => {
    if (m.kind === "pp_doclayout_onnx") return m.id === choice.layout ? status("In use", "ok") : tooBig ? status("Too heavy for this device", "warn") : status("Optional · off");
    if (choice[m.stage] === m.id) return status("Used here", "ok");
    if (m.id === altId) return altNeeded ? status("Second opinion, when needed") : status("Not needed here");
    const inSets = ["low", "mid", "high"].filter(t => sets[t][m.stage] === m.id);
    if (inSets.length && info.mobile && m.stage === "rec" && !/int8/.test(m.id)) return status("Not recommended here", "warn");
    if (inSets.length) return status(inSets.map(t => TIER_LABEL[t]).join(" / ") + " set");
    return status("Older version");
  };
  const groupsHtml = ["layout", "textdet", "rec", "font", "structure"].map(st => { const ms = T.modelsFor(st).filter(m => m.kind !== "pp_doclayout_onnx"); if (!ms.length) return "";
    return `<tr class="h-mgroup"><th colspan="3">${HOME_STAGE_NAME[st]}</th></tr>` + ms.map(m => `<tr><td><b>${esc(homeModelName(m.id))}</b><span class="small mut">${esc(m.label || m.id)}<br><code>${esc(m.id)}</code></span></td>
      <td class="num">${homeSize(m.id) ? T.fmtBytes(homeSize(m.id)) : "–"}</td><td>${mStatus(m)}${cached[m.id] ? `<span class="small h-ok">${icon("check", "s")}Downloaded</span>` : ""}</td></tr>`).join(""); }).join("");
  const yes = v => v ? "Yes" : "No";
  const tech = [
    ["Processor threads", String(info.threads)], ["Memory", info.memoryGB ? `${info.memoryGB} GB (as the browser reports it)` : "Not reported"],
    ["WebGPU (graphics chip)", info.webgpu ? "Yes" + (info.gpuName ? ` · ${esc(info.gpuName)}` : "") : "No"], ["WebAssembly SIMD", yes(info.simd)],
    ["Multi-threading", info.threadsOK ? "On" : "Off (this host does not send the isolation headers)"], ["Phone or tablet", yes(info.mobile)],
    ["Connection", info.downlinkMbps ? `about ${info.downlinkMbps} Mb/s${info.saveData ? " · Data Saver on" : ""}` : info.saveData ? "Data Saver on" : "Not reported"],
    ["Browser storage", info.storage && info.storage.quota ? `${fmtSize(info.storage.usage)} used of ${fmtSize(info.storage.quota)}` : "Not reported"],
    ["Reading engine", `ONNX Runtime Web on ${gpu ? "WebGPU" : "WebAssembly"} · ${T.fmtBytes(rt)}`],
    ["Line finder page size", `${(RECO.scale || {}).longMin}–${(RECO.scale || {}).longMax} px (long side)`],
    ["Why this set", esc(rec.reasons.join(" · "))],
  ];

  box.innerHTML = `
   <div class="h-dev-top"><span class="h-dev-ic">${icon(TIER_ICON[picked], "l")}</span>
    <div class="grow"><span class="small mut">${picked === rec.tier ? "Recommended for this device" : `You picked this in Settings · recommended: ${TIER_LABEL[rec.tier]}`}</span>
     <h3>${TIER_LABEL[picked]}</h3><p>${homeWhy(info, rec.tier)}</p></div></div>
   <div class="h-facts">
    ${fact("cpu", "Reads on", gpu ? "Graphics chip (GPU)" : "Processor (CPU)", computeSub)}
    ${fact("download", "Still to download", dlVal, dlSub)}
    ${fact("clock", "Speed", speedVal, speedSub)}
    ${fact("folder", "Room for documents", free ? `${fmtSize(free)} free` : "Not reported", "In this browser, on this device.")}
   </div>
   <h3 class="h-sub">Model sets</h3>
   <p class="small mut h-subp">ThaOCR picks one for you. Bigger sets read a little better and download more. Tap one to switch; it loads at the next scan.</p>
   <div class="tiers h-sets" id="h_sets">${["low", "mid", "high"].map(t => `<button type="button" class="tier ${picked === t ? "on" : ""}" data-t="${t}" aria-pressed="${picked === t}"><b>${TIER_LABEL[t]}</b><span>${TIER_SUB[t]}</span><span class="h-setsz">${T.fmtBytes(setBytes(t) + rt)} download</span>${setBadge(t)}</button>`).join("")}</div>
   <h3 class="h-sub">The models, step by step</h3>
   <p class="small mut h-subp">Small programs that read the page in turn. They download from Hugging Face once, then stay in this browser.</p>
   <div class="h-models">${rows}</div>
   <details class="h-details"><summary>${icon("chevron-down", "s")}<span>Details for the curious</span></summary>
    <div class="h-tech">${tech.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    <h3 class="h-sub">Every model ThaOCR has</h3>
    <div class="h-mtable-wrap"><table class="h-mtable"><thead><tr><th>Model</th><th>Size</th><th>On this device</th></tr></thead><tbody>${groupsHtml}
     <tr class="h-mgroup"><th colspan="3">Optional layout from PaddleOCR-VL (Apache-2.0)</th></tr>${docEngines.map(m => `<tr><td><b>${esc(homeModelName(m.id))}</b><span class="small mut">${esc(m.label || m.id)}<br><code>${esc(m.id)}</code></span></td><td class="num">${T.fmtBytes(homeSize(m.id))}</td><td>${mStatus(m)}${cached[m.id] ? `<span class="small h-ok">${icon("check", "s")}Downloaded</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
    <p class="small mut" style="margin:12px 0 0">Change any of them in <a class="lnk" href="#/settings">Settings</a>. The model files are free on <a class="lnk" href="${esc(modelsPage())}" target="_blank" rel="noopener">Hugging Face</a>.</p>
   </details>`;
  box.querySelectorAll("#h_sets .tier").forEach(t => t.onclick = () => { if (ocrBusy()) { busyToast(); return; } if (t.dataset.t === picked) return;
    setTier(t.dataset.t); toast(TIER_LABEL[t.dataset.t] + " · loads on the next scan"); homeFillDevice(HOME_TOK); });

  // the demo button and the limits mention this device's download
  const note = $("#h_demo_note");
  if (note) note.textContent = loaded ? "The models are loaded: it starts right away." : need ? `Runs on your device. The first time, it downloads about ${T.fmtBytes(need)}, once.` : "The models are on this device: it starts right away.";
  const lim = $("#h_lim_dl");
  if (lim && need) lim.textContent = `About ${T.fmtBytes(need)} for this device, once; then the models stay in this browser. Opening ThaOCR itself still needs a connection: it is a website.`;
}
