# ThaOCR web — client-only Khmer document OCR

Everything in this folder is static. The browser downloads the ONNX models once, runs them with ONNX Runtime Web
(WebAssembly, or WebGPU where available) and keeps documents in IndexedDB. There is no backend, no account and no
server-side storage; the app says so before first use.

```
index.html / app.js / app.css   the UI (same look as the backend-served app)
docview.js                      reflowed, editable page view (shared with the backend app)
ocr/engine.js                   model loading + the five stages (layout, lines, recogniser, font, structure)
ocr/pipeline.js                 regions -> blocks -> text -> paragraphs -> page result (same schema as POST /process)
ocr/pdf.js                      PDF input (pdf.js from jsDelivr): text-layer pages are read without OCR, image pages are OCRed
ocr/device.js                   device check, model-set recommendation, benchmark, time estimate
ocr/store.js                    IndexedDB documents + page images
models/                         models.json (manifest) + font/structure *_meta.json; the ONNX files themselves are
                                pulled from https://huggingface.co/Thareah/ThaOCR-models (default set 41 MB)
(no vendor folder)              onnxruntime-web 1.31.1 and docx 9.15.3 load from jsDelivr (ThaOCR.config.ortBase);
                                a local copy in vendor/ is git-ignored and only needed for offline work
fonts/                          Khmer fonts for the reflowed view (OFL / LGPL)
serve.py, vercel.json, _headers dev server and hosting headers (COOP/COEP -> multi-threaded WebAssembly)
test.html                       engine test page: ?img=<your image>&backend=wasm|webgpu&bench=1 (no sample images are shipped)
```

Run locally: `python3 serve.py 8020` then open http://localhost:8020/ .

Runtime: `ThaOCR.config.ortBase` is the jsDelivr URL of onnxruntime-web 1.31.1 (it sends CORS and CORP headers, so it
works under the isolation headers, threads included); the docx library loads from jsDelivr too. For offline work copy
the `dist/` files of onnxruntime-web into `vendor/` and set `ortBase` to `"vendor/"`.

Models: `ThaOCR.config.modelBase` (ocr/engine.js) is the Hugging Face resolve URL of `Thareah/ThaOCR-models`; the
browser fetches only the chosen set, once, into the Cache API. The manifest and the small meta JSON files stay in
`models/` on the site. To work offline, copy the ONNX/vocab files into `models/` (they are git-ignored) and set
`modelBase` to `"models/"`.

Deploy: the folder is a plain static site. On Vercel just import the GitHub repo (no build step, output directory `.`);
`vercel.json` sets the two cross-origin isolation headers that enable multi-threaded WebAssembly and the cache headers.
On other hosts add the headers from `_headers`. Without them the app still runs, single-threaded.

PDF files: every page becomes a document. A page whose text layer is usable (at least 40 characters, not damaged)
is taken from the PDF directly - exact text, no models needed, well under a second; only the small font and
structure models (6 MB) are loaded to label headings and lists. Pages without text (scans) are rendered at 2200 px
and go through the normal OCR pipeline. PDFs written by Skia (Chrome, Google Docs, Android) store the real Khmer
text in `ActualText` marks that pdf.js ignores; `ocr/pdf.js` lexes the page content stream itself and substitutes
them, otherwise the text comes out in visual order with subscripts lost. A text layer that still looks broken
(NUL glyphs, vowel signs starting words) is rejected and the page is OCRed instead. "Run OCR instead" on the review
page forces OCR for a page.

Device tiers (ocr/device.js): **Best quality** (WebGPU or >= 8 threads and >= 8 GB) = fp32 recogniser v2.4, detector at
1600-2200 px; **Balanced** = int8 recogniser, 1600-1800 px; **Light** (phones, <= 4 threads or <= 4 GB) = int8,
1100-1300 px. A 2-second benchmark after loading gives the per-page estimate; each finished page refines it.

Layout rules added in the browser version (not in the server): segments of one line are recognised separately and
joined in reading order; dot leaders become a tab with the page number right-aligned (Document view and Word);
`table` regions and side-by-side aligned blocks (a list with counts at the right) are rebuilt as cell grids from
ruling lines or line alignment and exported as real Word tables; line order inside a block is always geometric.

Not ported from the backend yet (rules that need OpenCV): red-stamp lifting and reading text under stamps, ink-based
bullet detection, bold words by stroke weight, text colours, figure splitting, box snapping, decoration/rule detection.
Layout models are Ultralytics YOLO11 (AGPL-3.0).
