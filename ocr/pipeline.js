/* ThaOCR browser pipeline: image -> layout -> lines -> text -> fonts -> structure -> page result (same schema as the
   backend's /process response, so the review UI and DocView work unchanged). Port of pipeline_service.py,
   reading_order.py, parts of doc_structure.py / page_structure.py / document.py. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};
  const {TEXT_CLASSES, CROP_CLASSES, COLORS, LABELS, legacyType, hex} = T;
  const U = T.util, LOW = 0.8, LAYOUT_PAD = 2, STAMP_CLASSES = new Set(["stamp", "signature"]);
  const HEAVY = new Set(["Khmer OS Muol", "Khmer OS Muol Light", "Khmer OS Muol Pali", "Khmer OS Bokor", "Khmer OS Metal Chrieng", "Koulen", "Dangrek", "Bayon", "Angkor", "Taprom"]);
  const BULLET_READINGS = new Set(["o", "O", "0", "០", "•", "-", "·", "*", "e", "c", "C", "D", "Q", "–", "—", "▪", "■", "○", "●", "◦", "➢", "►", "✓", ">", "<", "»", "›", "➤", "❖", "✧", "√", "✔", "+", "P", "p", "v", "V", "4", "□", "❑", "☐", "y", "Y"]);
  const iou = (a, b) => { const i = U.bInter(a, b); return i ? i / (U.bArea(a) + U.bArea(b) - i) : 0; };
  const inside = (c, box, tol = 0) => box[0] - tol <= c[0] && c[0] <= box[2] + tol && box[1] - tol <= c[1] && c[1] <= box[3] + tol;
  const centre = q => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
  const quadOf = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const block = (cls, box, score = 1, label = "", source = "layout") => ({cls, box: box.slice(), score, label: label || cls, source, lines: []});
  /** Model-only mode (default): grouping, reading order and paragraphs come from the layout and structure models alone.
      With T.config.rules = true the geometric rules run as well (paragraph merging, aligned columns -> table,
      row-segment joining, XY-cut reading order). */
  const modelOnly = () => T.config.rules === false;
  const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

  /* ---------------------------------------------------------------- stamps over text */
  /** Copy of the page with the coloured ink of each stamp box whitened (red or blue, by the box's dominant hue), so a
      line running under a stamp can be read. Dark (grey) text ink is kept. */
  function destamp(canvas, boxes) {
    const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(canvas, 0, 0);
    for (const b of boxes) { const pad = 0.08 * Math.max(b[2] - b[0], b[3] - b[1]); const x0 = Math.max(0, Math.floor(b[0] - pad)), y0 = Math.max(0, Math.floor(b[1] - pad)), x1 = Math.min(c.width, Math.ceil(b[2] + pad)), y1 = Math.min(c.height, Math.ceil(b[3] + pad)); if (x1 - x0 < 4 || y1 - y0 < 4) continue;
      const im = g.getImageData(x0, y0, x1 - x0, y1 - y0), d = im.data; let red = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2], mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); if (mx - mn < 60) continue; if (r === mx) red++; else if (bb === mx) blue++; }
      const hue = red >= blue ? "r" : "b"; if (red + blue < 50) continue;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2], mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); if (mx - mn < 45) continue;
        if ((hue === "r" && r === mx && r > gg * 1.15) || (hue === "b" && bb === mx && bb > r * 1.1)) { d[i] = d[i + 1] = d[i + 2] = 255; } }
      g.putImageData(im, x0, y0); }
    return c;
  }
  const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  /** Word-level bold for lines the font model is unsure about: each word window of the 32-px crop is classified on
      its own, consecutive words with the same weight become spans. */
  async function wordBold(ln, crop32) {
    const text = ln.text || "", pos = ln.char_pos; if (!pos || pos.length !== text.length || !text.includes(" ")) return;
    const words = []; let st = 0; for (let i = 0; i <= text.length; i++) { if (i === text.length || text[i] === " ") { if (i > st) words.push([st, i]); st = i + 1; } }
    if (words.length < 2 || words.length > 40) return;
    const {gray, w, h} = crop32, crops = [];
    for (const [a, b] of words) { const x0 = Math.max(0, Math.floor((pos[a] - 0.5 / Math.max(1, b - a)) * w) - 3), x1 = Math.min(w, Math.ceil(pos[b - 1] * w) + Math.round(0.02 * w) + 3); const cw = Math.max(12, x1 - x0), g = new Uint8Array(cw * h).fill(255);
      for (let y = 0; y < h; y++) for (let x = 0; x < x1 - x0; x++) g[y * cw + x] = gray[y * w + x0 + x]; crops.push({gray: g, w: cw, h, srcH: crop32.srcH}); }
    const fr = await T.classifyFonts(crops); const bold = fr.map(f => !!f && f.weight === "bold" && f.weight_confidence >= 0.75);
    const spans = []; words.forEach(([a, b], i) => { const t = text.slice(a, b); const last = spans[spans.length - 1]; if (last && last.bold === bold[i]) last.text += " " + t; else spans.push({text: t, bold: bold[i]}); });
    if (spans.length >= 2) { ln.spans = spans; ln.bold = false; } else { ln.bold = spans.length ? spans[0].bold : ln.bold; }
  }

  /* ---------------------------------------------------------------- regions -> blocks */
  function cleanRegions(regions, W, H) {
    const blocks = [], ignored = [];
    for (const r of regions.slice().sort((a, b) => b.score - a.score)) {
      const b = block(r.cls, r.box, r.score, r.label);
      if (b.cls === "figure" && U.bArea(b.box) > 0.5 * W * H) { ignored.push({...r, reason: "page_sized_figure"}); continue; }
      if (blocks.some(k => iou(b.box, k.box) > 0.7)) { ignored.push({...r, reason: "duplicate"}); continue; }
      blocks.push(b);
    }
    return {blocks, ignored};
  }
  /** Lines the page pass missed inside text regions: detect again on the region crop (DET_CASCADE). */
  async function cascade(img, blocks, lines) {
    const kept = lines.map(l => U.bboxOf(l.quad));
    for (const b of blocks) {
      if (!TEXT_CLASSES.has(b.cls) && b.cls !== "figure" && b.cls !== "logo") continue;
      const [x0, y0, x1, y1] = b.box, area = Math.max(1, U.bArea(b.box));
      const ins = kept.filter(k => inside([(k[0] + k[2]) / 2, (k[1] + k[3]) / 2], b.box));
      if (ins.length && ins.reduce((a, k) => a + U.bArea(k), 0) / area >= 0.3) continue;
      const grow = (b.cls === "figure" || b.cls === "logo") ? 0.5 : 0.04, mx = Math.max(6, grow * (x1 - x0)), my = Math.max(6, grow * (y1 - y0));
      const cx0 = Math.floor(Math.max(0, x0 - mx)), cy0 = Math.floor(Math.max(0, y0 - my)), cx1 = Math.ceil(Math.min(img.width, x1 + mx)), cy1 = Math.ceil(Math.min(img.height, y1 + my));
      if (cx1 - cx0 < 24 || cy1 - cy0 < 12) continue;
      const crop = document.createElement("canvas"); crop.width = cx1 - cx0; crop.height = cy1 - cy0; crop.getContext("2d").drawImage(img.canvas, cx0, cy0, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const lm = Math.min(T.config.longMin, 2 * Math.max(crop.width, crop.height));
      for (const l of await T.detectLines(crop, lm, Math.max(lm, T.config.longMax))) {
        const q = l.quad.map(p => [p[0] + cx0, p[1] + cy0]); if (!inside(centre(q), b.box, Math.max(0.02, grow) * Math.max(x1 - x0, y1 - y0))) continue;
        const qb = U.bboxOf(q), qa = Math.max(1e-6, U.bArea(qb)); if (kept.some(k => U.bInter(qb, k) / qa > 0.3)) continue;
        lines.push({quad: q, score: l.score}); kept.push(qb);
      }
    }
    return lines;
  }
  function assign(lines, blocks) {
    const orphans = [];
    for (const l of lines) { const c = centre(l.quad); let best = null, area = Infinity;
      for (const b of blocks) { if (STAMP_CLASSES.has(b.cls)) continue; const a = U.bArea(b.box); if (a < area && inside(c, b.box, LAYOUT_PAD)) { best = b; area = a; } }
      const ln = {quad: l.quad, score: l.score, bbox: U.bboxOf(l.quad)}; if (best) best.lines.push(ln); else orphans.push(ln); }
    return orphans;
  }
  function groupOrphans(orphans) {
    const groups = [];
    for (const ln of orphans.slice().sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0])) { const [x0, y0, x1, y1] = ln.bbox, h = Math.max(1, y1 - y0); let joined = false;
      for (const g of groups) { const [gx0, gy0, gx1, gy1] = g.box;
        if (x0 <= gx1 + 1.5 * h && x1 >= gx0 - 1.5 * h && y0 <= gy1 + 0.8 * h && y1 >= gy0 - 0.8 * h) {
          const last = g.lines.reduce((a, l) => l.bbox[3] > a.bbox[3] ? l : a); if (last.bbox[2] < x1 - 3 * h && y0 >= last.bbox[3] - 0.5 * h) continue;
          g.lines.push(ln); g.box = [Math.min(gx0, x0), Math.min(gy0, y0), Math.max(gx1, x1), Math.max(gy1, y1)]; joined = true; break; } }
      if (!joined) { const g = block("text", ln.bbox, ln.score, "orphan_lines", "orphan"); g.lines.push(ln); groups.push(g); } }
    return groups;
  }
  function dropEmptyContainers(blocks) {
    return blocks.filter(b => { if (!TEXT_CLASSES.has(b.cls) || b.lines.length) return true; return !blocks.some(o => o !== b && o.lines.length && inside([(o.box[0] + o.box[2]) / 2, (o.box[1] + o.box[3]) / 2], b.box)); });
  }
  function fallbackWholeBlock(b, lineH) { const [x0, y0, x1, y1] = b.box, w = x1 - x0, h = y1 - y0; if (!TEXT_CLASSES.has(b.cls) || b.lines.length || w < 4 || h < 4) return; if (w >= 2 * h && (lineH <= 0 || h <= 2 * lineH)) b.lines.push({quad: quadOf(x0, y0, x1, y1), score: 0, bbox: [x0, y0, x1, y1]}); }
  function mergeParagraphs(blocks) {
    const lh = b => b.lines.length ? U.median(b.lines.map(l => l.bbox[3] - l.bbox[1])) : Math.max(1, b.box[3] - b.box[1]);
    const left = b => b.lines.length ? Math.min(...b.lines.map(l => l.bbox[0])) : b.box[0];
    const topLeft = b => b.lines.length ? b.lines.reduce((a, l) => l.bbox[1] < a.bbox[1] ? l : a).bbox[0] : b.box[0];
    const text = blocks.filter(b => b.cls === "text").sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]), other = blocks.filter(b => b.cls !== "text");
    const firstX0 = new Map(text.map(b => [b, topLeft(b)])); let changed = true;
    while (changed && text.length > 1) { changed = false;
      outer: for (let i = 0; i < text.length - 1; i++) { const a = text[i];
        for (let j = i + 1; j < text.length; j++) { const b = text[j]; const [, ay0, ax1, ay1] = a.box, [, by0, bx1, by1] = b.box, ax0 = left(a), bx0 = left(b), h = Math.min(lh(a), lh(b));
          if (by0 - ay1 > 0.7 * h || by0 < ay0) continue; const ov = Math.min(ax1, bx1) - Math.max(ax0, bx0), wa = ax1 - ax0, wb = bx1 - bx0; if (ov < 0.5 * Math.min(wa, wb)) continue;
          if (firstX0.get(b) - ax0 > 0.8 * h) continue;
          const aLast = a.lines.length ? a.lines.reduce((p, l) => l.bbox[3] > p.bbox[3] ? l : p) : null; if (aLast && aLast.bbox[2] < bx1 - 3 * h && b.lines.length >= 2) continue;
          if (Math.abs(bx0 - ax0) > 0.8 * h && Math.min(wa, wb) < 0.6 * Math.max(wa, wb)) continue;
          a.box = [Math.min(ax0, bx0), Math.min(ay0, by0), Math.max(ax1, bx1), Math.max(ay1, by1)]; a.lines = a.lines.concat(b.lines); a.score = Math.max(a.score, b.score); if (a.source === "orphan" && b.source !== "orphan") a.source = b.source;
          text.splice(j, 1); changed = true; break outer; } } }
    return other.concat(text);
  }

  /* ---------------------------------------------------------------- reading order (reading_order.py) */
  function findCut(items, axis, minGap, key) { const iv = items.map(i => [key(i)[axis], key(i)[axis + 2]]).sort((a, b) => a[0] - b[0]); let end = iv[0][1], cut = null;
    for (const [a, b] of iv.slice(1)) { if (a - end >= minGap) { cut = (end + a) / 2; break; } end = Math.max(end, b); } if (cut == null) return null;
    const first = items.filter(i => (key(i)[axis] + key(i)[axis + 2]) / 2 < cut), rest = items.filter(i => (key(i)[axis] + key(i)[axis + 2]) / 2 >= cut); return first.length && rest.length ? [first, rest] : null; }
  const span = (items, axis, key) => Math.max(...items.map(i => key(i)[axis + 2])) - Math.min(...items.map(i => key(i)[axis]));
  function xyCut(items, W, H, key = it => it.box, depth = 0) {
    if (items.length <= 1 || depth > 12) return items.slice().sort((a, b) => key(a)[1] - key(b)[1] || key(a)[0] - key(b)[0]);
    const h = findCut(items, 1, 0.008 * H, key); let v = findCut(items, 0, 0.02 * W, key);
    if (v && h) { const height = Math.max(1e-6, span(items, 1, key)); if (Math.min(span(v[0], 1, key), span(v[1], 1, key)) < 0.6 * height) v = null; }
    const cut = v || h; if (cut) return xyCut(cut[0], W, H, key, depth + 1).concat(xyCut(cut[1], W, H, key, depth + 1));
    return items.slice().sort((a, b) => key(a)[1] - key(b)[1] || key(a)[0] - key(b)[0]);
  }
  /** Lines grouped by baseline (top to bottom), each row left to right. */
  function rowsOf(lines) { if (!lines.length) return []; const items = lines.slice().sort((a, b) => (a.bbox[1] + a.bbox[3]) - (b.bbox[1] + b.bbox[3])); const rows = [[items[0]]];
    for (const ln of items.slice(1)) { const b = ln.bbox, cy = (b[1] + b[3]) / 2, h = b[3] - b[1], row = rows[rows.length - 1]; const rcy = row.reduce((a, r) => a + (r.bbox[1] + r.bbox[3]) / 2, 0) / row.length; const rh = row.map(r => r.bbox[3] - r.bbox[1]).sort((a, b) => a - b)[row.length >> 1];
      if (Math.abs(cy - rcy) < 0.5 * Math.min(rh, h)) row.push(ln); else rows.push([ln]); }
    return rows.map(r => r.sort((a, b) => a.bbox[0] - b.bbox[0])); }
  function sortLines(lines) { return rowsOf(lines).flat(); }

  /* ---------------------------------------------------------------- row segments -> one line */
  /** One line that covers both segments (tight rotated box around both quads, so skewed photos stay rectified). */
  function unionLine(a, b) { const pts = a.quad.concat(b.quad); let quad; try { quad = U.orderPoints(U.boxPoints(U.minAreaRect(U.hull(pts)))); } catch { const bb = U.bboxOf(pts); quad = quadOf(...bb); }
    return {quad, score: Math.max(a.score || 0, b.score || 0), bbox: U.bboxOf(quad), merged: (a.merged || 1) + (b.merged || 1)}; }
  /** The detector splits a line at wide gaps: dot leaders, justified spacing, a page number at the right. Segments on
      one baseline inside a text block are one line - merge them before recognition, so the whole line is read in one
      go and its order is right by construction. Table / form blocks keep their cells apart. */
  function mergeRowSegments(blocks) {
    let rid = 0;
    for (const b of blocks) {
      if (!TEXT_CLASSES.has(b.cls) || ["table", "form_field", "handwriting"].includes(b.cls) || b.lines.length < 2) continue;
      const bw = Math.max(1, b.box[2] - b.box[0]);
      for (const row of rowsOf(b.lines)) { let group = [row[0]];
        const flush = () => { if (group.length >= 2) { rid++; group.forEach((l, k) => { l.row = rid; l.rowPos = k; }); } group = []; };
        for (let i = 1; i < row.length; i++) { const cur = group[group.length - 1], nx = row[i], h = Math.max(cur.bbox[3] - cur.bbox[1], nx.bbox[3] - nx.bbox[1]), gap = nx.bbox[0] - cur.bbox[2];
          const wa = cur.bbox[2] - cur.bbox[0], wb = nx.bbox[2] - nx.bbox[0], twoCols = gap > 0.25 * bw && wa > 6 * h && wb > 6 * h;
          if (gap > 0.3 * bw || twoCols) { flush(); group = [nx]; continue; }
          if (gap < 0) { const x0 = cur.bbox[2] + 1; if (x0 < nx.bbox[2] - 2) { nx.bbox = [x0, nx.bbox[1], nx.bbox[2], nx.bbox[3]]; nx.quad = nx.quad.map((pt, k) => (k === 0 || k === 3) ? [x0, pt[1]] : pt); } }
          group.push(nx); }
        flush(); }
    }
  }
  const DOTS_RE = /[.·•]/g;
  /** "title 1<tab>23": the first leader dots read as a stray 1 / l / I / . at the end of the text part. */
  const cleanLeaderText = t => t.includes("\t") ? t.replace(/[\s.·•]*(?:\s[1lI|!7]{1,2})?[\s.·•]*\t/, "\t") : t;
  /** Dot leaders inside a line crop ({gray, w, h}): a run >= 2.5 h wide whose ink is only short blobs (dots) with no tall
      glyph. Returns the sub-crops to recognise instead (text left / right of the leader) or null. */
  function splitLeader(crop) {
    const {gray, w, h} = crop; if (!gray || w < 4 * h) return null;
    // adaptive ink threshold: midway between the dark and the light tails of the crop
    const hist = new Int32Array(256); for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const pctv = q => { let acc = 0; const want = q * gray.length; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= want) return v; } return 255; };
    const lo = pctv(0.03), hi = pctv(0.9); if (hi - lo < 60) return null; const thr = (lo + hi) / 2;
    const top = new Int16Array(w).fill(-1), bot = new Int16Array(w).fill(-1);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (gray[y * w + x] < thr) { if (top[x] < 0) top[x] = y; bot[x] = y; }
    // 0 empty, 1 dot-like ink (short, sitting in the lower half where leaders are), 2 glyph ink
    const kind = new Int8Array(w);
    for (let x = 0; x < w; x++) if (top[x] >= 0) { const ext = bot[x] - top[x] + 1, cy = (top[x] + bot[x]) / 2; kind[x] = ext <= 0.22 * h && cy > 0.45 * h && cy < 0.92 * h ? 1 : 2; }
    const blobs = []; for (let x = 0, bs = -1; x <= w; x++) { const on = x < w && kind[x] === 1; if (on && bs < 0) bs = x; if (!on && bs >= 0) { blobs.push([bs, x]); bs = -1; } }
    if (blobs.length >= 4) { const ws = blobs.map(([a, b]) => b - a).sort((p, q) => p - q), med = ws[ws.length >> 1]; for (const [a, b] of blobs) if (b - a > Math.max(2.5 * med, 0.15 * h)) for (let x = a; x < b; x++) kind[x] = 2; }
    const runs = []; let st = 0; for (let x = 0; x <= w; x++) { if (x === w || kind[x] === 2) { if (x - st >= 2.5 * h) runs.push([st, x]); st = x + 1; } }
    let best = null;
    for (const [a, b] of runs) { let ink = 0, blobs = 0, inInk = false; for (let x = a; x < b; x++) { const on = kind[x] === 1; if (on) ink++; if (on && !inInk) blobs++; inInk = on; }
      if (ink < 0.3 * (b - a) || (blobs < 4 && ink < 0.6 * (b - a))) continue; if (!best || b - a > best[1] - best[0]) best = [a, b]; }
    if (!best) return null;
    const part = (a, b) => { while (a < b && kind[a] === 0) a++; while (b > a && kind[b - 1] === 0) b--; if (b - a < 2 || ![...kind.slice(a, b)].some(k => k === 2)) return null;
      const pad = Math.round(0.3 * h); a = Math.max(0, a - 4); b = Math.min(w, b + 4); const cw = Math.max(16, b - a + 2 * pad), g = new Uint8ClampedArray(cw * h).fill(255); // white margins like a normal crop
      for (let y = 0; y < h; y++) for (let x = 0; x < b - a; x++) g[y * cw + pad + x] = gray[y * w + a + x]; return {gray: g, w: cw, h}; };
    return {left: part(0, best[0]), right: part(best[1], w)};
  }
  /** After recognition: segments tagged as one row become one line (texts joined left to right, dot-leader segments
      collapsed), so the recogniser only ever saw short crops. Bullet glyph segments stay separate for mergeBulletLines. */
  function joinRowSegments(blocks) {
    for (const b of blocks) { if (!b.lines.some(l => l.row)) continue;
      const groups = new Map(); for (const l of b.lines) if (l.row && !l.isBullet) { if (!groups.has(l.row)) groups.set(l.row, []); groups.get(l.row).push(l); }
      const drop = new Set();
      for (const segs of groups.values()) { if (segs.length < 2) continue; segs.sort((p, q) => p.rowPos - q.rowPos);
        const texts = segs.map(l => { const t = (l.text || "").trim(); if (!t) return ""; const dots = (t.match(DOTS_RE) || []).length; return dots >= 4 && dots >= 0.6 * t.length ? "....." : t; });
        // a page number far to the right of the text (leader dots lost by the detector or the recogniser) -> tab
        const last = segs[segs.length - 1], prevSeg = segs[segs.length - 2], hL = last.bbox[3] - last.bbox[1];
        const tailNum = /^[.·•\s]*([\d០-៩]{1,4})$/.exec(texts[texts.length - 1]);
        if (tailNum && (last.bbox[0] - prevSeg.bbox[2] > 2 * hL || last.bbox[2] - last.bbox[0] > 4 * hL)) texts[texts.length - 1] = "\t" + tailNum[1]; // far right, or a wide box that held leader dots too
        for (let k = 1; k < texts.length - 1; k++) if (texts[k] === "") texts[k] = "\t"; // an unreadable middle segment is a leader
        if (texts.some(t => t.includes("\t"))) for (let k = 1; k < texts.length - 1; k++) { const sg = segs[k], t = texts[k].replace(/\t/g, ""); if (t.length <= 2 && !/[\u1780-\u17FF]/.test(t)) texts[k] = texts[k].includes("\t") ? "\t" : ""; void sg; } // sliver of a glyph read as "1" next to a leader
        const head = segs[0]; let geo = head; for (const l of segs.slice(1)) geo = unionLine(geo, l);
        head.quad = geo.quad; head.bbox = geo.bbox; head.text = texts.filter(Boolean).join(" ").replace(/\s*\t\s*/g, "\t").replace(/\t+/g, "\t").replace(/^\t|\t$/g, m => m); head.text = cleanLeaderText(head.text); head.tab = head.text.includes("\t") || segs.some(l => l.tab); head.confidence = Math.min(...segs.map(l => l.confidence ?? 1)); head.char_pos = null; head.merged = segs.length;
        for (const l of segs.slice(1)) drop.add(l); }
      b.lines = b.lines.filter(l => !drop.has(l)); }
  }
  /** Text blocks side by side whose lines share baselines (a list with counts at the right, a two-column form) become
      one borderless table block, so the cell grid keeps each name with its numbers. Real two-column body text is left
      alone: the right block must be clearly narrower than the left one. */
  function mergeAlignedBlocks(blocks, W) {
    const text = () => blocks.filter(b => b.cls === "text" && b.lines.length >= 2);
    let changed = true;
    while (changed) { changed = false;
      for (const a of text().sort((p, q) => U.bArea(q.box) - U.bArea(p.box))) {
        const [ax0, ay0, ax1, ay1] = a.box, aw = ax1 - ax0, aRows = rowsOf(a.lines).map(r => (r[0].bbox[1] + r[0].bbox[3]) / 2);
        const right = blocks.filter(b => b !== a && TEXT_CLASSES.has(b.cls) && !["table", "form_field"].includes(b.cls) && b.lines.length).filter(b => { const [bx0, by0, bx1, by1] = b.box, bw = bx1 - bx0;
          if (bx0 < ax1 - 0.05 * W || bx0 - ax1 > 0.3 * W || bw > 0.7 * aw) return false;
          const ov = Math.min(ay1, by1) - Math.max(ay0, by0); if (ov < 0.5 * Math.min(ay1 - ay0, by1 - by0)) return false;
          const hit = b.lines.filter(l => { const cy = (l.bbox[1] + l.bbox[3]) / 2, h = l.bbox[3] - l.bbox[1]; return aRows.some(r => Math.abs(r - cy) < 0.6 * h); }).length;
          return hit >= 0.6 * b.lines.length; });
        if (!right.length) continue;
        const all = [a, ...right]; a.box = [Math.min(...all.map(b => b.box[0])), Math.min(...all.map(b => b.box[1])), Math.max(...all.map(b => b.box[2])), Math.max(...all.map(b => b.box[3]))];
        a.lines = all.flatMap(b => b.lines); a.cls = "table"; a.label = "table"; a.source = "aligned"; a.borders = false; a.score = Math.max(...all.map(b => b.score || 0));
        blocks = blocks.filter(b => !right.includes(b)); changed = true; break; }
    }
    return blocks;
  }
  /** After recognition: a narrow column of labels at the left margin ("យោង ៖", "សំណុំលិខិត៖" - bold or ending in a
      colon) whose rows line up with wider value blocks at the right becomes one borderless table, label column first,
      so the document keeps each label beside its value instead of listing all labels and then all values. Labels that
      share one value block (a list beside several labels) join the same table. */
  const LABEL_END = /[៖:]\s*$/;
  function mergeLabelColumns(blocks, W) {
    const txt = b => b.lines.filter(l => l.text);
    const labelish = b => { const ls = txt(b); return b.cls === "text" && ls.length >= 1 && ls.length <= 8 && b.box[2] - b.box[0] < 0.25 * W && b.box[0] < 0.3 * W && ls.every(l => l.bbox[2] - l.bbox[0] < 0.25 * W) && ls.filter(l => LABEL_END.test(l.text) || l.bold).length >= 0.6 * ls.length; };
    const partner = (L, b) => { if (b === L || !TEXT_CLASSES.has(b.cls) || ["form_field", "handwriting", "header", "footer", "page_number"].includes(b.cls) || !txt(b).length) return false; const [lx0, ly0, lx1, ly1] = L.box; void lx0;
      if (b.box[0] < lx1 - 0.02 * W || b.box[0] - lx1 > 0.2 * W || Math.min(ly1, b.box[3]) - Math.max(ly0, b.box[1]) <= 0) return false;
      const cys = txt(L).map(l => (l.bbox[1] + l.bbox[3]) / 2), hit = cys.filter(cy => txt(b).some(l => Math.abs((l.bbox[1] + l.bbox[3]) / 2 - cy) < 0.6 * (l.bbox[3] - l.bbox[1]))).length; return hit >= 0.6 * cys.length; };
    const groups = []; // connected sets {labels, values}
    for (const L of blocks.filter(labelish)) { const vals = blocks.filter(b => partner(L, b)); if (!vals.length) continue;
      const g = groups.find(g => g.values.some(v => vals.includes(v))); if (g) { g.labels.push(L); for (const v of vals) if (!g.values.includes(v)) g.values.push(v); } else groups.push({labels: [L], values: vals}); }
    for (const g of groups) { const all = [...g.labels, ...g.values], head = g.labels[0]; if (all.some(b => !blocks.includes(b))) continue;
      head.box = all.reduce((a, b) => unionBox(a, b.box), head.box); head.lines = all.flatMap(b => b.lines); head.cls = "table"; head.label = "table"; head.source = "labels"; head.borders = false; head.score = Math.max(...all.map(b => b.score || 0));
      blocks = blocks.filter(b => b === head || !all.includes(b)); }
    return blocks;
  }
  /** Dot leaders ("title ........ 23") -> title \t 23. */
  const LEADER_RE = /(?:[.·•]\s?){4,}/;
  function leaderTab(ln) { const m = LEADER_RE.exec(ln.text || ""); if (!m) return; const before = ln.text.slice(0, m.index).replace(/[\s.·•]+$/, "").trim(), after = ln.text.slice(m.index + m[0].length).replace(/^[\s.·•]+/, "").trim();
    if (!before && !after) { ln.text = ""; return; } ln.text = before + "\t" + after; ln.tab = true; }

  /* ---------------------------------------------------------------- bullets, paragraphs, roles */
  function isBulletGlyph(text, ln) { const w = ln.bbox[2] - ln.bbox[0], h = ln.bbox[3] - ln.bbox[1]; if (!(w <= 1.6 * h && h <= 1.6 * w)) return false;
    if (BULLET_READINGS.has(text)) return true; const t = text.replace(/\s/g, ""); return t.length > 0 && t.length <= 2 && (ln.confidence || 0) < 0.75; } // a small badly-read blob left of a line is a bullet glyph
  const bulletGlyph = g => /^[-–—]$/.test(g) ? "-" : /^[>»›➤➢►]$/.test(g) ? "➢" : /^[❖✧√✔✓]$/.test(g) ? "❖" : "•";
  const isKhmer = ch => ch >= "ក" && ch <= "៿";
  const isKhDigit = ch => ch >= "០" && ch <= "៩";
  function joinWrapped(a, b) { if (!a) return b; if (!b) return a; const x = a[a.length - 1], y = b[0]; return isKhmer(x) && isKhmer(y) && !isKhDigit(x) && !isKhDigit(y) ? a + b : a + " " + b; }
  const paragraphText = lines => lines.reduce((a, l) => joinWrapped(a, l.text), "");
  function paragraphRuns(lines) { const runs = []; const push = (t, bold) => { if (!t) return; if (runs.length) { const last = runs[runs.length - 1]; const glue = isKhmer(last.text[last.text.length - 1] || "") && isKhmer(t[0]) ? "" : " "; if (last.bold === bold) { last.text += glue + t; return; } last.text += glue; } runs.push({text: t, bold}); };
    for (const ln of lines) { if (ln.spans && ln.spans.length) { ln.spans.forEach(sp => push(sp.text, !!sp.bold)); } else push(ln.text, !!ln.bold); } return runs; }
  function mergeBulletLines(lines) { // a line read as a bullet glyph joins the text line of its row
    const bullets = lines.filter(l => l.isBullet), rest = lines.filter(l => !l.isBullet);
    for (const bl of bullets) { const cy = (bl.bbox[1] + bl.bbox[3]) / 2; let best = null, bd = Infinity;
      for (const l of rest) { if (l.bbox[0] < bl.bbox[2] - 2) continue; const h = l.bbox[3] - l.bbox[1]; if (Math.abs((l.bbox[1] + l.bbox[3]) / 2 - cy) > 0.6 * h) continue; const d = l.bbox[0] - bl.bbox[2]; if (d < bd && d < 4 * h) { bd = d; best = l; } }
      if (best && !best.bullet) { best.bullet = bl.text; best.bullet_box = bl.bbox.slice(); } else rest.push(bl); }
    return rest;
  }
  function textBullet(ln) { // a recognised marker at the start of the text ("- ", "1. ", "ក) ")
    if (ln.bullet) return; const m = ln.text.match(U.BULLET_RE); if (!m) return; const glyph = m[1]; ln.bullet = /^[•\-–—○o◦▪■➢►✓*·>»›➤❖✧√✔+□❑☐]$/.test(glyph) ? bulletGlyph(glyph) : glyph; ln.text = ln.text.slice(m[0].length).trimStart();
    const w = ln.bbox[2] - ln.bbox[0], h = ln.bbox[3] - ln.bbox[1], frac = Math.min(0.5, m[0].length / Math.max(1, m[0].length + ln.text.length)); ln.bullet_box = [ln.bbox[0], ln.bbox[1], ln.bbox[0] + w * frac, ln.bbox[3]]; ln.bbox = [ln.bbox[0] + w * frac, ln.bbox[1], ln.bbox[2], ln.bbox[3]]; ln.quad = quadOf(...ln.bbox); void h;
  }
  const ROLE_TO_CLS = {title: "title", section_header: "section_header", list_item: "list", header: "header", footer: "footer", page_number: "page_number", caption: "caption", footnote: "footnote", text: "text"};
  /** Lines in reading order, paragraphs, indent levels and (model) roles for every text block. */
  async function structure(blocks, W, H) {
    let textBlocks = blocks.filter(b => TEXT_CLASSES.has(b.cls)); const all = [];
    for (const b of textBlocks) { b.lines = sortLines(b.lines); if (!["table", "form_field", "handwriting"].includes(b.cls)) all.push(...b.lines.filter(l => l.text)); }
    let preds = null;
    if (all.length >= 2 && T.sessions.structure) { try { const p = await T.predictStructure(all, W, H); preds = new Map(all.map((l, i) => [l, p[i]])); } catch (e) { console.warn("structure model failed", e); } }
    if (preds && modelOnly()) {
      // the model's successor pointers give the order of the lines inside every block (and of the blocks, see render)
      for (const l of all) l.rank = preds.get(l).order;
      for (const b of textBlocks) if (b.lines.some(l => l.rank != null)) b.lines.sort((p, q) => (p.rank ?? Infinity) - (q.rank ?? Infinity));
      // lines the layout model left outside every region are one block each; consecutive ones (in the model's order)
      // that the model does not mark as a paragraph start join the block before them
      const owner = new Map(); for (const b of textBlocks) if (b.source === "orphan") for (const l of b.lines) owner.set(l, b);
      const seq = all.filter(l => owner.has(l)).sort((p, q) => p.rank - q.rank); let prev = null;
      for (const l of seq) { const b = owner.get(l), pb = prev ? owner.get(prev) : null;
        if (pb && pb !== b && preds.get(l).first_p < 0.5 && !l.bullet && !l.tab && !prev.tab) { pb.lines.push(...b.lines); for (const x of b.lines) owner.set(x, pb); pb.box = unionBox(pb.box, b.box); pb.score = Math.max(pb.score, b.score); b.drop = true; }
        prev = l; }
      for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].drop) blocks.splice(i, 1);
      textBlocks = blocks.filter(b => TEXT_CLASSES.has(b.cls));
    }
    for (const b of textBlocks) {
      const lines = b.lines.filter(l => l.text), withP = preds && lines.length >= 2 && lines.every(l => preds.has(l));
      // order inside a block is geometric (rows top-down, left-right); the model's pointer order was unreliable
      const medH = U.median(lines.map(l => l.bbox[3] - l.bbox[1])) || 1;
      // paragraphs
      const paras = []; let cur = null;
      lines.forEach((l, i) => { const p = withP ? preds.get(l) : null; const prev = i ? lines[i - 1] : null;
        let starts = i === 0 || !!l.bullet || !!l.tab || !!(prev && prev.tab) || (p ? p.first_p >= 0.5 : false);
        if (!p && prev) { const gap = l.bbox[1] - prev.bbox[3], indent = l.bbox[0] - Math.min(...lines.map(x => x.bbox[0])); if (gap > 0.7 * medH || indent > 0.8 * medH && prev.bbox[0] < l.bbox[0] - 0.8 * medH || prev.bbox[2] < l.bbox[2] - 3 * medH) starts = true; }
        if (starts || !cur) { cur = {lines: [l], bullet: l.bullet || null, indent_level: p ? p.level : (l.bullet ? 1 : 0)}; paras.push(cur); } else cur.lines.push(l);
        l.indent_level = p ? p.level : (l.bullet ? 1 : 0); });
      b.paras = paras;
      // role: width-weighted vote of confident lines
      if (withP && !["table", "form_field", "handwriting"].includes(b.cls)) { const votes = {}; let tot = 0; for (const l of lines) { const p = preds.get(l), w = Math.max(1, l.bbox[2] - l.bbox[0]); tot += w; if (p.role_p >= 0.85 && ROLE_TO_CLS[p.role]) votes[ROLE_TO_CLS[p.role]] = (votes[ROLE_TO_CLS[p.role]] || 0) + w; }
        const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]; if (best && best[1] > 0.5 * tot && best[0] !== b.cls) { b.relabel = b.cls + "->" + best[0]; b.cls = best[0]; } }
      b.lines = lines.concat(b.lines.filter(l => !l.text));
    }
    return !!preds;
  }
  function blockFont(b) { const fl = b.lines.filter(l => l.font); if (!fl.length) return; const ws = fl.map(l => Math.max(1, l.bbox[2] - l.bbox[0])), tot = ws.reduce((a, w) => a + w, 0);
    const probs = fl[0].font.probs.map((_, j) => fl.reduce((a, l, i) => a + l.font.probs[j] * ws[i], 0) / tot); const fi = probs.indexOf(Math.max(...probs)); const fam = (fl.find(l => l.font.probs.indexOf(Math.max(...l.font.probs)) === fi) || fl[0]).font.family;
    const bold = fl.reduce((a, l, i) => a + (l.font.weight === "bold" ? ws[i] : 0), 0) > 0.5 * tot, italic = fl.reduce((a, l, i) => a + (l.font.slant === "italic" ? ws[i] : 0), 0) > 0.5 * tot;
    b.font = {family: fam, confidence: +probs[fi].toFixed(4), weight: bold ? "bold" : "regular", slant: italic ? "italic" : "upright"};
    const ems = fl.map(l => l.font.em_px).filter(Boolean); if (ems.length) { b.font_px = +U.median(ems).toFixed(1); b.font_src = "model"; } }
  function pageLayout(blocks, W, H) {
    const body = blocks.filter(b => TEXT_CLASSES.has(b.cls) && !["header", "footer", "page_number"].includes(b.cls) && b.lines.length);
    const xs0 = body.flatMap(b => b.lines.map(l => l.bbox[0])), xs1 = body.flatMap(b => b.lines.map(l => l.bbox[2])), content = blocks.filter(b => b.lines.length || !TEXT_CLASSES.has(b.cls));
    const left = xs0.length ? U.pct(xs0, 5) : 0, right = xs1.length ? W - U.pct(xs1, 95) : 0, top = content.length ? Math.min(...content.map(b => b.box[1])) : 0, bottom = content.length ? H - Math.max(...content.map(b => b.box[3])) : 0;
    for (const b of blocks) { const [x0, , x1] = b.box; if (b.lines.length >= 3 && (x1 - x0) >= 0.6 * (W - left - right)) b.align = "left"; else if (Math.abs((x0 + x1) / 2 - W / 2) < 0.03 * W && x0 - left > 0.05 * W) b.align = "center"; else if ((W - right) - x1 < 0.03 * W && x0 - left > 0.1 * W) b.align = "right"; else b.align = "left"; }
    return {width: W, height: H, margins: {left: +left.toFixed(1), right: +right.toFixed(1), top: +top.toFixed(1), bottom: +bottom.toFixed(1)}};
  }

  /* ---------------------------------------------------------------- output */
  function cropDataUrl(canvas, box, maxW = 900) { const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1])), x1 = Math.min(canvas.width, Math.ceil(box[2])), y1 = Math.min(canvas.height, Math.ceil(box[3])); if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    const s = Math.min(1, maxW / (x1 - x0)), c = document.createElement("canvas"); c.width = Math.round((x1 - x0) * s); c.height = Math.round((y1 - y0) * s); c.getContext("2d").drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height); return {url: c.toDataURL("image/png")}; }
  const blockText = lines => lines.filter(l => l.text).map(l => "\t".repeat(l.indent_level || 0) + (l.bullet ? l.bullet + " " : "") + l.text).join("\n");
  /* ---------------------------------------------------------------- tables: cells from ruling lines / alignment */
  /** Skew of a set of lines (radians, positive = clockwise on screen) from the top edges of their quads. */
  function skewOf(lines) { const a = lines.filter(l => l.bbox[2] - l.bbox[0] > 3 * (l.bbox[3] - l.bbox[1])).map(l => Math.atan2(l.quad[1][1] - l.quad[0][1], l.quad[1][0] - l.quad[0][0])); return a.length ? U.median(a) : 0; }
  /** Ruling lines inside a box from ink projections on a de-skewed copy of the region. -> {vx: [x...], hy: [y...]} in the de-skewed frame */
  function findRules(canvas, box, medH, ang) {
    const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1])), x1 = Math.min(canvas.width, Math.ceil(box[2])), y1 = Math.min(canvas.height, Math.ceil(box[3])), w = x1 - x0, h = y1 - y0;
    if (w < 8 || h < 8) return {vx: [], hy: []};
    const off = document.createElement("canvas"); off.width = w; off.height = h; const g = off.getContext("2d", {willReadFrequently: true}); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    if (Math.abs(ang) > 0.002) { g.translate(w / 2, h / 2); g.rotate(-ang); g.translate(-w / 2, -h / 2); } g.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, colC = new Int32Array(w), rowC = new Int32Array(h);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { if ((d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10 < 140) { colC[x]++; rowC[y]++; } }
    const runs = (cnt, n, need, maxW) => { const out = []; let st = -1; for (let i = 0; i <= n; i++) { const on = i < n && cnt[i] >= need; if (on && st < 0) st = i; if (!on && st >= 0) { if (i - st <= maxW) out.push((st + i - 1) / 2); st = -1; } } return out; };
    const thick = Math.max(2, 0.35 * medH);
    return {vx: runs(colC, w, 0.5 * h, thick).map(x => x + x0), hy: runs(rowC, h, 0.4 * w, thick).map(y => y + y0)};
  }
  const NUMERIC_RE = /^[\d០-៩.,:%\s\-–/នាក់៛]+$/;
  /** Cell grid of a table block. Lines are first de-skewed (photos are rarely straight; a 1° tilt chains the cells of
      neighbouring rows). Columns come from vertical rules, else from the left edges of the lines; rows from horizontal
      rules, else from baselines (a baseline row that has nothing in the first column continues the row above it). A row
      whose only text runs across several columns is a group header and spans the table. -> {borders, cols, rows} or null */
  function tableGrid(b, img) {
    const lines = b.lines.filter(l => l.text); if (lines.length < 2) return null;
    const medH = U.median(lines.map(l => l.bbox[3] - l.bbox[1])) || 10, ang = skewOf(lines), cx = (b.box[0] + b.box[2]) / 2, cy = (b.box[1] + b.box[3]) / 2, cs = Math.cos(ang), sn = Math.sin(ang);
    const rot = ([x, y]) => [cx + (x - cx) * cs + (y - cy) * sn, cy - (x - cx) * sn + (y - cy) * cs]; // de-skew about the box centre
    const geo = new Map(lines.map(l => [l, U.bboxOf(l.quad.map(rot))])), bb = l => geo.get(l);
    const bx0 = Math.min(...lines.map(l => bb(l)[0])) - 0.3 * medH, bx1 = Math.max(...lines.map(l => bb(l)[2])) + 0.3 * medH;
    const rules = b.borders === false ? {vx: [], hy: []} : findRules(img.canvas, b.box, medH, ang);
    let edges;
    if (rules.vx.length >= 2) { edges = rules.vx.slice(); if (edges[0] - bx0 > medH) edges.unshift(bx0); if (bx1 - edges[edges.length - 1] > medH) edges.push(bx1); }
    else { const xs = lines.map(l => bb(l)[0]).sort((p, q) => p - q), cl = []; for (const x of xs) { const c = cl[cl.length - 1]; if (c && x - c.max < 1.5 * medH) { c.max = x; c.n++; } else cl.push({min: x, max: x, n: 1}); }
      const keep = cl.filter(c => c.n >= 2 || cl.length <= 3); edges = [bx0, ...keep.slice(1).map(c => c.min - 0.4 * medH), bx1]; }
    const nCols = edges.length - 1; if (nCols < 2) return null;
    const colOf = l => { const g = bb(l), x = g[0] + Math.min(0.5 * medH, (g[2] - g[0]) / 2); for (let i = 0; i < nCols; i++) if (x < edges[i + 1]) return i; return nCols - 1; };
    const lastColOf = l => { const g = bb(l), x = g[2] - Math.min(0.5 * medH, (g[2] - g[0]) / 2); for (let i = 0; i < nCols; i++) if (x < edges[i + 1]) return i; return nCols - 1; };
    const rowsDeskewed = ls => { const items = ls.slice().sort((p, q) => (bb(p)[1] + bb(p)[3]) - (bb(q)[1] + bb(q)[3])), rows = [[items[0]]];
      for (const ln of items.slice(1)) { const g = bb(ln), c = (g[1] + g[3]) / 2, h = g[3] - g[1], row = rows[rows.length - 1]; const rc = row.reduce((a, r) => a + (bb(r)[1] + bb(r)[3]) / 2, 0) / row.length, rh = U.median(row.map(r => bb(r)[3] - bb(r)[1]));
        if (Math.abs(c - rc) < 0.5 * Math.min(rh, h)) row.push(ln); else rows.push([ln]); } return rows; };
    let bands = rules.hy.length >= 2 ? rules.hy.slice(0, -1).map((y, i) => [y, rules.hy[i + 1]]) : rowsDeskewed(lines).map(r => [Math.min(...r.map(l => bb(l)[1])), Math.max(...r.map(l => bb(l)[3]))]);
    if (rules.hy.length >= 2) { const top = Math.min(...lines.map(l => bb(l)[1])), bot = Math.max(...lines.map(l => bb(l)[3])); if (top < bands[0][0] - 2) bands.unshift([top, bands[0][0]]); if (bot > bands[bands.length - 1][1] + 2) bands.push([bands[bands.length - 1][1], bot]);
      // a faint rule the scan lost: a tall band holding several baseline rows that each start a record (text in the
      // first column) is split at those rows; wrapped lines without a first-column entry stay with the row above
      const split = []; for (const [y0, y1] of bands) { const ins = lines.filter(l => { const c = (bb(l)[1] + bb(l)[3]) / 2; return c >= y0 && c < y1; }); const rs = ins.length >= 2 && y1 - y0 > 2.2 * medH ? rowsDeskewed(ins) : null;
        const starts = rs ? rs.map(r => r.some(l => colOf(l) === 0)) : []; if (!rs || starts.filter(Boolean).length < 2) { split.push([y0, y1]); continue; }
        const ys = rs.map(r => [Math.min(...r.map(l => bb(l)[1])), Math.max(...r.map(l => bb(l)[3]))]); let top = y0; for (let i = 1; i < rs.length; i++) if (starts[i]) { const cut = (ys[i - 1][1] + ys[i][0]) / 2; split.push([top, cut]); top = cut; } split.push([top, y1]); }
      bands = split; }
    const rowOf = l => { const g = bb(l), c = (g[1] + g[3]) / 2; let best = 0, bd = Infinity; bands.forEach(([y0, y1], i) => { const d = c < y0 ? y0 - c : c > y1 ? c - y1 : 0; if (d < bd) { bd = d; best = i; } }); return best; };
    let grid = bands.map(() => Array.from({length: nCols}, () => []));
    for (const l of lines) grid[rowOf(l)][colOf(l)].push(l);
    // group header: the only text in the row runs across 2+ columns -> one spanning cell
    const span = grid.map(cells => { const filled = cells.map((c, i) => c.length ? i : -1).filter(i => i >= 0); if (filled.length !== 1) return false; if (rules.vx.length < 2 && filled[0] !== 0) return false; // borderless: a group header starts at the left edge (a long value line crossing into the next column is not one)
      const ls = cells[filled[0]]; return ls.some(l => lastColOf(l) > filled[0]); });
    if (rules.hy.length < 2) for (let r = 1; r < grid.length;) { // top-down, so a run of continuation rows chains onto the same record
      const near = bands[r][0] - bands[r - 1][1] < 0.35 * medH; // fragments of one printed line that landed on slightly different baselines
      if (!span[r] && !span[r - 1] && !grid[r][0].length && grid[r - 1][0].length && (near || grid[r].filter(c => c.length).length === 1)) { /* one wrapped cell; a full row of cells further down is its own record */ grid[r].forEach((c, ci) => grid[r - 1][ci].push(...c)); bands[r - 1] = [bands[r - 1][0], bands[r][1]]; grid.splice(r, 1); bands.splice(r, 1); span.splice(r, 1); } else r++; }
    const cellOf = c => { c.sort((p, q) => (bb(p)[1] + bb(p)[3]) - (bb(q)[1] + bb(q)[3]) || bb(p)[0] - bb(q)[0]); const multi = c.length >= 2 && c.some(l => l.bullet); // list items inside a cell keep their lines
      return {lines: c, text: multi ? c.map(l => (l.bullet ? l.bullet + " " : "") + l.text).join("\n") : paragraphText(c)}; };
    const rows = []; grid.forEach((cells, i) => { if (!cells.some(c => c.length)) return; const row = {y0: +bands[i][0].toFixed(1), y1: +bands[i][1].toFixed(1)};
      if (span[i]) { const all = cells.flat(); row.cells = [Object.assign(cellOf(all), {colspan: nCols})]; row.span = true; } else row.cells = cells.map(cellOf); rows.push(row); });
    if (rows.length < (b.source === "labels" ? 1 : 2)) return null; // a single label beside its value is still a row
    const cols = []; for (let i = 0; i < nCols; i++) { const cl = rows.filter(r => !r.span).flatMap(r => r.cells[i].lines); cols.push({x0: +edges[i].toFixed(1), x1: +edges[i + 1].toFixed(1), align: cl.length && cl.every(l => NUMERIC_RE.test(l.text)) ? "right" : "left"}); }
    return {borders: rules.vx.length >= 2 || rules.hy.length >= 2, cols, rows, skew: +(ang * 180 / Math.PI).toFixed(2)};
  }

  /** Blocks in the structure model's order: a text block sits where its first line is ranked; a figure / stamp / logo
      sits just before the nearest ranked line below its top edge (or last, when nothing follows). */
  function modelOrder(blocks) {
    const ranked = blocks.flatMap(b => b.lines.filter(l => l.rank != null)).sort((p, q) => p.rank - q.rank);
    if (!ranked.length) return null;
    const key = b => { const own = b.lines.filter(l => l.rank != null); if (own.length) return Math.min(...own.map(l => l.rank));
      const cy = (b.box[1] + b.box[3]) / 2, below = ranked.filter(l => (l.bbox[1] + l.bbox[3]) / 2 >= b.box[1]).sort((p, q) => p.bbox[1] - q.bbox[1])[0]; return below ? below.rank - 0.5 : ranked[ranked.length - 1].rank + 0.5 + cy / 1e6; };
    return blocks.slice().sort((a, b) => key(a) - key(b) || a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  }
  function render(img, blocks) {
    const W = img.width, H = img.height, out = [];
    const ordered = (modelOnly() && modelOrder(blocks)) || xyCut(blocks, W, H, b => b.box);
    ordered.forEach((b, k) => { const order = k + 1, cls = b.cls, x0 = Math.max(0, b.box[0]), y0 = Math.max(0, b.box[1]), x1 = Math.min(W, b.box[2]), y1 = Math.min(H, b.box[3]), textCls = TEXT_CLASSES.has(cls);
      const blk = {id: "b" + order, type: legacyType(cls), label: cls, cls, cls_id: T.CLASSES.indexOf(cls), display: LABELS[cls] || cls, color: hex(COLORS[cls] || [120, 120, 120]), model_label: b.label, score: +b.score.toFixed(4), source: b.source, reading_order: order,
        box: {x: x0, y: y0, width: x1 - x0, height: y1 - y0}, lines: [], crop: null, text: "", recognized: textCls, font_px: b.font_px || null, font_src: b.font_src || null, align: b.align || "left", relabel: b.relabel || null, font: b.font || null, text_color: null};
      if (!textCls) { blk.crop = cropDataUrl(img.canvas, [x0, y0, x1, y1]); out.push(blk); return; }
      const rendered = new Map();
      b.lines.forEach((ln, i) => { const lx0 = Math.max(0, ln.bbox[0]), ly0 = Math.max(0, ln.bbox[1]), lx1 = Math.min(W, ln.bbox[2]), ly1 = Math.min(H, ln.bbox[3]); if (lx1 - lx0 < 2 || ly1 - ly0 < 2) return;
        const line = {box: {x: lx0, y: ly0, width: lx1 - lx0, height: ly1 - ly0}, quad: ln.quad.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), text: ln.text || "", confidence: +(ln.confidence || 0).toFixed(4), score: +(ln.score || 0).toFixed(4), reading_order: i + 1,
          indent_level: ln.indent_level || 0, indent: 0, tab: false, bullet: ln.bullet || null, bullet_box: ln.bullet_box ? ln.bullet_box.map(v => +v.toFixed(1)) : null, baseline: null, core_h: null, font: ln.font ? Object.fromEntries(Object.entries(ln.font).filter(([k]) => k !== "probs")) : null, bold: !!ln.bold, spans: ln.spans || [], text_color: null};
        blk.lines.push(line); rendered.set(ln, line); });
      blk.text = blockText(blk.lines); blk.bold = blk.lines.length > 0 && blk.lines.filter(l => l.text).every(l => l.bold);
      if (cls === "table") { const tg = tableGrid(b, img); if (tg) { blk.table = {borders: tg.borders, skew: tg.skew, cols: tg.cols, rows: tg.rows.map(r => ({y0: r.y0, y1: r.y1, span: !!r.span, cells: r.cells.map(c => ({text: c.text, colspan: c.colspan || 1, lines: c.lines.map(l => rendered.get(l)).filter(Boolean).map(l => l.reading_order)}))}))}; blk.text = tg.rows.map(r => r.cells.map(c => c.text.replace(/\n/g, " ")).join("\t")).join("\n"); } }
      blk.paragraphs = (b.paras || []).map(p => { const pl = p.lines.map(l => rendered.get(l)).filter(l => l && l.text); if (!pl.length) return null; const levels = pl.map(l => l.indent_level);
        return {indent_level: p.indent_level || 0, bullet: p.bullet || null, text: paragraphText(pl), lines: pl.map(l => l.reading_order), runs: paragraphRuns(pl), first_line_indent: pl.length > 1 && levels[0] > Math.min(...levels.slice(1))}; }).filter(Boolean);
      out.push(blk); });
    return out;
  }
  /* ---------------------------------------------------------------- structured document (document.py) */
  const BODY = new Set(["text", "title", "section_header", "list", "table", "caption", "footnote", "form_field", "handwriting"]);
  function xClusters(blocks) { // blocks chained by horizontal overlap -> columns, left to right
    const cols = []; for (const b of blocks.slice().sort((a, c) => a.box.x - c.box.x)) { const bx0 = b.box.x, bx1 = b.box.x + b.box.width; const col = cols.find(c => Math.min(c.x1, bx1) - Math.max(c.x0, bx0) > 0.3 * Math.min(c.x1 - c.x0, bx1 - bx0)); if (col) { col.items.push(b); col.x0 = Math.min(col.x0, bx0); col.x1 = Math.max(col.x1, bx1); } else cols.push({x0: bx0, x1: bx1, items: [b]}); } return cols.map(c => c.items); }
  const styleOf = b => { const f = b.font || {}; return {family: f.family || null, weight: f.weight || "regular", slant: f.slant || "upright", color: b.text_color || null, font_px: b.font_px || null, heavy: HEAVY.has(f.family), size_model: b.font_src === "pdf" || b.font_src === "model"}; };
  function elements(blocks, contentW) {
    const els = [];
    for (const b of blocks) { const cls = b.cls || "text", box = b.box, base = {block: b.id, role: cls, align: b.align || "left", style: styleOf(b), box: [+box.x.toFixed(1), +box.y.toFixed(1), +box.width.toFixed(1), +box.height.toFixed(1)]};
      if (CROP_CLASSES.has(cls) || !(b.lines || []).length) { if (cls === "decoration") els.push({...base, type: "decoration", crop: b.crop && b.crop.url}); else if (b.crop) els.push({...base, type: "figure", crop: b.crop.url, width_frac: +Math.min(1, box.width / contentW).toFixed(3), aspect: +(box.height / Math.max(1, box.width)).toFixed(4)}); continue; }
      if (cls === "table" && b.table) { els.push({...base, type: "table", table: b.table, text: b.text, lines: b.lines.filter(l => l.text).map(l => l.reading_order)}); continue; }
      const lines = b.lines.filter(l => l.text), byOrder = new Map(lines.map(l => [l.reading_order, l])); const paras = (b.paragraphs && b.paragraphs.length) ? b.paragraphs : [{lines: lines.map(l => l.reading_order), indent_level: lines[0].indent_level || 0, bullet: lines[0].bullet}];
      const shortBold = paras.length === 1 && lines.length === 1 && (b.bold || base.style.heavy) && box.width < 0.6 * contentW && lines[0].text.length <= 60;
      for (const p of paras) { const pl = (p.lines || []).map(i => byOrder.get(i)).filter(Boolean); if (!pl.length) continue; const runs = p.runs || paragraphRuns(pl), levels = pl.map(l => l.indent_level || 0), firstIndent = pl.length > 1 && levels[0] > Math.min(...levels.slice(1)), level = firstIndent ? Math.min(...levels) : (p.indent_level != null ? p.indent_level : levels[0]);
        const item = {...base, runs, text: runs.map(r => r.text).join(""), level, lines: pl.map(l => l.reading_order), low: pl.some(l => (l.confidence ?? 1) < LOW)};
        if (p.bullet) { Object.assign(item, {type: "list_item", bullet: p.bullet, bullet_box: pl[0].bullet_box ? {x: pl[0].bullet_box[0], y: pl[0].bullet_box[1]} : null}); if (els.length && els[els.length - 1].type === "list") els[els.length - 1].items.push(item); else els.push({...base, type: "list", items: [item]}); continue; }
        if (cls === "title") Object.assign(item, {type: "heading", heading: 1}); else if (cls === "section_header" || ((cls === "text" || cls === "list") && shortBold)) Object.assign(item, {type: "heading", heading: cls === "section_header" ? 2 : 3});
        else if (["header", "footer", "page_number", "caption", "footnote"].includes(cls)) item.type = cls; else if (cls === "table") item.type = "table_row"; else Object.assign(item, {type: "paragraph", first_line_indent: firstIndent});
        els.push(item); } }
    return els;
  }
  function buildDocument(blocks, layout, W, H) {
    const margins = (layout && layout.margins) || {left: 0.08 * W, right: 0.08 * W, top: 0.06 * H, bottom: 0.06 * H}, contentW = Math.max(1, W - margins.left - margins.right), ordered = blocks.slice().sort((a, b) => a.reading_order - b.reading_order);
    const firstBody = ordered.findIndex(b => BODY.has(b.cls || "text")), pre = ordered.slice(0, firstBody < 0 ? ordered.length : firstBody);
    const head = pre.filter(b => b.box.y + b.box.height < 0.3 * H), rest = ordered.filter(b => !head.includes(b));
    let cols = head.length >= 2 ? xClusters(head) : [];
    if (cols.length >= 2) { const spans = cols.map(c => [Math.min(...c.map(b => b.box.x)), Math.max(...c.map(b => b.box.x + b.box.width))]).sort((p, q) => p[0] - q[0]); for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1] - 0.2 * Math.min(spans[i][1] - spans[i][0], spans[i - 1][1] - spans[i - 1][0])) { cols = []; break; } }
    let els; if (cols.length >= 2) els = [{type: "row", block: head[0].id, box: [Math.min(...head.map(b => b.box.x)), Math.min(...head.map(b => b.box.y)), 0, 0], columns: cols.map(c => ({x0: Math.min(...c.map(b => b.box.x)), x1: Math.max(...c.map(b => b.box.x + b.box.width)), elements: elements(c, contentW)}))}].concat(elements(rest, contentW)); else els = elements(ordered, contentW);
    const out = []; let i = 0; // footer blocks on one row -> columns
    while (i < els.length) { if (els[i].type !== "footer") { out.push(els[i]); i++; continue; } let j = i; while (j < els.length && els[j].type === "footer") j++; const group = els.slice(i, j); const fake = group.map((e, k) => ({id: k, box: {x: e.box[0], y: e.box[1], width: e.box[2], height: e.box[3]}})); const fc = xClusters(fake);
      if (fc.length >= 2) out.push({type: "footer_row", block: group[0].block, box: group[0].box, columns: fc.map(c => ({block: group[c[0].id].block, align: group[c[0].id].align, elements: c.map(fb => group[fb.id])}))}); else out.push(...group); i = j; }
    return {width: W, height: H, margins: Object.fromEntries(Object.entries(margins).map(([k, v]) => [k, +(+v).toFixed(1)])), elements: out};
  }

  /* ---------------------------------------------------------------- the whole page */
  const ms = t0 => +(performance.now() - t0).toFixed(1);
  /** file|Blob|url -> page result. onStep({stage, msg, done?, total?}) */
  T.process = async function (src, onStep) {
    if (!T.loaded()) throw new Error("models not loaded");
    const step = (stage, msg, extra) => onStep && onStep(Object.assign({stage, msg}, extra || {}));
    const tStart = performance.now(), timings = {};
    step("decode", "reading the file"); const img = await T.loadImage(src); const W = img.width, H = img.height;
    step("layout", "finding regions"); let t = performance.now(); const regions = await T.detectLayout(img); let {blocks, ignored} = cleanRegions(regions, W, H); timings.layout_ms = ms(t);
    step("textdet", "finding text lines"); t = performance.now(); let lines = await T.detectLines(img.canvas); if (T.config.cascade) lines = await cascade(img, blocks, lines);
    const orphans = assign(lines, blocks);
    // a "decoration" that swallowed text lines (a whole letterhead band) is a misdetection: give the lines back as
    // orphans and drop the region when it is large or contains a logo / stamp / QR
    for (const b of blocks) if (!TEXT_CLASSES.has(b.cls)) { if (b.cls === "decoration" && b.lines.length >= 2) { orphans.push(...b.lines); const area = U.bArea(b.box); if (area > 0.02 * W * H || blocks.some(o => o !== b && CROP_CLASSES.has(o.cls) && inter(o.box, b.box) > 0.8 * U.bArea(o.box))) b.drop = true; } b.lines = []; }
    blocks = blocks.filter(b => !b.drop);
    // stamps: the stamp's own (curved) text is not document text; lines running under a stamp are read from a de-stamped copy
    const stampBoxes = blocks.filter(b => b.cls === "stamp").map(b => b.box);
    if (stampBoxes.length) { for (let i = orphans.length - 1; i >= 0; i--) { const ln = orphans[i], a = U.bArea(ln.bbox); const sb = stampBoxes.find(b => inter(ln.bbox, b) > 0.7 * a); if (sb && (ln.bbox[2] - ln.bbox[0]) < 0.85 * (sb[2] - sb[0])) orphans.splice(i, 1); }
      for (const ln of orphans) if (stampBoxes.some(b => inter(ln.bbox, b) > 0.05 * U.bArea(ln.bbox))) ln.stamped = true;
      for (const b of blocks) for (const ln of b.lines) if (stampBoxes.some(sb => inter(ln.bbox, sb) > 0.05 * U.bArea(ln.bbox))) ln.stamped = true; }
    const cleanCanvas = stampBoxes.length && T.config.destamp === true ? destamp(img.canvas, stampBoxes) : img.canvas; img.clean = cleanCanvas; // opt-in: whitening the ink also carves the glyphs
    blocks = dropEmptyContainers(blocks); const lineH = lines.length ? U.median(lines.map(l => { const q = U.bboxOf(l.quad); return q[3] - q[1]; })) : 0; for (const b of blocks) fallbackWholeBlock(b, lineH);
    if (modelOnly()) blocks.push(...orphans.map(ln => { const g = block("text", ln.bbox, ln.score, "orphan_lines", "orphan"); g.lines.push(ln); return g; })); // grouped later by the structure model
    else { blocks.push(...groupOrphans(orphans)); blocks = mergeParagraphs(blocks); blocks = mergeAlignedBlocks(blocks, W); mergeRowSegments(blocks); }
    timings.textdet_ms = ms(t); timings.lines_detected = lines.length; timings.mode = modelOnly() ? "model" : "rules";
    // recognise
    const todo = []; for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) for (const ln of b.lines) todo.push([b, ln]);
    step("rec", "reading the text", {done: 0, total: todo.length}); t = performance.now();
    const crops = [], plan = []; // plan[i] = {idx} (one crop) or {left, right} (leader line split into parts)
    for (const [b, ln] of todo) { const c = T.cropLine(ln.stamped ? img.clean : img.canvas, ln.quad, 48); const sp = (!["table", "form_field"].includes(b.cls)) ? splitLeader(c) : null;
      if (!sp) { plan.push({idx: crops.length}); crops.push(c); continue; }
      const e = {leader: true, left: -1, right: -1}; if (sp.left) { e.left = crops.length; crops.push(sp.left); } if (sp.right) { e.right = crops.length; crops.push(sp.right); } plan.push(e); }
    const res = await T.recognize(crops, 16, (d, n) => step("rec", "reading the text", {done: d, total: n}));
    todo.forEach(([b, ln], i) => { const pl = plan[i];
      if (pl.leader) { const L = pl.left >= 0 ? res[pl.left] : null, R = pl.right >= 0 ? res[pl.right] : null; ln.text = cleanLeaderText(((L ? L.text.trim() : "") + "\t" + (R ? R.text.trim() : ""))).replace(/^\t$/, ""); ln.tab = !!ln.text; ln.confidence = Math.min(L ? L.confidence : 1, R ? R.confidence : 1); ln.char_pos = null; return; }
      const r = res[pl.idx]; let text = r.text.trim(); ln.confidence = r.confidence; ln.char_pos = r.pos; if (isBulletGlyph(text, ln)) { ln.text = bulletGlyph(text); ln.isBullet = true; } else { ln.text = text; leaderTab(ln); } void b; });
    // second opinion: doubtful lines (often handwriting or stamps) go through the handwriting-trained recogniser too
    timings.second_opinion = 0;
    if (T.config.secondOpinion !== false) { const doubtful = todo.map((x, i) => [x, i]).filter(([[, ln], i]) => !plan[i].leader && !ln.isBullet && (ln.confidence || 0) < (T.config.secondOpinionBelow ?? 0.6) && (ln.text || "").length >= 1);
      const altId = doubtful.length ? T.altRecId() : null;
      if (altId && altId !== T.active.rec) { try { if (!T.sessions.rec_alt) { step("rec", "loading the handwriting recogniser"); await T.loadAltRec(altId, p => step("rec", "loading the handwriting recogniser", {done: p.got, total: p.total})); }
          step("rec", "second opinion on doubtful lines", {done: 0, total: doubtful.length}); const alt = await T.recognize(doubtful.map(([, i]) => crops[plan[i].idx]), 16, null, "rec_alt");
          doubtful.forEach(([[, ln]], k) => { const r = alt[k]; const t = (r.text || "").trim(); if (t && r.confidence > (ln.confidence || 0) + 0.12) { ln.text = t; ln.confidence = r.confidence; ln.char_pos = r.pos; ln.alt_model = altId; timings.second_opinion++; } }); }
        catch (e) { console.warn("second opinion skipped", e); } } }
    joinRowSegments(blocks); for (const b of blocks) for (const ln of b.lines) if (ln.merged && !ln.tab) leaderTab(ln);
    timings.rec_ms = ms(t); timings.lines_recognized = todo.length;
    // fonts (printed lines)
    t = performance.now();
    if (T.sessions.font) { step("font", "fonts and sizes"); const sel = todo.map((x, i) => [x, i]).filter(([[b, ln]]) => b.cls !== "handwriting" && (ln.text || "").length >= 2);
      const c32 = sel.map(([[, ln]]) => T.cropLine(ln.stamped ? img.clean : img.canvas, ln.quad, 32)); const fr = await T.classifyFonts(c32); sel.forEach(([[, ln]], k) => { ln.font = fr[k]; if (ln.font) ln.bold = ln.font.weight === "bold" && ln.font.weight_confidence >= 0.6; });
      // mixed lines (a bold label or word inside a regular line) leave the model unsure: classify word by word
      const LABEL_RE = /^\S{1,24}\s?[៖:]/; // "សំណុំលិខិត៖ ..." - a bold label in front of regular text
      const medLineH = U.median(sel.map(([[, ln]]) => ln.bbox[3] - ln.bbox[1])) || 1;
      const unsure = sel.map(([[b, ln]], k) => [ln, k, b]).filter(([ln, , b]) => ln.font && !HEAVY.has(ln.font.family) && (ln.text || "").includes(" ") && ln.char_pos && !["footer", "header", "page_number", "caption", "footnote"].includes(b.cls) && (ln.bbox[3] - ln.bbox[1]) >= 0.7 * medLineH && (ln.font.weight_confidence < 0.85 || LABEL_RE.test(ln.text)));
      for (const [ln, k] of unsure) { try { await wordBold(ln, c32[k]); } catch (e) { console.warn("word bold", e); } } }
    timings.font_ms = ms(t);
    // bullets, structure, fonts per block
    step("structure", "paragraphs and reading order");
    return assemble(img, blocks, timings, tStart, {ignored});
  };

  /** Shared ending of every page: bullets, structure, fonts per block, layout, render, document. */
  async function assemble(img, blocks, timings, tStart, extra) {
    const W = img.width, H = img.height, ms = t => +(performance.now() - t).toFixed(1);
    let t = performance.now();
    for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) { b.lines = mergeBulletLines(b.lines); for (const ln of b.lines) if (ln.text && !["table", "form_field"].includes(b.cls)) textBullet(ln); }
    if (!modelOnly()) blocks = mergeLabelColumns(blocks, W);
    const usedModel = await structure(blocks, W, H); timings.structure_ms = ms(t); timings.structure = usedModel ? "model" : "rules";
    for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) { blockFont(b); if (b.font && b.font.weight !== "bold" && b.lines.length >= 2) for (const ln of b.lines) if (ln.bold && !(ln.spans && ln.spans.length) && !(ln.font && ln.font.weight_confidence >= 0.97 && HEAVY.has(ln.font.family))) ln.bold = false; const pf = b.lines.map(l => l.font_px).filter(Boolean); if (pf.length) { b.font_px = +U.median(pf).toFixed(1); b.font_src = "pdf"; } if (!b.font_px && b.lines.length) { const hs = b.lines.filter(l => l.text).map(l => l.bbox[3] - l.bbox[1]); if (hs.length) { b.font_px = +(U.median(hs) * 0.78).toFixed(1); b.font_src = "image"; } } }
    timings.bullets_found = blocks.reduce((a, b) => a + b.lines.filter(l => l.bullet).length, 0); timings.bold_words = 0;
    const layout = pageLayout(blocks, W, H); const outBlocks = render(img, blocks); timings.order_ms = 0; timings.total_ms = ms(tStart);
    const blob = await new Promise(r => img.canvas.toBlob(r, "image/jpeg", 0.9));
    return {page_id: (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(16) + Math.random().toString(16).slice(2)), width: W, height: H, blocks: outBlocks, layout, document: buildDocument(outBlocks, layout, W, H),
      timings: Object.assign(timings, extra.timings || {}), models: extra.models || Object.assign({}, T.active), device: extra.device || ("browser:" + (T.backendUsed || "wasm")), source: extra.source || "ocr", ignored_regions: extra.ignored || [], image_blob: blob, canvas: img.canvas};
  }

  /** Build a page from lines that already carry text (a PDF text layer): {quad, bbox, score, text, confidence}. No layout
      or recognition model is needed; the font and structure models are used when they happen to be loaded. */
  T.fromLines = async function (img, lines, extra) {
    const tStart = performance.now(), timings = {layout_ms: 0, textdet_ms: 0, lines_detected: lines.length, rec_ms: 0, lines_recognized: lines.length, font_ms: 0};
    let blocks; if (modelOnly()) blocks = lines.map(ln => { const g = block("text", ln.bbox, ln.score, "orphan_lines", "orphan"); g.lines.push(ln); return g; }); else { blocks = groupOrphans(lines); blocks = mergeParagraphs(blocks); }
    timings.mode = modelOnly() ? "model" : "rules";
    let t = performance.now();
    if (T.sessions.font) { try { const sel = lines.filter(ln => (ln.text || "").length >= 2 && !ln.font); const fr = await T.classifyFonts(sel.map(ln => T.cropLine(img.canvas, ln.quad, 32))); sel.forEach((ln, k) => ln.font = fr[k]); } catch (e) { console.warn("font model skipped", e); } }
    timings.font_ms = +(performance.now() - t).toFixed(1);
    return assemble(img, blocks, timings, tStart, extra || {});
  };

  T.pipeline = {cleanRegions, assign, groupOrphans, mergeParagraphs, xyCut, sortLines, buildDocument, render, assemble, tableGrid, findRules, skewOf};
})();
