const fs = require('fs');
const sharp = require('sharp');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getAssetById(document, assetId) {
  return Array.isArray(document?.assets) ? document.assets.find(asset => asset.id === assetId) : null;
}

function getObjectFill(object, index) {
  if (typeof object?.fill === 'string' && object.fill !== 'transparent') {
    return object.fill;
  }

  const palette = ['#7b8d3d', '#b7b7b7', '#5d7a8a', '#a76e4b', '#6f8f4b', '#8a7c74', '#7d7d7d'];
  return palette[index % palette.length];
}

function svgForPage(document) {
  const page = document?.pages?.[0];
  if (!page) {
    throw new Error('No page is available to render.');
  }

  const width = Math.max(1, Number(page.width) || 100);
  const height = Math.max(1, Number(page.height) || 100);
  const objects = Array.isArray(page.objects) ? page.objects : [];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

  for (const [index, object] of objects.entries()) {
    const x = Number(object.x || 0);
    const y = Number(object.y || 0);
    const w = Math.max(0.1, Number(object.width || 1));
    const h = Math.max(0.1, Number(object.height || 1));
    const fill = getObjectFill(object, index);
    const stroke = object.stroke || '#111111';
    const strokeWidth = Math.max(0.25, Number(object.strokeWidth || 1));

    if (object.type === 'image' || object.type === 'imageFragment') {
      const asset = getAssetById(document, object.assetId);
      if (asset && asset.data) {
        const href = `data:${asset.mimeType || 'image/png'};base64,${asset.data}`;
        const imgX = x;
        const imgY = y;
        const imgW = object.width || asset.width || w;
        const imgH = object.height || asset.height || h;
        svg += `<image href="${href}" x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="none"/>`;
      }
      continue;
    }

    if (object.type === 'text') {
      const text = escapeXml(object.text || '');
      svg += `<text x="${x}" y="${y}" font-size="${Number(object.fontSize || 18)}" fill="${object.fill || '#111111'}" font-family="Segoe UI, Arial, sans-serif">${text}</text>`;
      continue;
    }

    if (Math.abs(w - h) < Math.min(w, h) * 0.35) {
      svg += `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${Math.max(0.1, w / 2)}" ry="${Math.max(0.1, h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    } else {
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="${Math.min(8, Math.max(1, Math.min(w, h) * 0.15))}"/>`;
    }
  }

  svg += '</svg>';
  return svg;
}

async function exportDocumentToPng(document, outputPath) {
  if (!document) {
    throw new Error('No document was supplied for PNG export.');
  }

  const svg = svgForPage(document);
  const out = outputPath || `${Date.now()}-output.png`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}

module.exports = {
  svgForPage,
  exportDocumentToPng
};
