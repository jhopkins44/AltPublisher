# Render comparison summary

This document captures the export step used to assess AltPublisher rendering against the sample .png references.

- ShapeTest.pub: 6 render objects, 1002701 mismatched pixels (47.66% of canvas)
- LandscapeShapeTest.pub: 4 render objects, 740335 mismatched pixels (35.19% of canvas)
- LEGEND_LOOT.pub: 276 render objects, 1756665 mismatched pixels (83.50% of canvas)

## Notes

The generated PNGs are derived from the page object bounds returned by the opened .pub file and are intended to be adjusted until they visually match the reference images shipped in this repo.

