# ShapeTest.pub and LandscapeShapeTest.pub structure analysis

## Scope

This document analyzes:

- `ShapeTest.pub` with rendered reference `ShapeTest.png`
- `LandscapeShapeTest.pub` with rendered reference `LandscapeShapeTest.png`

Goal: describe how these Publisher documents represent rendered output, and provide implementation guidance for AltPublisher without assuming all `.pub` files follow the same pattern.

---

## Executive findings

1. Both files are **OLE compound documents** with the expected Publisher streams (`EscherStm`, `EscherDelayStm`, `Quill/CONTENTS`, summary streams).
2. The visible page geometry in both samples is represented primarily through **Escher shape records** (`SpContainer` trees), not through embedded preview bitmaps.
3. For these two files, `EscherDelayStm` is empty (`0` bytes), so there are **no embedded raster image payloads** to place.
4. The count of meaningful shape-geometry records detected in `EscherStm` matches the rendered outputs:
   - `ShapeTest`: 6 geometry shapes -> 6 connected rendered components in PNG
   - `LandscapeShapeTest`: 4 geometry shapes -> 4 connected rendered components in PNG
5. These samples are **vector-shape oriented** test files. They should not be used to infer that all Publisher files omit images, text stories, or other object classes.

---

## File-level structural summary

| File | `.pub` size | Render PNG size | `EscherStm` | `EscherDelayStm` | `Quill/CONTENTS` |
|---|---:|---:|---:|---:|---:|
| ShapeTest | 97,792 | 1,275 x 1,650 | 3,228 bytes | 0 bytes | 19,968 bytes |
| LandscapeShapeTest | 95,744 | 1,650 x 1,275 | 2,362 bytes | 0 bytes | 19,968 bytes |

Observed orientation behavior:

- `ShapeTest` output is portrait (`1275x1650`)
- `LandscapeShapeTest` output is landscape (`1650x1275`)

---

## OLE stream composition (both files)

Key streams present:

- `Root Entry/Escher/EscherStm` (drawing/object tree)
- `Root Entry/Escher/EscherDelayStm` (deferred binary image payloads; empty in these files)
- `Root Entry/Quill/QuillSub/CONTENTS` (story/text storage)
- `Root Entry/Contents`
- Standard OLE metadata streams (`\x01CompObj`, `\x05SummaryInformation`, `\x05DocumentSummaryInformation`)

Implication: you must treat `.pub` rendering as a **multi-stream reconstruction** problem. `EscherStm` alone may be enough for basic vector geometry in some files (like these two), but not in general.

---

## Escher record findings

### ShapeTest.pub

- Total parsed Escher records: `74`
- `SpContainer` records: `12`
- `SpContainer` entries with decodable point-rectangle geometry (`F010`): `6`
- Image-like shapes detected via image property markers: `0`
- Textbox marker shapes (`F00D`): `0`

Most relevant record frequencies:

- `0xF004` (`SpContainer`): 12
- `0xF00A` (shape definition/flags): 12
- `0xF00B` (property table): 10
- `0xF122` (additional property table): 10
- `0xF010` (point/anchor geometry payload): 8
- `0xF011` (client data): 6

### LandscapeShapeTest.pub

- Total parsed Escher records: `61`
- `SpContainer` records: `10`
- `SpContainer` entries with decodable point-rectangle geometry (`F010`): `4`
- Image-like shapes detected via image property markers: `0`
- Textbox marker shapes (`F00D`): `0`

Most relevant record frequencies:

- `0xF004` (`SpContainer`): 10
- `0xF00A` (shape definition/flags): 10
- `0xF00B` (property table): 8
- `0xF122` (additional property table): 8
- `0xF010` (point/anchor geometry payload): 6
- `0xF011` (client data): 4

---

## Geometry-to-render relationship

For these samples, parsing `SpContainer` + `F010` payload rectangles yields normalized geometry bounds that correlate to the rendered PNG content as follows:

- `ShapeTest` geometry bounds:
  - X range: `-46.5562` to `39.7223` (width `86.2785`)
  - Y range: `-60.5089` to `63.7835` (height `124.2924`)
- `LandscapeShapeTest` geometry bounds:
  - X range: `-51.3413` to `40.2228` (width `91.5642`)
  - Y range: `-42.5119` to `35.5356` (height `78.0476`)

Rendered PNG connected-component counts (foreground non-white regions >= 40 px area):

- `ShapeTest.png`: 6 components
- `LandscapeShapeTest.png`: 4 components

This matches the count of decodable shape-rectangle objects above (`6` and `4`), indicating these pages are primarily represented by vector shape geometry in `EscherStm`.

---

## What these samples do **not** prove

Do **not** generalize these files to all Publisher documents:

- No embedded image payloads here (`EscherDelayStm` empty), but other `.pub` files may contain many images.
- No decoded textboxes in the visible shape set here, but other files can include text frame objects requiring Quill story binding.
- Shape record IDs and payload forms vary by Publisher version/export mode; fixed-id assumptions are brittle.
- Some files may include unsupported/unknown Escher records, alternate containers, or records that require stream resynchronization.

---

## Implementation guidance for AltPublisher

### 1. Parsing architecture

Use a two-phase model:

1. **Raw extraction phase**
   - Parse OLE streams
   - Parse Escher record trees with robust boundary checks and controlled resynchronization
   - Extract Quill story payloads
   - Detect deferred binary payloads (PNG/JPEG/WMF/EMF/etc) from delay streams
2. **Semantic mapping phase**
   - Map shape containers to canonical page objects
   - Classify object types from property tables + record neighborhoods
   - Bind text objects to story data when mapping keys are available
   - Map image objects to embedded binary payload references

### 2. Object classification heuristics (non-exclusive)

- Start from `SpContainer` as the candidate drawable unit.
- Inspect child records:
  - Geometry/position candidates: `F010` payload points/rectangles
  - Property tables: `F00B` and `F122`
  - Text markers: `F00D` (and related text client records if present)
  - Client data / anchors: `F011` and neighbors
- Treat classification as probabilistic and version-dependent; log confidence/source evidence per object.

### 3. Coordinate mapping strategy

- Decode all geometry in document-native coordinates first.
- Compute page/object extents from decoded coordinates.
- Apply a deterministic viewport transform to map native coordinates to renderer space.
- Do not hard-code page dimensions from one sample. Prefer:
  - explicit page metrics from document records when available, else
  - extents-derived fallback with margins.

### 4. Robustness requirements

- Keep unknown records as first-class diagnostics entities (id, offset, length, parent chain, payload preview).
- Never silently drop undecoded geometry records.
- Separate “parse success” from “render completeness” in logs and UI.
- Maintain a corpus-driven test matrix (portrait, landscape, text-heavy, image-heavy, grouped objects, connectors, rotated objects, etc.).

### 5. Minimum validation signals per file

For each imported `.pub`, report:

- total Escher records parsed
- `SpContainer` count
- drawable-object count emitted
- image payload count detected
- text story count detected/bound
- unknown/unsupported record count
- normalized geometry extents
- rendered object count vs. expected-object count from parser

This prevents regressions where files open but render little/no content.

---

## Practical conclusion for these two files

For `ShapeTest.pub` and `LandscapeShapeTest.pub`, the rendered output is represented mainly by **vector shape geometry in Escher records**, not embedded bitmap payloads. AltPublisher should render these by decoding `SpContainer` geometry and property tables into canonical vector objects, then mapping coordinates to page space. The importer must remain general and stream-aware for other `.pub` files that include text/image/object patterns not present in these two samples.
