# Publisher File Analysis Summary

## Completed analysis

We analyzed `LEGEND_LOOT.pub` and determined that it is an OLE compound document used by Microsoft Publisher.

Key findings:

- The file is structured as a compound file with multiple streams and storages.
- The page layout is stored primarily in the `Escher` streams.
- `Escher/EscherStm` contains the main drawing structure and object records.
- `Escher/EscherDelayStm` contains deferred binary data, including the embedded PNG.
- `Quill/QuillSub/CONTENTS` contains story/text content.
- The layout is represented as nested Escher records such as:
  - `DgContainer`
  - `SpgrContainer`
  - `SpContainer`
  - `Sp`
  - `OPT`
  - `Anchor`
  - `ClientAnchor`
  - `Textbox`
  - `Arc`
  - `ShapeProps`
- The document page appears to be a repeated card-sheet layout with a 2-column by 6-row arrangement.
- The rendered PNG (`LEGEND_LOOT.png`) contains the visible printed card layout.
- The structure analysis identifies the repeated layout model behind the printed output.

## Layout observations

The visible sheet in `LEGEND_LOOT.png` is composed of repeated card objects. The main characteristics include:

- 12 repeated cards total
- 2 columns
- 6 rows
- consistent card bounds and lion image placement across the sheet
- a centered lion image inside each card
- border and footer text repeated in each card

The coordinates discovered for the repeated card layout were used to produce a render model in the Electron application.

## Developed work

We created an Electron application in the Publisher folder that can open a `.pub` file and display the parsed structure instead of the embedded PNG.

### Application features

- Open a `.pub` file through a file picker
- Parse the OLE compound structure
- Display the file tree in a structured left panel
- Display node details in a middle panel
- Render a positioned layout preview in a third panel using the Escher layout model
- Highlight `EscherStm` and visualize the positioned card sheet geometry

### Files created

- `package.json`
- `main.js`
- `preload.js`
- `parser.js`
- `index.html`
- `renderer.js`

### Current purpose of the app

The app is designed as a structure viewer for Publisher files. It shows the internal document hierarchy and the layout model instead of displaying the embedded image preview.

## Notes

This is not a full Publisher document rendering engine yet. It is a structural and geometric viewer built around the discovered `.pub` format and its Escher layout records.

The app successfully identifies the Publisher structure and reconstructs a schematic render of the repeated card layout from the file metadata and geometry.
