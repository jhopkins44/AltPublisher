# LEGEND_LOOT.pub Layout Analysis

This document summarizes how `LEGEND_LOOT.pub` is structured and how it maps to `LEGEND_LOOT.png`, then turns that into a card-by-card reconstruction spec.

## File structure

`LEGEND_LOOT.pub` is an OLE compound document with these key streams:

| Stream | Purpose |
|---|---|
| `Escher/EscherStm` | Main drawing tree for page objects and their layout metadata |
| `Escher/EscherDelayStm` | Deferred image bytes; contains the embedded PNG payload |
| `Quill/QuillSub/CONTENTS` | Text/story content |
| `Contents` | Document-level content metadata |
| `Envelope`, `Internal`, `CompObj`, summary streams | Publisher/OLE metadata |

The file header identifies it as Microsoft Publisher (`Microsoft Publisher 3.0` / `MSPublisher.3`).

## How the layout is represented

Publisher stores the page as a hierarchy of Escher records:

```text
DgContainer
  └─ SpgrContainer
       └─ SpContainer
            ├─ Sp
            ├─ OPT
            ├─ Anchor / ClientAnchor / other geometry blobs
            ├─ 0xF122 property blob
            ├─ Textbox (for text-bearing objects)
            ├─ Arc (for decorative curves)
            └─ other per-object records
```

Important record roles:

| Record | Likely role |
|---|---|
| `Sp` (`0xF009`) | Shape identity / flags |
| `OPT` (`0xF00A`) | Shape properties |
| `Anchor` / `ClientAnchor` | Object placement and attachment geometry |
| `Textbox` (`0xF00D`) | Indicates a text frame |
| `Arc` (`0xF010`) | Decorative line/curve shape |
| `0xF122` | Additional per-object data block |

## Embedded image handling

The embedded artwork is stored in `EscherDelayStm` as a PNG stream. The stream contains a 25-byte prelude before the PNG signature, then the PNG payload begins.

The embedded PNG extracted from the `.pub` is **2538 × 3000 px**.

The exported `LEGEND_LOOT.png` in the folder is **1275 × 1650 px**, which indicates the rendered/exported page is a scaled version of the embedded artwork.

## What the rendered sheet looks like

`LEGEND_LOOT.png` is a **2-column by 6-row sheet of identical cards**.

### Card bounds in the PNG

| Row | Col | Card bounds (px) | Center (px) |
|---|---|---:|---:|
| 1 | Left | 54,36 → 602,283 | 328.0,159.5 |
| 1 | Right | 672,37 → 1220,283 | 946.0,160.0 |
| 2 | Left | 54,305 → 602,552 | 328.0,428.5 |
| 2 | Right | 672,305 → 1219,551 | 945.5,428.0 |
| 3 | Left | 54,571 → 602,818 | 328.0,694.5 |
| 3 | Right | 672,570 → 1219,817 | 945.5,693.5 |
| 4 | Left | 54,839 → 602,1086 | 328.0,962.5 |
| 4 | Right | 672,839 → 1220,1086 | 946.0,962.5 |
| 5 | Left | 55,1109 → 603,1356 | 329.0,1232.5 |
| 5 | Right | 672,1108 → 1220,1355 | 946.0,1231.5 |
| 6 | Left | 55,1378 → 603,1625 | 329.0,1501.5 |
| 6 | Right | 672,1377 → 1220,1624 | 946.0,1500.5 |

### Lion image bounds

| Row | Col | Lion bounds (px) | Center (px) |
|---|---|---:|---:|
| 1 | Left | 263,90 → 392,235 | 327.5,162.5 |
| 1 | Right | 881,90 → 1011,235 | 946.0,162.5 |
| 2 | Left | 263,359 → 392,504 | 327.5,431.5 |
| 2 | Right | 880,358 → 1010,503 | 945.0,430.5 |
| 3 | Left | 263,624 → 392,770 | 327.5,697.0 |
| 3 | Right | 880,624 → 1010,769 | 945.0,696.5 |
| 4 | Left | 263,893 → 393,1038 | 328.0,965.5 |
| 4 | Right | 881,892 → 1010,1037 | 945.5,964.5 |
| 5 | Left | 263,1163 → 393,1308 | 328.0,1235.5 |
| 5 | Right | 881,1162 → 1011,1307 | 946.0,1234.5 |
| 6 | Left | 263,1431 → 393,1576 | 328.0,1503.5 |
| 6 | Right | 881,1430 → 1011,1576 | 946.0,1503.0 |

## Object layout patterns found in `EscherStm`

The page tree contains **326 `SpContainer` records**. Most objects repeat a few structural patterns:

| Pattern | Likely object type |
|---|---|
| `Sp + OPT` | structural/group shape |
| `Sp + OPT + 0xF122 + Arc + ClientAnchor` | decorative corner/curve object |
| `OPT + Anchor + 0xF122 + Column + ClientAnchor` | frame or layout object |
| same as above + `Textbox` | text frame |
| very large `SpContainer` with long `Anchor` blob | image/picture object |

Counts observed in the page tree:

| Record | Count |
|---|---:|
| `SpContainer` | 326 |
| `Anchor` | 324 |
| `ClientAnchor` | 325 |
| `Textbox` | 96 |
| `Arc` | 13 |

## Card-by-card reconstruction spec

This is the practical reconstruction plan for rebuilding the sheet:

### 1. Use a 2 × 6 page grid

- Page is organized as two columns and six rows.
- Each card has the same outer footprint and is repeated with only position changes.

### 2. Build one reusable card template

Each card consists of:

1. outer rectangular border
2. decorative clipped-corner / curved-corner elements
3. top title text: `LONGVIEW LOOT`
4. centered lion portrait
5. bottom tagline text: `LISTEN • LEARN • LEAD`
6. small `1` markers in the four corners

### 3. Position the repeated card template

Use the card bounds listed above as the placement grid:

- Left column cards start around `x ≈ 54–55`
- Right column cards start around `x ≈ 672`
- Card rows start around `y ≈ 36, 305, 571, 839, 1109, 1378`

### 4. Position the lion image inside each card

The lion image is centered in each card with bounds around:

- Left column: `x ≈ 263–393`, `y ≈ 90–1576`
- Right column: `x ≈ 880–1011`, `y ≈ 90–1576`

Within each card, the lion is centered horizontally and placed in the upper-middle portion of the card.

### 5. Map Publisher object records to the template parts

When parsing `EscherStm`:

- treat each `SpContainer` as one layout object
- use `Textbox` records to identify title/footer text frames
- use `Arc` records to identify the corner ornament objects
- use the large `Anchor` / `0xF122` blobs to identify the picture frame and its placement data
- use `ClientAnchor` as a secondary attachment/placement record

### 6. Use `EscherDelayStm` for the embedded image bytes

When reconstructing the lion portrait:

- extract the PNG from `EscherDelayStm`
- place it using the image-bearing `SpContainer` geometry
- preserve aspect ratio, then crop or fit to the card’s central image area

## Notes for implementation

- The exact numeric meaning of every anchor/property field is not fully decoded here, but the repeated structure is clear and stable.
- The long `Anchor` payloads appear to carry the actual per-object placement data used by Publisher to rebuild the page.
- The text story content is not stored inline with the page tree; it lives separately in the Quill stream.

