/* Device check: what this browser can do, which model set fits it, and how long a page will take. Nothing leaves the device. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};
  const KEY = "thaocr.device.v1";

  T.deviceInfo = async function () {
    const ua = navigator.userAgentData || null, nav = navigator;
    const mobile = ua ? !!ua.mobile : /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
    let webgpu = false, gpuName = null;
    if (nav.gpu) { try { const ad = await nav.gpu.requestAdapter(); if (ad) { webgpu = true; const inf = ad.info || (ad.requestAdapterInfo ? await ad.requestAdapterInfo() : null); gpuName = inf && (inf.description || inf.device || inf.vendor || inf.architecture) || null; } } catch { } }
    let simd = false; try { simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { }
    const conn = nav.connection || null;
    let storage = null; try { if (nav.storage && nav.storage.estimate) { const e = await nav.storage.estimate(); storage = {usage: e.usage || 0, quota: e.quota || 0}; } } catch { }
    return {threads: nav.hardwareConcurrency || 2, memoryGB: nav.deviceMemory || null, mobile, webgpu, gpuName, simd, threadsOK: !!self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined",
      downlinkMbps: conn && conn.downlink ? conn.downlink : null, saveData: !!(conn && conn.saveData), platform: ua ? ua.platform : nav.platform, storage};
  };

  /** Pick the model set and detector scale for a device. tier: "high" | "mid" | "low" */
  T.recommend = function (info) {
    const strong = info.webgpu || (info.threads >= 8 && (info.memoryGB || 8) >= 8 && !info.mobile);
    const weak = info.mobile || info.threads <= 4 || (info.memoryGB && info.memoryGB <= 4) || info.saveData;
    const tier = strong ? "high" : weak ? "low" : "mid";
    const d = T.manifest ? T.manifest.defaults : {layout: "layout_yolo11n_v4_22cls", textdet: "db_ppocrv5_khmer_v2", rec: "crnn_m_v2_stamp2", font: "font_cnn_v2", structure: "struct_v1"};
    const choice = Object.assign({}, d);
    const has = id => !T.manifest || T.manifest.models.some(m => m.id === id);
    if (tier === "high") { if (has("crnn_m_v2_stamp3")) choice.rec = "crnn_m_v2_stamp3"; }
    else if (tier === "mid") { if (has(d.rec + "_int8")) choice.rec = d.rec + "_int8"; }
    else { if (has(d.rec + "_int8")) choice.rec = d.rec + "_int8"; }
    const scale = tier === "high" ? {longMin: 1600, longMax: 2200} : tier === "mid" ? {longMin: 1600, longMax: 1800} : {longMin: 1100, longMax: 1300};
    const reasons = [];
    if (info.webgpu) reasons.push("WebGPU available: the layout and line detectors run on the GPU");
    else reasons.push("no WebGPU: everything runs on the CPU (WebAssembly)");
    if (!info.threadsOK) reasons.push("single-thread mode (this host does not send the cross-origin isolation headers)"); else reasons.push(`${Math.min(8, info.threads - 1)} worker threads`);
    if (info.mobile) reasons.push("phone or tablet: smaller detector scale and the int8 recogniser");
    if (info.memoryGB && info.memoryGB <= 4) reasons.push("4 GB memory or less: int8 recogniser");
    return {tier, choice, scale, reasons};
  };

  /** Bytes still to download for a choice (models not yet in the cache) -> {bytes, files, cachedFiles} */
  T.downloadPlan = async function (choice) {
    const files = []; let bytes = 0, cachedFiles = 0;
    const sizes = (T.manifest && T.manifest.sizes) || {};
    for (const [stage, id] of Object.entries(choice)) { const s = T.spec(id); if (!s) continue; if ((stage === "font" && !T.config.font) || (stage === "structure" && !T.config.structure)) continue;
      const url = T.modelUrl(s.file), cached = await T.isCached(url); const size = sizes[s.file] || 0; files.push({stage, id, file: s.file, size, cached}); if (cached) cachedFiles++; else bytes += size; }
    const rt = {wasm: 15.1e6, webgpu: 29.6e6}; const rtFile = "vendor/ort-wasm-simd-threaded" + (T.backendUsed === "webgpu" ? ".jsep" : "") + ".wasm";
    files.unshift({stage: "runtime", id: "onnxruntime-web", file: rtFile, size: T.backendUsed === "webgpu" ? rt.webgpu : rt.wasm, cached: await T.isCached(rtFile)});
    if (!files[0].cached) bytes += files[0].size;
    return {bytes, files, cachedFiles};
  };

  /** Short benchmark once the models are loaded -> {layoutMs, detMs, recMsPerLine, at} (stored). */
  T.benchmark = async function (sample) {
    const t = {};
    const c = document.createElement("canvas"); c.width = 1200; c.height = 1600; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 1200, 1600); x.fillStyle = "#000"; x.font = "28px sans-serif";
    for (let i = 0; i < 30; i++) x.fillText("ThaOCR benchmark line " + i + " ខ្មែរ អង់គ្លេស ០១២៣៤៥៦៧៨៩", 100, 120 + i * 44);
    const img = {canvas: c, width: 1200, height: 1600};
    await T.detectLayout(img); let t0 = performance.now(); await T.detectLayout(img); t.layoutMs = performance.now() - t0;          // second run = warm
    await T.detectLines(c, T.config.longMin, T.config.longMax); t0 = performance.now(); const lines = await T.detectLines(c, T.config.longMin, T.config.longMax); t.detMs = performance.now() - t0;
    const crops = lines.slice(0, 16).map(l => T.cropLine(c, l.quad, 48)); while (crops.length < 8) crops.push({gray: new Uint8Array(48 * 400).fill(255), w: 400, h: 48});
    await T.recognize(crops); t0 = performance.now(); await T.recognize(crops); t.recMsPerLine = (performance.now() - t0) / crops.length;
    t.at = Date.now(); t.backend = T.backendUsed; t.models = Object.assign({}, T.active);
    localStorage.setItem(KEY, JSON.stringify(t)); return t;
  };
  T.benchmarkStored = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  /** Seconds for one page with n lines (defaults to a typical 40-line page). */
  T.estimate = function (bench, nLines = 40) { if (!bench) return null; const ms = bench.layoutMs + bench.detMs * 1.3 + nLines * bench.recMsPerLine * 1.25 + 400; return Math.max(1, Math.round(ms / 1000)); };
  /** After a real page: blend the measured time into the stored benchmark so the estimate learns. */
  T.learn = function (totalMs, nLines) { const b = T.benchmarkStored(); if (!b || !nLines) return; const est = T.estimate(b, nLines) * 1000; const k = Math.min(2, Math.max(0.5, totalMs / est)); b.layoutMs *= (1 + k) / 2; b.detMs *= (1 + k) / 2; b.recMsPerLine *= (1 + k) / 2; localStorage.setItem(KEY, JSON.stringify(b)); };
  T.fmtBytes = b => b >= 1e6 ? (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
})();
