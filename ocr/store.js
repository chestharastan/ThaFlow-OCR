/* Local storage for documents: IndexedDB (results + page images as blobs). Nothing is sent anywhere. */
(function () {
  "use strict";
  const T = window.ThaOCR = window.ThaOCR || {};
  const DB = "thaocr", VER = 1; let dbp = null;
  function open() { if (dbp) return dbp; dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("docs")) d.createObjectStore("docs", {keyPath: "page_id"}).createIndex("created", "created"); if (!d.objectStoreNames.contains("images")) d.createObjectStore("images"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return dbp; }
  const tx = (d, names, mode, fn) => new Promise((res, rej) => { const t = d.transaction(names, mode); const out = fn(t); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const urls = new Map();  // page_id -> object URL
  T.db = {
    async all() { const d = await open(); return new Promise((res, rej) => { const r = d.transaction("docs").objectStore("docs").getAll(); r.onsuccess = () => res(r.result.sort((a, b) => b.created - a.created)); r.onerror = () => rej(r.error); }); },
    async get(id) { const d = await open(); return new Promise((res, rej) => { const r = d.transaction("docs").objectStore("docs").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
    async put(doc, imageBlob) { const d = await open(); await tx(d, ["docs", "images"], "readwrite", t => { t.objectStore("docs").put(doc); if (imageBlob) t.objectStore("images").put(imageBlob, doc.page_id); }); },
    async del(id) { const d = await open(); await tx(d, ["docs", "images"], "readwrite", t => { t.objectStore("docs").delete(id); t.objectStore("images").delete(id); }); if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } },
    async clear() { const d = await open(); await tx(d, ["docs", "images"], "readwrite", t => { t.objectStore("docs").clear(); t.objectStore("images").clear(); }); for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); },
    async imageUrl(id) { if (urls.has(id)) return urls.get(id); const d = await open(); const blob = await new Promise((res, rej) => { const r = d.transaction("images").objectStore("images").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
      if (!blob) return ""; const u = URL.createObjectURL(blob); urls.set(id, u); return u; },
    async imageBlob(id) { const d = await open(); return new Promise((res, rej) => { const r = d.transaction("images").objectStore("images").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); },
    async bytes() { try { const e = await navigator.storage.estimate(); return e.usage || 0; } catch { return 0; } },
  };
})();
