# AltPublisher

Electron desktop app for opening Microsoft Publisher (`.pub`) files, inspecting their internal structure, editing imported page object bounds, saving to a compact human-readable AltPublisher project format, and printing.

## Current capabilities

- Open `.pub` files and parse OLE/Escher structure.
- Render page elements from Escher geometry records in the opened `.pub` file, including resized embedded-image placements derived from image-shape records.
- Inspect structure tree and record metadata.
- View unsupported/unknown Escher records in a dedicated diagnostics panel.
- Toggle diagnostics panel visibility from the app menu (**View → Show Unsupported Records Panel**).
- Edit basic object geometry (`x`, `y`, `width`, `height`) in the object editor.
- Undo/redo object edits.
- Save and reopen project files as `*.altpub.json`.
- Print the rendered document view.

## Run

```bash
npm install
npm start
```
