/* ThaOCR browser engine — the five ONNX stages (layout, text lines, recogniser, font, structure) with ONNX Runtime
   Web, plus the image helpers. Port of backend/app/services/stages/*.py; nothing here talks to a server. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};

  /* ------------------------------------------------------------------ taxonomy (backend/app/taxonomy.py) */
  const CLASSES = ["text", "title", "section_header", "list", "table", "figure", "caption", "header", "footer", "page_number", "footnote",
    "formula", "signature", "stamp", "logo", "qr_code", "barcode", "photo", "handwriting", "checkbox", "form_field", "decoration"];
  const TEXT_CLASSES = new Set(["text", "title", "section_header", "list", "caption", "header", "footer", "page_number", "footnote", "table", "form_field", "handwriting"]);
  const CROP_CLASSES = new Set(CLASSES.filter(c => !TEXT_CLASSES.has(c)));
  const COLORS = {text: [60, 120, 216], title: [230, 120, 20], section_header: [240, 170, 40], list: [110, 80, 200], table: [30, 160, 110], figure: [200, 60, 160],
    caption: [150, 110, 60], header: [120, 140, 160], footer: [100, 120, 140], page_number: [80, 80, 120], footnote: [140, 140, 90], formula: [130, 60, 60],
    signature: [220, 30, 30], stamp: [180, 20, 90], logo: [20, 150, 190], qr_code: [90, 90, 90], barcode: [50, 50, 50], photo: [255, 100, 100],
    handwriting: [200, 150, 0], checkbox: [0, 180, 200], form_field: [160, 200, 60], decoration: [150, 150, 150]};
  const LABELS = Object.fromEntries(CLASSES.map(c => [c, c.replace(/_/g, " ").replace(/^./, s => s.toUpperCase())]));
  Object.assign(LABELS, {qr_code: "QR code", page_number: "Page number", form_field: "Form field", section_header: "Section header"});
  const ALIASES = {header_footer: "@header_footer", qr_barcode: "@qr_barcode", "plain text": "text", plain_text: "text", abandon: "@header_footer",
    figure_caption: "caption", table_caption: "caption", table_footnote: "footnote", isolate_formula: "formula", formula_caption: "caption",
    picture: "figure", "list-item": "list", list_item: "list", "page-header": "header", page_header: "header", "page-footer": "footer", page_footer: "footer", "section-header": "section_header"};
  function resolveClass(name, box, W, H) {
    const n = String(name).toLowerCase();
    if (CLASSES.includes(n)) return n;
    const a = ALIASES[n];
    if (a === "@header_footer") return box && (box[1] + box[3]) / 2 > H / 2 ? "footer" : "header";
    if (a === "@qr_barcode") { if (!box) return "qr_code"; const w = box[2] - box[0], h = Math.max(1, box[3] - box[1]); return w / h > 1.6 || h / w > 1.6 ? "barcode" : "qr_code"; }
    return a || "text";
  }
  const legacyType = c => (c === "title" || c === "section_header") ? "title" : (c === "header" || c === "footer" || c === "page_number") ? "header" : c === "caption" ? "caption" : CROP_CLASSES.has(c) ? "image" : "paragraph";
  const hex = rgb => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
  Object.assign(T, {CLASSES, TEXT_CLASSES, CROP_CLASSES, COLORS, LABELS, resolveClass, legacyType, hex});

  /* ------------------------------------------------------------------ runtime + model files */
  // ortBase: where the onnxruntime-web bundle + wasm come from (jsDelivr sends CORS/CORP headers, so it works under COEP).
  // manifestBase: where models.json and the small *_meta.json live (this site). modelBase: where the ONNX/vocab files
  // are downloaded from (Hugging Face by default, so the static host stays small; must send CORS headers).
  T.config = {ortBase: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/", manifestBase: "models/", modelBase: "https://huggingface.co/Thareah/ThaOCR-models/resolve/main/", backend: "auto", threads: 0, rules: true, longMin: 1600, longMax: 2200, cascade: true, font: true, structure: true,
    proxy: true};  // run the WebAssembly models in ONNX Runtime's own worker so the page stays responsive while OCR runs
  T.manifest = null; T.sessions = {}; T.active = {}; T.meta = {}; T.backendUsed = null;
  T.listeners = []; T.emit = (ev) => T.listeners.forEach(f => { try { f(ev); } catch (e) { console.warn(e); } });

  async function loadManifest() { if (T.manifest) return T.manifest; const r = await fetch(T.config.manifestBase + "models.json", {cache: "no-cache"}); if (!r.ok) throw new Error("models.json not found"); T.manifest = await r.json(); return T.manifest; }
  T.modelsFor = stage => (T.manifest ? T.manifest.models.filter(m => m.stage === stage && m.kind !== "ultralytics_pt") : []);
  T.spec = id => T.manifest && T.manifest.models.find(m => m.id === id);

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** GET a file with progress -> ArrayBuffer. Phones drop connections mid-download, so a failed attempt is retried (with
   *  backoff) and continues with a Range request from the bytes already received; if the server will not resume it starts
   *  over. HTTP 4xx (except 408/429) is not retried: the file is not there or not allowed. */
  async function download(url, onProgress, tries = 5) {
    const name = url.split("/").pop(); let chunks = [], got = 0, total = 0, resume = true, last;
    for (let attempt = 0; attempt < tries; attempt++) {
      if (attempt) await sleep(Math.min(8000, 700 * 2 ** (attempt - 1)));
      const before = got;
      try {
        const res = await fetch(url, got && resume ? {headers: {Range: `bytes=${got}-`}} : undefined);
        if (!res.ok) { const e = new Error(`cannot download ${url} (${res.status})`); e.http = res.status; throw e; }
        if (got && res.status === 206) { const m = /^bytes (\d+)-\d+\/(\d+)$/.exec(res.headers.get("content-range") || ""); if (!m || +m[1] !== got) throw new Error("bad range reply"); total = +m[2]; }
        else { chunks = []; got = 0; total = +(res.headers.get("content-length") || 0); }   // full body (first try, or the server ignored Range)
        if (!res.body) { const b = new Uint8Array(await res.arrayBuffer()); chunks.push(b); got += b.length; onProgress && onProgress(got, total || got); }
        else { const reader = res.body.getReader(); for (;;) { const {done, value} = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress && onProgress(got, total || got); } }
        if (total && got !== total) throw new Error(`truncated download of ${name} (${got} of ${total} bytes)`);
        const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
        return out.buffer;
      } catch (e) {
        last = e; console.warn(`download ${name}: attempt ${attempt + 1}/${tries} failed at ${got} bytes:`, e.message || e);
        if (e.http && e.http < 500 && e.http !== 408 && e.http !== 429) throw e;
        if (got === before && before > 0) { resume = false; chunks = []; got = 0; }   // the resumed request itself failed: start over from zero
      }
    }
    throw new Error(`connection lost while downloading ${name} (${got}${total ? " of " + total : ""} bytes): ${last && last.message || last}. Check your network and try again.`);
  }

  /** Fetch a model file through the Cache API (downloaded once per browser), reporting progress. -> ArrayBuffer */
  async function fetchCached(url, onProgress) {
    let cache = null; try { cache = await caches.open("thaocr-models-v1"); } catch { /* file:// or private mode */ }
    const hit = cache ? await cache.match(url) : null;
    if (hit) { const b = await hit.arrayBuffer(); onProgress && onProgress(b.byteLength, b.byteLength, true); return b; }
    const buf = await download(url, (got, total) => onProgress && onProgress(got, total, false));
    if (cache) { try { await cache.put(url, new Response(buf)); } catch { /* quota */ } }   // only a complete file is stored
    return buf;
  }
  const fetchJSON = async url => JSON.parse(new TextDecoder().decode(await fetchCached(url)));
  T.isCached = async url => { try { const c = await caches.open("thaocr-models-v1"); return !!(await c.match(url)); } catch { return false; } };
  T.clearModelCache = async () => { try { await caches.delete("thaocr-models-v1"); } catch { } };

  /** Load the ONNX Runtime bundle that fits the chosen backend (wasm-only is 15 MB of runtime, the WebGPU build 30 MB). */
  let ortLoading = null;
  function loadOrt(eps, fresh) {
    if (fresh) ortLoading = null;  // a new runtime instance (its own state), e.g. after its worker failed to start
    else if (window.ort) return Promise.resolve(window.ort);
    if (ortLoading) return ortLoading;
    const file = T.config.ortBase + (eps[0] === "webgpu" ? "ort.webgpu.min.js" : "ort.wasm.min.js");
    // retried, and a failure is not remembered (a rejected promise kept here would break every later scan until a page reload)
    ortLoading = (async () => {
      for (let i = 0; ; i++) {
        const s = document.createElement("script");
        try { await new Promise((res, rej) => { s.src = file; s.onload = res; s.onerror = () => rej(new Error("cannot load " + file)); document.head.appendChild(s); }); return window.ort; }
        catch (e) { s.remove(); if (i >= 2) { ortLoading = null; throw new Error(e.message + " - check your network and try again"); } await sleep(700 * 2 ** i); }
      }
    })();
    return ortLoading;
  }
  function ortEnv() {
    const ort = window.ort; if (!ort) throw new Error("onnxruntime-web not loaded");
    ort.env.wasm.wasmPaths = new URL(T.config.ortBase, location.href).href; // absolute URL (CDN by default; "vendor/" for a local copy)
    const hw = navigator.hardwareConcurrency || 2;
    ort.env.wasm.numThreads = T.config.threads > 0 ? T.config.threads : (self.crossOriginIsolated ? Math.max(1, Math.min(8, hw - 1)) : 1);
    ort.env.wasm.simd = true; ort.env.wasm.proxy = T.config.proxy !== false;
    return ort;
  }
  async function providers() {
    const want = T.config.backend;
    if (want === "wasm") return ["wasm"];
    if ((want === "auto" || want === "webgpu") && navigator.gpu) { try { const ad = await navigator.gpu.requestAdapter(); if (ad) return ["webgpu", "wasm"]; } catch { } }
    return ["wasm"];
  }
  /* Proxy mode: ONNX Runtime runs the models in its own worker, so long CPU (WebAssembly) runs - the recogniser, font and
     structure models always run there - no longer freeze taps, scrolling and painting. The worker is started once with a
     tiny built-in model; if it cannot start (a browser or policy that blocks it), the models run on the page as before. */
  const PROBE = Uint8Array.from(atob("CAcSADo3ChAKAXgSAXkiCElkZW50aXR5EgFwWg8KAXgSCgoICAESBAoCCAFiDwoBeRIKCggIARIECgIIAUIECgAQDQ=="), c => c.charCodeAt(0)); // Identity, 67 bytes
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
  let ortStarting = null;
  function ortStart(eps) {
    if (!ortStarting) ortStarting = (async () => {
      await loadOrt(eps); if (T.config.proxy === false) return;
      try { const s = await withTimeout(ortEnv().InferenceSession.create(PROBE.slice(), {executionProviders: ["wasm"]}), 120000, "the ONNX Runtime worker did not start");
        try { await s.release(); } catch { } }
      catch (e) { console.warn("ONNX Runtime worker unavailable, models run on the page instead:", (e && e.message) || e);
        T.config.proxy = false; T.proxyError = String((e && e.message) || e); await loadOrt(eps, true); }  // the failed runtime cannot initialise again
    })().catch(e => { ortStarting = null; throw e; });
    return ortStarting;
  }
  // In proxy mode the model bytes are handed over to the worker (the buffer is emptied here), so a create that may be
  // retried (WebGPU -> wasm) gets a copy.
  const copyOf = b => b instanceof ArrayBuffer ? b.slice(0) : b.slice();
  async function session(buf, eps) {
    await ortStart(eps); const ort = ortEnv(), opts = e => ({executionProviders: e, graphOptimizationLevel: "all"});
    if (eps[0] !== "wasm") {
      try { const s = await ort.InferenceSession.create(ort.env.wasm.proxy ? copyOf(buf) : buf, opts(eps)); return {sess: s, ep: eps[0]}; }
      catch (e) { console.warn("falling back to wasm:", e.message); }
    }
    const s = await ort.InferenceSession.create(buf, opts(["wasm"])); return {sess: s, ep: "wasm"};
  }
  /** Give the page a moment between heavy steps to handle taps, scrolling and painting. A MessageChannel task is not
      throttled in background tabs the way setTimeout is, so OCR keeps its speed while the tab is hidden. */
  const yieldQ = [], yieldCh = new MessageChannel(); yieldCh.port1.onmessage = () => { const f = yieldQ.shift(); if (f) f(); };
  T.yieldUI = () => new Promise(r => { yieldQ.push(r); yieldCh.port2.postMessage(0); });

  /** Load the given stage -> model id map (missing stages use the manifest defaults). onProgress({stage, id, got, total, fromCache}). */
  T.load = async function (choice, onProgress) {
    const m = await loadManifest(); choice = Object.assign({}, m.defaults, choice || {});
    const eps = await providers(); await ortStart(eps); T.backendUsed = eps[0];
    for (const stage of ["layout", "textdet", "rec", "font", "structure"]) {
      const id = choice[stage]; if (!id) continue;
      if (stage === "font" && !T.config.font) continue; if (stage === "structure" && !T.config.structure) continue;
      if (T.active[stage] === id && T.sessions[stage]) continue;
      const spec = T.spec(id); if (!spec) throw new Error(`unknown model ${id}`);
      const url = T.config.modelBase + spec.file;
      const buf = await fetchCached(url, (got, total, fromCache) => onProgress && onProgress({stage, id, got, total, fromCache}));
      // the recogniser is tiny-batch sequential work: wasm is as fast as WebGPU and avoids per-run GPU sync
      const {sess, ep} = await session(buf, stage === "rec" || stage === "structure" || stage === "font" ? ["wasm"] : eps);
      // everything the stage needs next to the model (recogniser vocab, font/structure meta) is fetched BEFORE the stage is registered:
      // a stage registered without its vocab/meta is skipped as "already active" by the next load and then fails on first use
      // ("Cannot read properties of undefined (reading '114')" in the recogniser)
      let vocab = null, fontMeta = null, structMeta = null;
      try {
        if (stage === "rec") { const v = await fetchJSON(T.config.modelBase + spec.vocab); vocab = v.itos || v; }
        if (stage === "font") fontMeta = await (await fetch(T.config.manifestBase + "font/font_meta.json")).json();
        if (stage === "structure") structMeta = await (await fetch(T.config.manifestBase + "structure/struct_meta.json")).json();
      } catch (e) { try { sess.release && await sess.release(); } catch { } throw e; }
      if (T.sessions[stage] && T.sessions[stage].sess.release) { try { await T.sessions[stage].sess.release(); } catch { } }
      T.sessions[stage] = {sess, ep, spec}; T.active[stage] = id;
      if (stage === "rec") { T.meta.vocab = vocab; T.meta.recStride = null; T.sessions.rec.vocab = vocab; }
      if (stage === "layout") T.meta.layoutNames = spec.classes || CLASSES;
      if (stage === "font") T.meta.font = fontMeta;
      if (stage === "structure") T.meta.structure = structMeta;
    }
    T.emit({type: "loaded"});
    return T.active;
  };
  T.loaded = () => !!(T.sessions.layout && T.sessions.textdet && T.sessions.rec);
  /** A second recogniser (the handwriting-trained CRNN) for doubtful lines; loaded on first need, wasm only. */
  T.altRecId = () => { const m = T.manifest; if (!m) return null; const want = m.models.filter(x => x.stage === "rec" && /hw/.test(x.id)); return (want.find(x => /int8/.test(x.id)) || want[0] || {}).id || null; };
  T.loadAltRec = async function (id, onProgress) {
    if (T.sessions.rec_alt && T.sessions.rec_alt.spec.id === id) return T.sessions.rec_alt;
    const spec = T.spec(id); if (!spec) throw new Error("unknown model " + id);
    const buf = await fetchCached(T.config.modelBase + spec.file, (got, total, fromCache) => onProgress && onProgress({stage: "rec_alt", id, got, total, fromCache}));
    const {sess, ep} = await session(buf, ["wasm"]); const v = await fetchJSON(T.config.modelBase + spec.vocab);
    T.sessions.rec_alt = {sess, ep, spec, vocab: v.itos || v}; return T.sessions.rec_alt;
  };

  /* ------------------------------------------------------------------ images */
  const MAX_SIDE = 3600;
  /** File | Blob | string(url) -> {canvas, width, height} (alpha on white, long side <= 3600, EXIF applied by the browser). */
  T.loadImage = async function (src) {
    let bmp;
    if (typeof src === "string") { const r = await fetch(src); if (!r.ok) throw new Error("cannot load " + src); bmp = await createImageBitmap(await r.blob(), {imageOrientation: "from-image"}); }
    else bmp = await createImageBitmap(src, {imageOrientation: "from-image"});
    let w = bmp.width, h = bmp.height; const s = Math.max(w, h) > MAX_SIDE ? MAX_SIDE / Math.max(w, h) : 1;
    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", {willReadFrequently: true}); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
    return {canvas: c, width: w, height: h};
  };
  function resized(canvas, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", {willReadFrequently: true}); x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0, w, h); return c; }
  const imgData = c => c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, c.width, c.height).data;

  /* ------------------------------------------------------------------ layout: YOLO11 */
  function letterbox(canvas, S) {
    const w = canvas.width, h = canvas.height, r = Math.min(S / h, S / w);
    const nw = Math.max(1, Math.min(S, Math.round(w * r))), nh = Math.max(1, Math.min(S, Math.round(h * r)));
    const dw = (S - nw) / 2, dh = (S - nh) / 2, left = Math.round(dw - 0.1), top = Math.round(dh - 0.1);
    const c = document.createElement("canvas"); c.width = S; c.height = S; const x = c.getContext("2d", {willReadFrequently: true});
    x.fillStyle = "rgb(114,114,114)"; x.fillRect(0, 0, S, S); x.imageSmoothingQuality = "high"; x.drawImage(canvas, left, top, nw, nh);
    return {canvas: c, r, px: left, py: top};
  }
  function nms(boxes, scores, iou) {
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]); const keep = []; const area = boxes.map(b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]));
    const alive = new Uint8Array(boxes.length).fill(1);
    for (let k = 0; k < order.length; k++) { const i = order[k]; if (!alive[i]) continue; keep.push(i);
      for (let m = k + 1; m < order.length; m++) { const j = order[m]; if (!alive[j]) continue;
        const iw = Math.min(boxes[i][2], boxes[j][2]) - Math.max(boxes[i][0], boxes[j][0]), ih = Math.min(boxes[i][3], boxes[j][3]) - Math.max(boxes[i][1], boxes[j][1]);
        if (iw <= 0 || ih <= 0) continue; const inter = iw * ih; if (inter / Math.max(1e-9, area[i] + area[j] - inter) > iou) alive[j] = 0; } }
    return keep;
  }
  T.detectLayout = async function (img, conf = 0.3, iou = 0.5) {
    const {sess, spec} = T.sessions.layout, S = (spec.input_size && spec.input_size[0]) || 1024;
    const lb = letterbox(img.canvas, S), d = imgData(lb.canvas), n = S * S, x = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { x[i] = d[i * 4] / 255; x[n + i] = d[i * 4 + 1] / 255; x[2 * n + i] = d[i * 4 + 2] / 255; }  // RGB
    const ort = window.ort, out = await sess.run({[sess.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S])});
    const o = out[sess.outputNames[0]]; let [, C, A] = o.dims; let data = o.data; let getv = (c, a) => data[c * A + a];
    if (C > A) { [C, A] = [A, C]; getv = (c, a) => data[a * C + c]; }
    const nc = C - 4, names = T.meta.layoutNames, boxes = [], scores = [], cls = [];
    for (let a = 0; a < A; a++) { let best = 0, bi = 0; for (let c = 0; c < nc; c++) { const v = getv(4 + c, a); if (v > best) { best = v; bi = c; } }
      if (best < conf) continue; const cx = getv(0, a), cy = getv(1, a), bw = getv(2, a), bh = getv(3, a);
      boxes.push([cx - bw / 2 + bi * 7680, cy - bh / 2 + bi * 7680, cx + bw / 2 + bi * 7680, cy + bh / 2 + bi * 7680]); scores.push(best); cls.push(bi); }
    const keep = nms(boxes, scores, iou).slice(0, 300), W = img.width, H = img.height, regions = [];
    for (const i of keep) { const off = cls[i] * 7680; const b = [(boxes[i][0] - off - lb.px) / lb.r, (boxes[i][1] - off - lb.py) / lb.r, (boxes[i][2] - off - lb.px) / lb.r, (boxes[i][3] - off - lb.py) / lb.r];
      b[0] = Math.min(W, Math.max(0, b[0])); b[2] = Math.min(W, Math.max(0, b[2])); b[1] = Math.min(H, Math.max(0, b[1])); b[3] = Math.min(H, Math.max(0, b[3]));
      const name = names[cls[i]] || String(cls[i]); regions.push({cls: resolveClass(name, b, W, H), score: scores[i], box: b, label: name}); }
    return regions;
  };

  /* ------------------------------------------------------------------ text lines: DB */
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  function dbSize(w, h, longMin, longMax) { const long = Math.max(w, h); const s = long < longMin ? Math.min(longMin / long, 3) : long > longMax ? longMax / long : 1;
    return [Math.max(32, Math.round(w * s / 32) * 32), Math.max(32, Math.round(h * s / 32) * 32)]; }
  async function dbProb(canvas, longMin, longMax) {
    const [nw, nh] = dbSize(canvas.width, canvas.height, longMin, longMax), d = imgData(resized(canvas, nw, nh)), n = nw * nh, x = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { // BGR order like the PaddleOCR / cv2 pipeline
      x[i] = (d[i * 4 + 2] / 255 - MEAN[0]) / STD[0]; x[n + i] = (d[i * 4 + 1] / 255 - MEAN[1]) / STD[1]; x[2 * n + i] = (d[i * 4] / 255 - MEAN[2]) / STD[2]; }
    const {sess} = T.sessions.textdet, ort = window.ort, out = await sess.run({[sess.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, nh, nw])});
    const o = out[sess.outputNames[0]]; return {prob: o.data, w: o.dims[3], h: o.dims[2]};
  }
  // ---- geometry helpers (replacing cv2.findContours / minAreaRect / boxPoints)
  function hull(pts) { // Andrew monotone chain, pts [[x,y]] -> ccw hull
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function minAreaRect(pts) { // -> {cx, cy, w, h, ang (rad)} smallest-area rectangle around the hull (rotating calipers)
    const hp = hull(pts); if (hp.length === 1) return {cx: hp[0][0], cy: hp[0][1], w: 1, h: 1, ang: 0};
    let best = null;
    for (let i = 0; i < hp.length; i++) { const a = hp[i], b = hp[(i + 1) % hp.length]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const c = Math.cos(ang), s = Math.sin(ang);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of hp) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; if (u < x0) x0 = u; if (u > x1) x1 = u; if (v < y0) y0 = v; if (v > y1) y1 = v; }
      const area = (x1 - x0) * (y1 - y0); if (!best || area < best.area) { const ucx = (x0 + x1) / 2, vcy = (y0 + y1) / 2; best = {area, cx: ucx * c - vcy * s, cy: ucx * s + vcy * c, w: x1 - x0, h: y1 - y0, ang}; } }
    return best;
  }
  function boxPoints(r) { const c = Math.cos(r.ang), s = Math.sin(r.ang), hw = r.w / 2, hh = r.h / 2; return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [r.cx + u * c - v * s, r.cy + u * s + v * c]); }
  function orderPoints(p) { const sum = p.map(q => q[0] + q[1]), dif = p.map(q => q[1] - q[0]); const am = a => a.indexOf(Math.min(...a)), aM = a => a.indexOf(Math.max(...a)); return [p[am(sum)], p[am(dif)], p[aM(sum)], p[aM(dif)]]; }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function components(mask, w, h, maxN) { // 8-connected components of a 0/1 mask -> [{pts (boundary px), all (count), idx (Int32Array of pixel indices)}]
    const lab = new Int32Array(w * h); const comps = []; const stack = new Int32Array(w * h); let n = 0;
    for (let i = 0; i < w * h && comps.length < maxN; i++) { if (!mask[i] || lab[i]) continue; n++; let sp = 0; stack[sp++] = i; lab[i] = n; const idx = [];
      while (sp) { const p = stack[--sp]; idx.push(p); const px = p % w, py = (p - px) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue; const q = qy * w + qx; if (mask[q] && !lab[q]) { lab[q] = n; stack[sp++] = q; } } }
      comps.push(idx); }
    return comps;
  }
  function boxesFromProb(prob, pw, ph, W, H, p) {
    const {thresh, box_thresh, unclip_ratio, v_extra} = p, mask = new Uint8Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) mask[i] = prob[i] > thresh ? 1 : 0;
    const sx = W / pw, sy = H / ph, out = [];
    for (const idx of components(mask, pw, ph, 1500)) {
      if (idx.length < 4) continue;
      // boundary pixels (a 4-neighbour outside the mask) as polygon points at pixel corners
      const pts = []; let sum = 0;
      for (const q of idx) { const x = q % pw, y = (q - x) / pw; sum += prob[q];
        if (x === 0 || y === 0 || x === pw - 1 || y === ph - 1 || !mask[q - 1] || !mask[q + 1] || !mask[q - pw] || !mask[q + pw]) pts.push([x, y], [x + 1, y + 1]); }
      const rect = minAreaRect(pts); if (Math.min(rect.w, rect.h) < 3) continue;
      const score = sum / idx.length; if (score < box_thresh) continue;
      const d = rect.w * rect.h * unclip_ratio / (2 * (rect.w + rect.h)); let w2 = rect.w + 2 * d, h2 = rect.h + 2 * d; if (w2 >= h2) h2 *= v_extra; else w2 *= v_extra;
      let nb = boxPoints({cx: rect.cx, cy: rect.cy, w: w2, h: h2, ang: rect.ang}).map(([x, y]) => [Math.min(W - 1, Math.max(0, x * sx)), Math.min(H - 1, Math.max(0, y * sy))]);
      nb = orderPoints(nb); if (Math.min(dist(nb[1], nb[0]), dist(nb[3], nb[0])) < 5) continue;
      out.push({quad: nb, score});
    }
    return dropContained(out);
  }
  const bboxOf = q => [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))];
  const bArea = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const bInter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  function dropContained(items, frac = 0.55, tiny = 0.08) {
    const bb = items.map(it => bboxOf(it.quad)), ar = bb.map(bArea), keep = [];
    for (const i of items.map((_, k) => k).sort((a, b) => ar[b] - ar[a])) { let inside = false;
      for (const j of keep) { if (ar[i] > 0 && bInter(bb[i], bb[j]) / ar[i] > frac && ar[i] < tiny * ar[j]) { inside = true; break; } }
      if (!inside) keep.push(i); }
    return keep.sort((a, b) => a - b).map(i => items[i]);
  }
  T.detectLines = async function (canvas, longMin, longMax, params) {
    const p = Object.assign({thresh: 0.3, box_thresh: 0.5, unclip_ratio: 1.6, v_extra: 1.0}, (T.sessions.textdet.spec.params || {}), params || {});
    const {prob, w, h} = await dbProb(canvas, longMin || T.config.longMin, longMax || T.config.longMax);
    return boxesFromProb(prob, w, h, canvas.width, canvas.height, p);
  };

  /* ------------------------------------------------------------------ line crops */
  const REC_H = 48, FONT_H = 32, PAD_X = 0.25, PAD_Y = 0.08, MIN_W = 16, MAX_W = 4200;
  /** Rectify a quad (tl,tr,br,bl) to a grey crop of height outH (affine fit of the quad; edge margin like the backend).
      -> {gray: Uint8Array, w, h, srcH (quad height in page px)} */
  T.cropLine = function (canvas, quad, outH) {
    const W = canvas.width, H = canvas.height; let q = quad.map(p => [p[0], p[1]]);
    const hv = [(q[3][0] - q[0][0] + q[2][0] - q[1][0]) / 2, (q[3][1] - q[0][1] + q[2][1] - q[1][1]) / 2], hh = Math.hypot(hv[0], hv[1]);
    if (hh > 0) { let ux = [(q[1][0] - q[0][0] + q[2][0] - q[3][0]) / 2, (q[1][1] - q[0][1] + q[2][1] - q[3][1]) / 2]; const ul = Math.max(1e-6, Math.hypot(ux[0], ux[1])); ux = [ux[0] / ul, ux[1] / ul];
      const uy = [hv[0] / hh, hv[1] / hh], px = PAD_X * hh, py = PAD_Y * hh;
      q = [[q[0][0] - ux[0] * px - uy[0] * py, q[0][1] - ux[1] * px - uy[1] * py], [q[1][0] + ux[0] * px - uy[0] * py, q[1][1] + ux[1] * px - uy[1] * py],
           [q[2][0] + ux[0] * px + uy[0] * py, q[2][1] + ux[1] * px + uy[1] * py], [q[3][0] - ux[0] * px + uy[0] * py, q[3][1] - ux[1] * px + uy[1] * py]]; }
    q = q.map(p => [Math.min(W - 1, Math.max(0, p[0])), Math.min(H - 1, Math.max(0, p[1]))]);
    const w = Math.min(Math.max(4, Math.round(Math.max(dist(q[1], q[0]), dist(q[2], q[3])))), Math.max(W, 4)), h = Math.min(Math.max(4, Math.round(Math.max(dist(q[3], q[0]), dist(q[2], q[1])))), Math.max(H, 4));
    const ow = Math.min(MAX_W, Math.max(MIN_W, Math.round(w * outH / h)));
    // affine M with M(tl)=(0,0), M(tr)=(ow,0), M(bl)=(0,outH): dst = A*src + t
    const [tl, tr, , bl] = q; const dx = [tr[0] - tl[0], tr[1] - tl[1]], dy = [bl[0] - tl[0], bl[1] - tl[1]]; const det = dx[0] * dy[1] - dx[1] * dy[0];
    const c = document.createElement("canvas"); c.width = ow; c.height = outH; const x = c.getContext("2d", {willReadFrequently: true});
    x.fillStyle = "#fff"; x.fillRect(0, 0, ow, outH);
    if (Math.abs(det) > 1e-6) { // inverse of [dx dy] scaled to output size
      const a = ow * dy[1] / det, b = -outH * dx[1] / det, cc = -ow * dy[0] / det, d = outH * dx[0] / det;
      x.setTransform(a, b, cc, d, -(a * tl[0] + cc * tl[1]), -(b * tl[0] + d * tl[1])); x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0); }
    const dd = imgData(c), g = new Uint8Array(ow * outH);
    for (let i = 0; i < g.length; i++) g[i] = (dd[i * 4] * 299 + dd[i * 4 + 1] * 587 + dd[i * 4 + 2] * 114 + 500) / 1000;
    return {gray: g, w: ow, h: outH, srcH: h, srcW: w};
  };

  /* ------------------------------------------------------------------ recogniser: CRNN-CTC */
  async function recLogits(x, N, Wd, key = "rec") { const {sess} = T.sessions[key], ort = window.ort; const out = await sess.run({[sess.inputNames[0]]: new ort.Tensor("float32", x, [N, 1, REC_H, Wd])}); const o = out[sess.outputNames[0]]; return o; }
  async function recStride(key = "rec") { const S = T.sessions[key]; if (S.stride) return S.stride; const o = await recLogits(new Float32Array(REC_H * 256), 1, 256, key); S.stride = Math.max(1, Math.round(256 / o.dims[0])); if (key === "rec") T.meta.recStride = S.stride; return S.stride; }
  async function recBatch(crops, key = "rec") {
    const s = await recStride(key), Wd = Math.ceil(Math.max(...crops.map(c => c.w)) / s) * s, N = crops.length, x = new Float32Array(N * REC_H * Wd);
    crops.forEach((c, i) => { const base = i * REC_H * Wd; for (let y = 0; y < REC_H; y++) for (let xx = 0; xx < Wd; xx++) x[base + y * Wd + xx] = (c.gray[y * c.w + Math.min(xx, c.w - 1)] / 255 - 0.5) / 0.5; });
    const o = await recLogits(x, N, Wd, key), [Tn, Nn, C] = o.dims, d = o.data, itos = T.sessions[key].vocab || T.meta.vocab, out = [];
    for (let i = 0; i < N; i++) { const Tl = Math.min(Tn, Math.max(1, Math.floor(crops[i].w / s))); let prev = -1; const seq = [], cs = [], pos = [];
      for (let k = 0; k < Tl; k++) { const off = (k * Nn + i) * C; let m = -Infinity, mi = 0; for (let c = 0; c < C; c++) { const v = d[off + c]; if (v > m) { m = v; mi = c; } }
        if (mi !== prev && mi !== 0) { let z = 0; for (let c = 0; c < C; c++) z += Math.exp(d[off + c] - m); seq.push(itos[mi] || ""); cs.push(1 / z); pos.push((k + 0.5) / Tl); } prev = mi; }
      out.push({text: seq.join(""), confidence: cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 0, pos}); }
    return out;
  }
  /** crops: [{gray,w,h}] at height 48 -> [{text, confidence, pos}] in the same order (width-bucketed batches of <= maxBatch). */
  T.recognize = async function (crops, maxBatch = 16, onBatch, key = "rec") {
    if (!crops.length) return [];
    const order = crops.map((_, i) => i).sort((a, b) => crops[a].w - crops[b].w), res = new Array(crops.length); let i = 0, done = 0;
    while (i < order.length) { let j = i + 1; const w0 = crops[order[i]].w; while (j < order.length && j - i < maxBatch && crops[order[j]].w <= 1.35 * w0 + 16) j++;
      const r = await recBatch(order.slice(i, j).map(k => crops[k]), key); order.slice(i, j).forEach((k, n) => res[k] = r[n]); done += j - i; onBatch && onBatch(done, crops.length); i = j; await T.yieldUI(); }
    return res;
  };

  /* ------------------------------------------------------------------ font classifier */
  function fontWindows(c32) { const {gray, w} = c32, H = FONT_H, Wn = 256;
    if (w <= Wn) { const edge = []; for (let y = 0; y < H; y++) edge.push(gray[y * w], gray[y * w + 1], gray[y * w + w - 2], gray[y * w + w - 1]); edge.sort((a, b) => a - b); const fill = edge[edge.length >> 1];
      const pad = Wn - w, l = pad >> 1, g = new Uint8Array(H * Wn).fill(fill); for (let y = 0; y < H; y++) g.set(gray.subarray(y * w, y * w + w), y * Wn + l); return [g]; }
    const n = Math.min(3, Math.ceil(w / Wn)), out = [];
    for (let k = 0; k < n; k++) { const x0 = n > 1 ? Math.round(k * (w - Wn) / (n - 1)) : 0, g = new Uint8Array(H * Wn); for (let y = 0; y < H; y++) g.set(gray.subarray(y * w + x0, y * w + x0 + Wn), y * Wn); out.push(g); }
    return out;
  }
  /** crops32: [{gray,w,h,srcH}] -> [{family, confidence, weight, slant, probs, em_ratio?, em_px?}] */
  T.classifyFonts = async function (crops32, maxBatch = 64) {
    if (!crops32.length || !T.sessions.font) return crops32.map(() => null);
    const wins = [], owners = []; for (const c of crops32) { const ws = fontWindows(c); owners.push(ws.map((_, k) => wins.length + k)); wins.push(...ws); }
    const {sess} = T.sessions.font, ort = window.ort, meta = T.meta.font, fam = [], wt = [], sl = [], sz = [];
    for (let i = 0; i < wins.length; i += maxBatch) { const b = wins.slice(i, i + maxBatch), x = new Float32Array(b.length * FONT_H * 256); b.forEach((g, k) => { const o = k * FONT_H * 256; for (let j = 0; j < g.length; j++) x[o + j] = (g[j] / 255 - 0.5) / 0.5; });
      const out = await sess.run({[sess.inputNames[0]]: new ort.Tensor("float32", x, [b.length, 1, FONT_H, 256])}); await T.yieldUI();
      const F = out.family, Wt = out.weight, Sl = out.slant, Sz = out.size;
      for (let k = 0; k < b.length; k++) { fam.push(Array.from(F.data.subarray(k * F.dims[1], (k + 1) * F.dims[1]))); wt.push(Array.from(Wt.data.subarray(k * 2, k * 2 + 2))); sl.push(Array.from(Sl.data.subarray(k * 2, k * 2 + 2))); sz.push(Sz ? Sz.data[k] : null); } }
    const mean = arrs => arrs[0].map((_, j) => arrs.reduce((a, r) => a + r[j], 0) / arrs.length), argmax = a => a.indexOf(Math.max(...a));
    return crops32.map((c, i) => { const idx = owners[i], f = mean(idx.map(k => fam[k])), w = mean(idx.map(k => wt[k])), s = mean(idx.map(k => sl[k])), fi = argmax(f);
      const r = {family: meta.families[fi], confidence: +f[fi].toFixed(4), weight: meta.weights[argmax(w)], weight_confidence: +Math.max(...w).toFixed(4), slant: meta.slants[argmax(s)], slant_confidence: +Math.max(...s).toFixed(4), probs: f};
      if (sz[idx[0]] != null) { const ratio = idx.reduce((a, k) => a + sz[k], 0) / idx.length; r.em_ratio = +ratio.toFixed(4); r.em_px = +(ratio * c.srcH).toFixed(2); } return r; });
  };

  /* ------------------------------------------------------------------ structure model */
  const BULLET_RE = /^\s*([•\-–—○o◦▪■➢►✓*·>»›➤❖✧√✔+□❑☐]|\d{1,3}[.)]|[០-៩]{1,3}[.)]|[a-zA-Z][.)]|[ក-អ][.)]|[ivx]{1,4}[.)])\s/, TERMINAL_RE = /[។.:៖!?]\s*$/;
  const KHMER_RE = /[ក-៿]/g, DIGIT_RE = /[0-9០-៩]/g, LATIN_RE = /[A-Za-z]/g, UPPER_RE = /[A-Z]/g;
  const hashChar = ch => Number((BigInt(ch.codePointAt(0)) * 2654435761n) % 2047n) + 1;
  function charIds(text) { const t = text.trim(), head = [...t].slice(0, 3), tail = t.length >= 3 ? [...t].slice(-3) : [...t]; const ids = [...head.map(hashChar), ...Array(3 - head.length).fill(0), ...tail.map(hashChar), ...Array(3 - tail.length).fill(0)]; return ids.slice(0, 6); }
  const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); if (!s.length) return 0; const k = (s.length - 1) * p / 100, lo = Math.floor(k), hi = Math.ceil(k); return s[lo] + (s[hi] - s[lo]) * (k - lo); };
  const median = a => a.length ? pct(a, 50) : 0;
  function lineFeatures(boxes, texts, bold, bullets, W, H) {
    const n = boxes.length, h = boxes.map(b => Math.max(1, b[3] - b[1])), medH = n ? median(h) : 1, left = n ? pct(boxes.map(b => b[0]), 5) : 0, right = n ? pct(boxes.map(b => b[2]), 95) : W;
    const order = boxes.map((_, i) => i).sort((a, b) => (boxes[a][1] + boxes[a][3]) - (boxes[b][1] + boxes[b][3])), ga = new Float32Array(n), gb = new Float32Array(n);
    order.forEach((i, k) => { if (k > 0) ga[i] = (boxes[i][1] - boxes[order[k - 1]][3]) / medH; if (k < n - 1) gb[i] = (boxes[order[k + 1]][1] - boxes[i][3]) / medH; });
    const f = new Float32Array(n * 23), cnt = (t, re) => (t.match(re) || []).length, clip = (v, a, b) => Math.min(b, Math.max(a, v));
    for (let i = 0; i < n; i++) { const [x0, y0, x1, y1] = boxes[i], t = texts[i], L = Math.max(1, t.trim().length);
      f.set([x0 / W, y0 / H, x1 / W, y1 / H, (x1 - x0) / W, h[i] / medH, (x0 + x1) / 2 / W, (y0 + y1) / 2 / H, (x0 - left) / W, (right - x1) / W, cnt(t, KHMER_RE) / L, cnt(t, DIGIT_RE) / L, cnt(t, LATIN_RE) / L,
        cnt(t, UPPER_RE) / L, Math.log1p(L) / 5, BULLET_RE.test(t + " ") ? 1 : 0, TERMINAL_RE.test(t) ? 1 : 0, bold[i], bullets[i], Math.min(4, h[i] / medH), clip(ga[i], -2, 6), clip(gb[i], -2, 6), Math.min(1, n / 256)], i * 23); }
    return f;
  }
  function decodeOrder(succ, N, boxes) { // succ: Float32Array [N, N+1] logits
    const P = new Float32Array(N * (N + 1)); for (let i = 0; i < N; i++) { let m = -Infinity; for (let j = 0; j <= N; j++) m = Math.max(m, succ[i * (N + 1) + j]); let z = 0; for (let j = 0; j <= N; j++) { const e = Math.exp(succ[i * (N + 1) + j] - m); P[i * (N + 1) + j] = e; z += e; } for (let j = 0; j <= N; j++) P[i * (N + 1) + j] /= z; }
    const incoming = new Float32Array(N); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) incoming[j] += P[i * (N + 1) + j];
    const used = new Uint8Array(N), order = [];
    while (order.length < N) { let cur = -1, best = Infinity; for (let i = 0; i < N; i++) if (!used[i]) { const key = incoming[i] + boxes[i][1] / 1e6; if (key < best) { best = key; cur = i; } }
      used[cur] = 1; order.push(cur);
      while (order.length < N) { let nxt = -1, bv = -Infinity; for (let j = 0; j <= N; j++) { if (j < N && used[j]) continue; const v = P[cur * (N + 1) + j]; if (v > bv) { bv = v; nxt = j; } } if (nxt === N || nxt < 0 || bv <= 0) break; used[nxt] = 1; order.push(nxt); cur = nxt; } }
    return order;
  }
  /** lines: [{bbox, text, bold, bullet}] -> [{role, role_p, first, first_p, level, bullet, order}] */
  T.predictStructure = async function (lines, W, H) {
    const basic = lines.map((l, i) => ({role: "text", role_p: 0, first: true, first_p: 1, level: 0, bullet: !!l.bullet, order: i}));
    if (lines.length < 2 || !T.sessions.structure) return basic;
    const geo = lines.map((_, i) => i).sort((a, b) => ((lines[a].bbox[1] + lines[a].bbox[3]) / 2 - (lines[b].bbox[1] + lines[b].bbox[3]) / 2) || (lines[a].bbox[0] - lines[b].bbox[0])).slice(0, 256);
    const boxes = geo.map(k => lines[k].bbox), texts = geo.map(k => lines[k].text || ""), N = geo.length;
    const feats = lineFeatures(boxes, texts, geo.map(k => lines[k].bold ? 1 : 0), geo.map(k => lines[k].bullet ? 1 : 0), W, H), chars = new BigInt64Array(N * 6); texts.forEach((t, i) => charIds(t).forEach((v, j) => chars[i * 6 + j] = BigInt(v)));
    const {sess} = T.sessions.structure, ort = window.ort, out = await sess.run({feats: new ort.Tensor("float32", feats, [1, N, 23]), chars: new ort.Tensor("int64", chars, [1, N, 6])});
    const role = out.role, first = out.first, level = out.level, bullet = out.bullet, succ = out.succ, R = role.dims[2], Lv = level.dims[2], roles = T.meta.structure.roles;
    const order = decodeOrder(succ.data, N, boxes), rank = {}; order.forEach((k, r) => rank[geo[k]] = r);
    const res = basic.slice(); let nxt = N;
    geo.forEach((idx, k) => { let ri = 0, m = -1; for (let r = 0; r < R; r++) if (role.data[k * R + r] > m) { m = role.data[k * R + r]; ri = r; } let li = 0, lm = -1; for (let r = 0; r < Lv; r++) if (level.data[k * Lv + r] > lm) { lm = level.data[k * Lv + r]; li = r; }
      res[idx] = {role: roles[ri], role_p: m, first: first.data[k * 2 + 1] >= 0.5, first_p: first.data[k * 2 + 1], level: li, bullet: bullet.data[k * 2 + 1] >= 0.5, order: rank[idx]}; });
    res.forEach((r, i) => { if (i >= N && rank[i] == null) r.order = nxt++; });
    return res;
  };

  T.util = {hull, minAreaRect, boxPoints, orderPoints, bboxOf, bArea, bInter, median, pct, nms, resized, imgData, BULLET_RE};
})();
