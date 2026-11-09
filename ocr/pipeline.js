/* ThaOCR browser pipeline: image -> layout -> lines -> text -> fonts -> structure -> page result (same schema as the
   backend's /process response, so the review UI and DocView work unchanged). Port of pipeline_service.py,
   reading_order.py, parts of doc_structure.py / page_structure.py / document.py. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};
  const {TEXT_CLASSES, CROP_CLASSES, COLORS, LABELS, legacyType, hex} = T;
  const U = T.util, LOW = 0.8, LAYOUT_PAD = 2, STAMP_CLASSES = new Set(["stamp", "signature"]);
  const HEAVY = new Set(["Khmer OS Muol", "Khmer OS Muol Light", "Khmer OS Muol Pali", "Khmer OS Bokor", "Khmer OS Metal Chrieng", "Koulen", "Dangrek", "Bayon", "Angkor", "Taprom"]);
  const BULLET_READINGS = new Set(["o", "O", "0", "០", "•", "-", "·", "*", "e", "c", "C", "D", "Q", "–", "—", "▪", "■", "○", "●", "◦", "➢", "►", "✓"]);
  const iou = (a, b) => { const i = U.bInter(a, b); return i ? i / (U.bArea(a) + U.bArea(b) - i) : 0; };
  const inside = (c, box, tol = 0) => box[0] - tol <= c[0] && c[0] <= box[2] + tol && box[1] - tol <= c[1] && c[1] <= box[3] + tol;
  const centre = q => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
  const quadOf = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const block = (cls, box, score = 1, label = "", source = "layout") => ({cls, box: box.slice(), score, label: label || cls, source, lines: []});

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
  function sortLines(lines) { if (!lines.length) return []; const items = lines.slice().sort((a, b) => (a.bbox[1] + a.bbox[3]) - (b.bbox[1] + b.bbox[3])); const rows = [[items[0]]];
    for (const ln of items.slice(1)) { const b = ln.bbox, cy = (b[1] + b[3]) / 2, h = b[3] - b[1], row = rows[rows.length - 1]; const rcy = row.reduce((a, r) => a + (r.bbox[1] + r.bbox[3]) / 2, 0) / row.length; const rh = row.map(r => r.bbox[3] - r.bbox[1]).sort((a, b) => a - b)[row.length >> 1];
      if (Math.abs(cy - rcy) < 0.5 * Math.min(rh, h)) row.push(ln); else rows.push([ln]); }
    return rows.flatMap(r => r.sort((a, b) => a.bbox[0] - b.bbox[0])); }

  /* ---------------------------------------------------------------- bullets, paragraphs, roles */
  function isBulletGlyph(text, ln) { if (!BULLET_READINGS.has(text)) return false; const w = ln.bbox[2] - ln.bbox[0], h = ln.bbox[3] - ln.bbox[1]; return w <= 1.6 * h && h <= 1.6 * w; }
  const isKhmer = ch => ch >= "ក" && ch <= "៿";
  function joinWrapped(a, b) { if (!a) return b; if (!b) return a; return isKhmer(a[a.length - 1]) && isKhmer(b[0]) ? a + b : a + " " + b; }
  const paragraphText = lines => lines.reduce((a, l) => joinWrapped(a, l.text), "");
  function paragraphRuns(lines) { const runs = []; for (const ln of lines) { const t = ln.text, bold = !!ln.bold; if (!t) continue; if (runs.length) { const last = runs[runs.length - 1]; const glue = isKhmer(last.text[last.text.length - 1] || "") && isKhmer(t[0]) ? "" : " "; if (last.bold === bold) { last.text += glue + t; continue; } last.text += glue; } runs.push({text: t, bold}); } return runs; }
  function mergeBulletLines(lines) { // a line read as a bullet glyph joins the text line of its row
    const bullets = lines.filter(l => l.isBullet), rest = lines.filter(l => !l.isBullet);
    for (const bl of bullets) { const cy = (bl.bbox[1] + bl.bbox[3]) / 2; let best = null, bd = Infinity;
      for (const l of rest) { if (l.bbox[0] < bl.bbox[2] - 2) continue; const h = l.bbox[3] - l.bbox[1]; if (Math.abs((l.bbox[1] + l.bbox[3]) / 2 - cy) > 0.6 * h) continue; const d = l.bbox[0] - bl.bbox[2]; if (d < bd && d < 4 * h) { bd = d; best = l; } }
      if (best && !best.bullet) { best.bullet = bl.text; best.bullet_box = bl.bbox.slice(); } else rest.push(bl); }
    return rest;
  }
  function textBullet(ln) { // a recognised marker at the start of the text ("- ", "1. ", "ក) ")
    if (ln.bullet) return; const m = ln.text.match(U.BULLET_RE); if (!m) return; const glyph = m[1]; ln.bullet = /^[•\-–—○o◦▪■➢►✓*·]$/.test(glyph) ? (glyph === "-" || glyph === "–" || glyph === "—" ? "-" : "•") : glyph; ln.text = ln.text.slice(m[0].length).trimStart();
    const w = ln.bbox[2] - ln.bbox[0], h = ln.bbox[3] - ln.bbox[1], frac = Math.min(0.5, m[0].length / Math.max(1, m[0].length + ln.text.length)); ln.bullet_box = [ln.bbox[0], ln.bbox[1], ln.bbox[0] + w * frac, ln.bbox[3]]; ln.bbox = [ln.bbox[0] + w * frac, ln.bbox[1], ln.bbox[2], ln.bbox[3]]; ln.quad = quadOf(...ln.bbox); void h;
  }
  const ROLE_TO_CLS = {title: "title", section_header: "section_header", list_item: "list", header: "header", footer: "footer", page_number: "page_number", caption: "caption", footnote: "footnote", text: "text"};
  /** Lines in reading order, paragraphs, indent levels and (model) roles for every text block. */
  async function structure(blocks, W, H) {
    const textBlocks = blocks.filter(b => TEXT_CLASSES.has(b.cls)), all = [];
    for (const b of textBlocks) { b.lines = sortLines(b.lines); if (!["table", "form_field", "handwriting"].includes(b.cls)) all.push(...b.lines.filter(l => l.text)); }
    let preds = null;
    if (all.length >= 2 && T.sessions.structure) { try { const p = await T.predictStructure(all, W, H); preds = new Map(all.map((l, i) => [l, p[i]])); } catch (e) { console.warn("structure model failed", e); } }
    for (const b of textBlocks) {
      const lines = b.lines.filter(l => l.text), withP = preds && lines.length >= 2 && lines.every(l => preds.has(l));
      if (withP) lines.sort((x, y) => preds.get(x).order - preds.get(y).order);
      const medH = U.median(lines.map(l => l.bbox[3] - l.bbox[1])) || 1;
      // paragraphs
      const paras = []; let cur = null;
      lines.forEach((l, i) => { const p = withP ? preds.get(l) : null; const prev = i ? lines[i - 1] : null;
        let starts = i === 0 || !!l.bullet || (p ? p.first_p >= 0.5 : false);
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
  function render(img, blocks) {
    const W = img.width, H = img.height, out = [];
    xyCut(blocks, W, H, b => b.box).forEach((b, k) => { const order = k + 1, cls = b.cls, x0 = Math.max(0, b.box[0]), y0 = Math.max(0, b.box[1]), x1 = Math.min(W, b.box[2]), y1 = Math.min(H, b.box[3]), textCls = TEXT_CLASSES.has(cls);
      const blk = {id: "b" + order, type: legacyType(cls), label: cls, cls, cls_id: T.CLASSES.indexOf(cls), display: LABELS[cls] || cls, color: hex(COLORS[cls] || [120, 120, 120]), model_label: b.label, score: +b.score.toFixed(4), source: b.source, reading_order: order,
        box: {x: x0, y: y0, width: x1 - x0, height: y1 - y0}, lines: [], crop: null, text: "", recognized: textCls, font_px: b.font_px || null, font_src: b.font_src || null, align: b.align || "left", relabel: b.relabel || null, font: b.font || null, text_color: null};
      if (!textCls) { blk.crop = cropDataUrl(img.canvas, [x0, y0, x1, y1]); out.push(blk); return; }
      const rendered = new Map();
      b.lines.forEach((ln, i) => { const lx0 = Math.max(0, ln.bbox[0]), ly0 = Math.max(0, ln.bbox[1]), lx1 = Math.min(W, ln.bbox[2]), ly1 = Math.min(H, ln.bbox[3]); if (lx1 - lx0 < 2 || ly1 - ly0 < 2) return;
        const line = {box: {x: lx0, y: ly0, width: lx1 - lx0, height: ly1 - ly0}, quad: ln.quad.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), text: ln.text || "", confidence: +(ln.confidence || 0).toFixed(4), score: +(ln.score || 0).toFixed(4), reading_order: i + 1,
          indent_level: ln.indent_level || 0, indent: 0, tab: false, bullet: ln.bullet || null, bullet_box: ln.bullet_box ? ln.bullet_box.map(v => +v.toFixed(1)) : null, baseline: null, core_h: null, font: ln.font ? Object.fromEntries(Object.entries(ln.font).filter(([k]) => k !== "probs")) : null, bold: !!ln.bold, spans: [], text_color: null};
        blk.lines.push(line); rendered.set(ln, line); });
      blk.text = blockText(blk.lines); blk.bold = blk.lines.length > 0 && blk.lines.filter(l => l.text).every(l => l.bold);
      blk.paragraphs = (b.paras || []).map(p => { const pl = p.lines.map(l => rendered.get(l)).filter(l => l && l.text); if (!pl.length) return null; const levels = pl.map(l => l.indent_level);
        return {indent_level: p.indent_level || 0, bullet: p.bullet || null, text: paragraphText(pl), lines: pl.map(l => l.reading_order), runs: paragraphRuns(pl), first_line_indent: pl.length > 1 && levels[0] > Math.min(...levels.slice(1))}; }).filter(Boolean);
      out.push(blk); });
    return out;
  }
  /* ---------------------------------------------------------------- structured document (document.py) */
  const BODY = new Set(["text", "title", "section_header", "list", "table", "caption", "footnote", "form_field", "handwriting"]);
  function xClusters(blocks) { // blocks chained by horizontal overlap -> columns, left to right
    const cols = []; for (const b of blocks.slice().sort((a, c) => a.box.x - c.box.x)) { const bx0 = b.box.x, bx1 = b.box.x + b.box.width; const col = cols.find(c => Math.min(c.x1, bx1) - Math.max(c.x0, bx0) > 0.3 * Math.min(c.x1 - c.x0, bx1 - bx0)); if (col) { col.items.push(b); col.x0 = Math.min(col.x0, bx0); col.x1 = Math.max(col.x1, bx1); } else cols.push({x0: bx0, x1: bx1, items: [b]}); } return cols.map(c => c.items); }
  const styleOf = b => { const f = b.font || {}; return {family: f.family || null, weight: f.weight || "regular", slant: f.slant || "upright", color: b.text_color || null, font_px: b.font_px || null, heavy: HEAVY.has(f.family), size_model: b.font_src === "model"}; };
  function elements(blocks, contentW) {
    const els = [];
    for (const b of blocks) { const cls = b.cls || "text", box = b.box, base = {block: b.id, role: cls, align: b.align || "left", style: styleOf(b), box: [+box.x.toFixed(1), +box.y.toFixed(1), +box.width.toFixed(1), +box.height.toFixed(1)]};
      if (CROP_CLASSES.has(cls) || !(b.lines || []).length) { if (cls === "decoration") els.push({...base, type: "decoration", crop: b.crop && b.crop.url}); else if (b.crop) els.push({...base, type: "figure", crop: b.crop.url, width_frac: +Math.min(1, box.width / contentW).toFixed(3), aspect: +(box.height / Math.max(1, box.width)).toFixed(4)}); continue; }
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
    const firstBody = ordered.findIndex(b => BODY.has(b.cls || "text")), head = ordered.slice(0, firstBody < 0 ? ordered.length : firstBody), rest = ordered.slice(head.length), cols = head.length >= 2 ? xClusters(head) : [];
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
    const orphans = assign(lines, blocks); for (const b of blocks) if (!TEXT_CLASSES.has(b.cls)) b.lines = [];
    blocks = dropEmptyContainers(blocks); const lineH = lines.length ? U.median(lines.map(l => { const q = U.bboxOf(l.quad); return q[3] - q[1]; })) : 0; for (const b of blocks) fallbackWholeBlock(b, lineH);
    blocks.push(...groupOrphans(orphans)); blocks = mergeParagraphs(blocks); timings.textdet_ms = ms(t); timings.lines_detected = lines.length;
    // recognise
    const todo = []; for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) for (const ln of b.lines) todo.push([b, ln]);
    step("rec", "reading the text", {done: 0, total: todo.length}); t = performance.now();
    const crops = todo.map(([, ln]) => T.cropLine(img.canvas, ln.quad, 48));
    const res = await T.recognize(crops, 16, (d, n) => step("rec", "reading the text", {done: d, total: n}));
    todo.forEach(([b, ln], i) => { const r = res[i]; let text = r.text.trim(); ln.confidence = r.confidence; ln.char_pos = r.pos; if (isBulletGlyph(text, ln)) { text = (text === "-" || text === "–" || text === "—") ? "-" : "•"; ln.isBullet = true; } ln.text = text; void b; });
    timings.rec_ms = ms(t); timings.lines_recognized = todo.length;
    // fonts (printed lines)
    t = performance.now();
    if (T.sessions.font) { step("font", "fonts and sizes"); const sel = todo.map((x, i) => [x, i]).filter(([[b, ln]]) => b.cls !== "handwriting" && (ln.text || "").length >= 2);
      const fr = await T.classifyFonts(sel.map(([[, ln], i]) => { const c = T.cropLine(img.canvas, ln.quad, 32); return c; })); sel.forEach(([[, ln]], k) => ln.font = fr[k]); }
    timings.font_ms = ms(t);
    // bullets, structure, fonts per block
    t = performance.now(); step("structure", "paragraphs and reading order");
    for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) { b.lines = mergeBulletLines(b.lines); for (const ln of b.lines) if (ln.text && !["table", "form_field"].includes(b.cls)) textBullet(ln); }
    const usedModel = await structure(blocks, W, H); timings.structure_ms = ms(t); timings.structure = usedModel ? "model" : "rules";
    for (const b of blocks) if (TEXT_CLASSES.has(b.cls)) { blockFont(b); if (!b.font_px && b.lines.length) { const hs = b.lines.filter(l => l.text).map(l => l.bbox[3] - l.bbox[1]); if (hs.length) { b.font_px = +(U.median(hs) * 0.78).toFixed(1); b.font_src = "ink"; } } }
    timings.bullets_found = blocks.reduce((a, b) => a + b.lines.filter(l => l.bullet).length, 0); timings.bold_words = 0;
    const layout = pageLayout(blocks, W, H); const outBlocks = render(img, blocks); timings.order_ms = 0; timings.total_ms = ms(tStart);
    step("done", "done");
    const blob = await new Promise(r => img.canvas.toBlob(r, "image/jpeg", 0.9));
    return {page_id: (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(16) + Math.random().toString(16).slice(2)), width: W, height: H, blocks: outBlocks, layout, document: buildDocument(outBlocks, layout, W, H),
      timings, models: Object.assign({}, T.active), device: "browser:" + (T.backendUsed || "wasm"), ignored_regions: ignored, image_blob: blob, canvas: img.canvas};
  };
  T.pipeline = {cleanRegions, assign, groupOrphans, mergeParagraphs, xyCut, sortLines, buildDocument, render};
})();
