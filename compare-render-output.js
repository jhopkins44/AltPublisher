const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pixelmatch = require('pixelmatch').default;
const { PNG } = require('pngjs');
const { extractStructure } = require('./parser');
const { exportDocumentToPng } = require('./render-export');

async function renderAndCompare(fileName) {
  const inputPath = path.join(process.cwd(), fileName);
  const source = await extractStructure(inputPath);
  const page = source.document?.pages?.[0];

  if (!page) {
    throw new Error(`No page content was produced for ${fileName}.`);
  }

  const outputPath = path.join(process.cwd(), `rendered-${path.basename(fileName, '.pub')}.png`);
  await exportDocumentToPng(source.document, outputPath);

  const expectedPath = path.join(process.cwd(), `${path.basename(fileName, '.pub')}.png`);
  const expected = PNG.sync.read(fs.readFileSync(expectedPath));
  const renderedBuffer = await sharp(outputPath).resize(expected.width, expected.height, { fit: 'fill' }).png().toBuffer();
  const rendered = PNG.sync.read(renderedBuffer);

  const width = rendered.width;
  const height = rendered.height;
  const diff = new PNG({ width, height });
  const mismatchCount = pixelmatch(rendered.data, expected.data, diff.data, width, height, { threshold: 0.15 });

  return {
    fileName,
    outputPath,
    expectedPath,
    objectCount: page.objects.length,
    mismatchCount,
    ratio: mismatchCount / (width * height),
    width,
    height
  };
}

async function main() {
  const targets = ['ShapeTest.pub', 'LandscapeShapeTest.pub', 'LEGEND_LOOT.pub'];
  const results = [];

  for (const target of targets) {
    const result = await renderAndCompare(target);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const summary = results.map(item => (
    `- ${item.fileName}: ${item.objectCount} render objects, ${item.mismatchCount} mismatched pixels (${(item.ratio * 100).toFixed(2)}% of canvas)`
  )).join('\n');

  const markdown = `# Render comparison summary

This document captures the export step used to assess AltPublisher rendering against the sample .png references.

${summary}

## Notes

The generated PNGs are derived from the page object bounds returned by the opened .pub file and are intended to be adjusted until they visually match the reference images shipped in this repo.
`;

  const reportPath = path.join(process.cwd(), 'render-comparison-summary.md');
  fs.writeFileSync(reportPath, `${markdown}\n`, 'utf8');
  console.log(`Comparison report written to ${reportPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
