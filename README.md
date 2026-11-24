# ThaOCR web — client-only Khmer document OCR

Everything in this folder is static. The browser downloads the ONNX models once, runs them with ONNX Runtime Web
(WebAssembly, or WebGPU where available) and keeps documents in IndexedDB. There is no backend, no account and no
server-side storage; the app says so before first use.

```
index.html / app.js / app.css   the UI (light + dark theme: follows the system, switch in the sidebar or Settings)
home.js / home.css              Home (#/home): the welcome page - what the app does, why it is safe, what this device can
                                run (live from ocr/device.js + the manifest), a before -> after demo on a made-up page
docview.js                      the Document view: the page as an editable document (window.DocView)
export.js                       Word (.docx) and PDF export from one document model (window.ThaExport)
pdftools.js                     PDF page core: merge / reorder / rotate / split / extract PDF pages (window.ThaPdfTools)
ocr/engine.js                   model loading + the five stages (layout, lines, recogniser, font, structure); the layout
                                stage runs ThaOCR's YOLO model or PaddleOCR-VL's PP-DocLayout (regions + roles + reading order)
ocr/pipeline.js                 regions -> blocks -> text -> paragraphs -> page result (same schema as POST /process)
ocr/pdf.js                      PDF input (pdf.js from jsDelivr): text-layer pages are read without OCR, image pages are OCRed
ocr/device.js                   device check, model-set recommendation, benchmark, time estimate
ocr/store.js                    IndexedDB documents + page images
models/                         models.json (manifest) + font/structure *_meta.json; the ONNX files themselves are
                                pulled from https://huggingface.co/Thareah/ThaOCR-models (default set 41 MB); the optional
                                PaddleOCR-VL layout models come from PaddlePaddle's own Hugging Face repos
(no vendor folder)              onnxruntime-web 1.31.1, docx 9.15.3, harfbuzzjs 1.6.4 and pdf-lib 1.17.1 load from jsDelivr
                                (ThaOCR.config.ortBase, ThaExport.config.docx / .harfbuzz, ThaPdfTools.config.pdfLib); a local copy in vendor/
                                is git-ignored and only needed for offline work
fonts/                          Khmer fonts for the reflowed view (OFL / LGPL)
serve.py, vercel.json, _headers dev server and hosting headers (COOP/COEP -> multi-threaded WebAssembly)
test.html                       engine test page: ?img=<your image>&backend=wasm|webgpu&bench=1&layout=<layout model id>&rules=0
                                (no sample images are shipped)
```

Run locally: `python3 serve.py 8020` then open http://localhost:8020/ .

Home (`#/home`, first item in the sidebar, also the ThaOCR logo; on a phone the logo, since the bottom bar keeps five
tabs): the page a first-time visitor sees. A visit without a hash opens Home until the visitor has moved on from it (a button,
the sidebar) or has a document; after that it opens Scan as before. The welcome notice is not shown over Home (Home says the
same). In plain words for non-technical people: what ThaOCR can do (photos, scans and PDFs to Khmer / English text,
tables / headings / lists kept, Word / PDF / text export, the PDF page tools, saved corrections, Select), why it can be
trusted (nothing uploaded, no account, free, reads without internet once the models are in, made for Khmer), what this
device can run, and the limits (handwriting and stamps, poor photos, no red-stamp lifting yet, the first download, storage
in this browser only). "What this device can do" is filled in from `ThaOCR.deviceInfo()` / `recommend()` /
`downloadPlan()` / `benchmarkStored()` / `estimate()` and `plannedBackend()`: the recommended model set and why, GPU or
CPU, what is still to download and what is already here, the speed (or "measured after your first scan"), the three
model sets with their download size (tap one to switch), one row per stage with the model this device uses, its size
and status (on this device / downloads at first scan / only when needed / not needed here / too heavy for this device),
and behind "Details for the curious" the device's technical facts and every model in the manifest. The demo page is
drawn on a canvas with the bundled fonts (Khmer OS Muol Light, Khmer OS Battambang): a community library notice with a
paragraph, a table and a list, no names. Next to it, the result as editable text. "Read this page for real" sends that
picture through the normal scan (download card the first time, then the review page; it is saved in Documents like any
scan). Opening Home never downloads a model: the device check reads `models.json` and the Cache API only, and the
background warm-up of the models (computers, not phones) starts on the pages that read text (Scan, Select, Documents,
Review, Settings), not on Home, Help or PDF.

Runtime: `ThaOCR.config.ortBase` is the jsDelivr URL of onnxruntime-web 1.31.1 (it sends CORS and CORP headers, so it
works under the isolation headers, threads included); the docx library loads from jsDelivr too. For offline work copy
the `dist/` files of onnxruntime-web into `vendor/` and set `ortBase` to `"vendor/"`.

Models: `ThaOCR.config.modelBase` (ocr/engine.js) is the Hugging Face resolve URL of `Thareah/ThaOCR-models`; the
browser fetches only the chosen set, once, into the Cache API (a file is stored only when it arrived complete; a
dropped connection is retried up to 5 times and resumes with a `Range` request, so a flaky phone connection does not
restart a file from zero; an attempt cut off by a screen lock, an app switch or going offline is not counted, and the
next one waits until the page is visible and online again). The manifest and the small meta JSON files stay in
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

Device tiers (ocr/device.js): **Best quality** (not a phone, and WebGPU or >= 8 threads and >= 8 GB) = fp32 recogniser
v2.4, detector at 1600-2200 px; **Balanced** = int8 recogniser, 1600-1800 px; **Light** (every phone, even one with
WebGPU; <= 4 threads or <= 4 GB) = int8 recogniser, 1100-1300 px; phones also get the int8 layout model (3.3 MB instead
of 10.9 MB), which Settings can switch back (Model set -> Balanced, or Models -> Layout). On a device recommended Light
nothing is downloaded when the page opens, only at the first scan; on any device, Home, Help and the PDF page tools
start no download. Compute "Automatic" is the GPU on a computer with
WebGPU and the CPU on a phone; Settings > Compute can pick the GPU. A model set picked in Settings is kept across
reloads. A 2-second benchmark after loading gives the per-page estimate; each finished page refines it.

Layout rules added in the browser version (not in the server): segments of one line are recognised separately and
joined in reading order; dot leaders become a tab with the page number right-aligned (Document view and Word);
`table` regions and side-by-side aligned blocks (a list with counts at the right) are rebuilt as cell grids from
ruling lines or line alignment and exported as real Word tables; a narrow column of labels at the left margin
("យោង ៖", "សំណុំលិខិត៖" - bold or ending in a colon) whose rows line up with wider value blocks becomes a borderless
label/value table, so labels stay beside their values; in a bordered table a faint rule the scan lost is recovered
from the baseline rows that start a record. Line order inside a block is geometric.

Document view (review page, right pane; docview.js), the Word / PDF export, and the Text view / Copy / .txt
(`ThaOCR.pipeline.composeBlocks`: paragraphs apart by a blank line, list items with their marker, table rows with
tab-separated cells, a dot-leader line as one line) read the page through one reading layout,
`ThaOCR.pipeline.compose(page)`, built from `page.document` and the current line texts, so saved documents benefit
too and they always agree. In the PDF a list marker no bundled font has ("➢", "❖", "✓") is drawn as a small shape:
- a paragraph the layout model split over several blocks is one paragraph again where the text only wrapped (the part
  before ends at the right edge, the next starts at the left edge or under a first-line indent / the text of a list
  item, same size, about one line pitch below); inside a block, a line starting with a marker ("-", "ក-", "១.") after
  a kept break, or a list line left of its item's text (a bullet read as a letter), starts its own paragraph / item;
- alignment comes from the line geometry: centred, right, justified (the lines before the last reach the right edge),
  first-line and hanging indents; a first line pushed right by its indent is not "centred";
- a table is a real table: the scan's columns, one body size in every cell, text wrapping inside its cell (on a
  phone the columns size to their text and the table scrolls sideways);
- never worse than the Overlay: lines are taken as visual rows, left to right (a reference number and the small text
  after it stay one line; a duplicate detection inside another line is dropped). A row whose segments stand far apart
  (a list with counts at the right), and a table whose grid would wrap a one-line text or change the left-to-right
  order of a row, are shown as the Overlay shows them: each segment editable at its x on the scan (tab stops in Word
  and PDF), one line per row on a computer, wrapping on a phone; rows between them (a heading, "-" items) stay text.

On a computer every element keeps its place on the scan; a paragraph keeps the width of its lines, and its size
starts from the font model's em size: all body text gets one factor (the median of scan width / text width over the
body paragraphs and lines), and a paragraph that would then wrap into more lines than on the scan shrinks by up to
10% to keep its line count. Headings are fitted to their own width. On a phone (< 861 px) the same document reflows
at a reading size, left-aligned instead of justified. Everything is editable: paragraphs, headings, list items and
their bullets, every table cell (text typed into an empty cell becomes a new line with the cell's box), both sides of
a dot-leader line. Each scanned line is a span in its paragraph, so an edit is saved to the lines it touched
(after a short pause and on leaving the text); a line that ends up holding the text of several scanned lines is marked
"joined" and is left out of the training corrections. Lines below 0.8 confidence keep a yellow hint until edited or
accepted, and a "To check" card puts the caret on its line.

Settings > Layout > Page analysis switches these rules off ("Models only"): grouping, reading order and paragraphs then come
from the layout and structure models alone (`ThaOCR.config.rules = false`). On the test pages this is clearly worse
(paragraphs split per line, dot-leader lines broken, label columns out of order), so the default keeps the rules.

PaddleOCR-VL layout (Settings > Layout > Regions and structure, off by default): PaddleOCR-VL is two models, a layout
model (PP-DocLayout: RT-DETR with a reading-order head) and a 0.9B vision-language model that reads each region. The
app can use the layout model in place of its own layout and structure stages; the text is still read by ThaOCR's
recogniser and the fonts by its font model. Two versions are in the manifest, both PaddlePaddle's own ONNX exports
(Apache-2.0), downloaded from their Hugging Face repos at a pinned commit and cached like every other model:
`pp_doclayout_v2` (PP-DocLayoutV2, the one in PaddleOCR-VL, 214 MB) and `pp_doclayout_v3` (PP-DocLayoutV3, the one in
PaddleOCR-VL 1.5 / 1.6, 131 MB). One pass over the page squeezed to 800 x 800 gives every region with one of 25
labels and its place in the reading order. `ocr/engine.js` resizes the page like OpenCV's bicubic (a smoothly shrunk
page makes the model merge regions) and repeats the post-processing of PaddleX's PaddleOCR-VL pipeline (per-class
thresholds, NMS, nested and duplicate boxes, order); on the test pages its regions equal the Python reference within
one pixel. Labels map to the app's classes: doc_title -> title, paragraph_title -> section header, figure_title ->
caption, number -> page number, seal -> stamp, header_image -> logo, image / chart -> figure, display_formula ->
formula; an inline formula stays part of its text line. With such a model the blocks follow its reading order (a
two-column page reads column by column), a region is one paragraph, a numbered heading stays a heading, and the
structure model is not asked (it is still loaded for PDF text pages, which run no layout model). Stray lines outside
every region are placed after the nearest region above them. The layout rules (tables from ruling lines, label
columns, row segments, dot leaders) work as before. Measured on an Apple M2: 0.35-0.55 s a page on WebGPU, 1.5-1.8 s
on WebAssembly (the YOLO model: 0.3 s). Limits: the labels have no signature, handwriting, QR code, checkbox or form
field, which the YOLO model has; table cells still come from the app's own grid rules; the vision-language model is
not used (about 1 GB, and it reads the text itself instead of giving a structure for another reader to fill).
To make it the default, set `"layout"` in `defaults` of `models/models.json` to one of the two ids; for offline work
save the files as `models/layout/pp_doclayout_v2.onnx` / `pp_doclayout_v3.onnx`.

Doubtful lines (confidence < 0.6, typically handwriting or text under a stamp) get a second opinion from the
handwriting-trained recogniser (`crnn_m_v2_hw_int8`, loaded on first need); the better-scoring reading wins.
Tables are de-skewed before the cell grid is built and group-header rows span the table.

Export (export.js): Word and PDF are written from one model built from `page.document`, so they agree.
- One body font size for the whole file: the median size measured on the scan, rounded to half a point (9-14 pt),
  used for every paragraph, list item and table cell. No Word run carries a size; the size lives in the document
  default and the three heading styles (body +2 / +1 / +0 pt), so changing "Normal" in Word resizes everything.
- Structure is kept as editable Word structure: justified paragraphs and first-line indents, scanned numbers
  ("១.", "ក.") kept as text with a hanging indent (Word never renumbers them), real bullets for bullet markers,
  dot-leader lines as a right tab with a dot leader, tables as real tables (fixed column widths, merged group rows,
  borders only when the scan had them, column alignment from where the text sits in its cell, rows never split),
  side-by-side blocks as one borderless row, pictures inline, landscape scans on landscape pages.
- PDF: the browser lays the model out in a hidden box (it breaks Khmer lines with its dictionary and justifies),
  the position of every word is read back, each word is shaped with HarfBuzz using the same font file and written
  with the font embedded (Type0/Identity-H). Every word carries `/ActualText`, so text selects, searches and copies
  in the right order. A table or text line never breaks across a page; a heading moves with what follows it.
- Pages that were read from a PDF text layer carry no table structure (no layout model runs on them); use "Run
  OCR instead" on such a page to get its tables.
- Offline: copy the two library files into `vendor/` and point `ThaExport.config.docx` / `.harfbuzz` there.

PDF (first item in the sidebar, `#/pdf`): page tools for PDF files, separate from OCR. Open one or more PDFs (they are
merged in the order added), see every page as a thumbnail (pdf.js, rendered when it scrolls into view), click to select
(Shift for a range), drag to reorder (press and hold on a phone; a selected page carries the whole selection), rotate,
delete, undo / redo. Download the result, extract the selected pages, or split: click the scissors between pages, or
type page ranges ("1-3, 4-8, 10"; Khmer digits work), one PDF per part, several parts in one .zip. "OCR" sends the
selected pages (or all) to Scan as one PDF. Pages are copied with pdf-lib (`pdftools.js`), not redrawn: text, fonts,
images and links stay as they were; one copy per source keeps shared fonts written once. Nothing is stored: the
files live in the tab until downloaded. Encrypted PDFs (an open password, or "protected" with permissions) are refused
with a message, since their pages can't be copied without the password. Keys: R / Shift+R rotate, Del delete,
Alt + arrows move, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+A select all, Enter preview.

Training data from use: every line a user edits in the review is a (line image, corrected text) pair. Settings ->
"Export corrections" writes them as JSON (PNG crops, base64) for fine-tuning the recogniser with `training/rec`.

Not ported from the backend yet (rules that need OpenCV): red-stamp lifting and reading text under stamps, ink-based
bullet detection, bold words by stroke weight, text colours, figure splitting, box snapping, decoration/rule detection.
Layout models are Ultralytics YOLO11 (AGPL-3.0); the optional PP-DocLayout models are PaddlePaddle's (Apache-2.0).
