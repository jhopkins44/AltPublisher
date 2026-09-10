const fs = require('fs');
const CFB = require('cfb');

const ESCHER_KNOWN_RECORD_IDS = new Set([
  0xF000, 0xF001, 0xF002, 0xF003, 0xF004, 0xF005, 0xF006, 0xF007, 0xF008,
  0xF009, 0xF00A, 0xF00B, 0xF00D, 0xF00E, 0xF00F, 0xF010, 0xF011, 0xF012,
  0xF014, 0xF018, 0xF11E, 0xF122
]);

const ESCHER_CONTAINER_IDS = new Set([0xF000, 0xF001, 0xF002, 0xF003, 0xF004, 0xF018]);

const ESCHER_NAMES = new Map([
  [0xF000, 'DggContainer'],
  [0xF001, 'BStoreContainer'],
  [0xF002, 'DgContainer'],
  [0xF003, 'SpgrContainer'],
  [0xF004, 'SpContainer'],
  [0xF005, 'Dgg'],
  [0xF006, 'BStore'],
  [0xF007, 'Dg'],
  [0xF008, 'Spgr'],
  [0xF009, 'Sp'],
  [0xF00A, 'SpDefinition'],
  [0xF00B, 'OPT'],
  [0xF00D, 'ClientTextbox'],
  [0xF00E, 'Anchor'],
  [0xF00F, 'ChildAnchor'],
  [0xF010, 'ClientAnchorOrPoints'],
  [0xF011, 'ClientData'],
  [0xF012, 'SolverRule'],
  [0xF014, 'ConnectorRule'],
  [0xF018, 'SolverContainer'],
  [0xF11E, 'SplitMenuColorContainer'],
  [0xF122, 'TertiaryOPT']
]);

function recordName(id) {
  return ESCHER_NAMES.get(id) || `0x${id.toString(16).toUpperCase()}`;
}

function signedInt32(value) {
  return value > 0x7FFFFFFF ? value - 0x100000000 : value;
}

function readCFB(filePath) {
  const data = fs.readFileSync(filePath);
  return CFB.read(data, { type: 'buffer' });
}

function getEntry(cfb, fullPath) {
  const index = cfb.FullPaths.findIndex(path => path === fullPath);
  if (index === -1) {
    return null;
  }

  const entry = cfb.FileIndex[index];
  if (!entry || !Buffer.isBuffer(entry.content)) {
    return null;
  }

  return {
    index,
    entry,
    content: entry.content
  };
}

function buildOleTree(cfb) {
  const root = {
    name: 'Root Entry',
    kind: 'storage',
    children: []
  };

  const nodeMap = new Map();
  nodeMap.set('Root Entry', root);

  const paths = cfb.FullPaths
    .map((fullPath, index) => ({ fullPath, index }))
    .filter(({ fullPath }) => fullPath !== 'Root Entry/');

  for (const { fullPath, index } of paths) {
    const entry = cfb.FileIndex[index];
    if (!entry) continue;

    const parts = fullPath.split('/').filter(Boolean);
    if (parts[0] !== 'Root Entry') continue;

    let currentPath = 'Root Entry';
    let parent = root;

    for (let i = 1; i < parts.length; i++) {
      currentPath += `/${parts[i]}`;
      let node = nodeMap.get(currentPath);

      if (!node) {
        const isLast = i === parts.length - 1;
        const isStorage = !isLast || entry.type === 1 || fullPath.endsWith('/');
        node = {
          name: parts[i],
          kind: isStorage ? 'storage' : 'stream',
          children: []
        };

        if (isLast) {
          node.path = fullPath.replace(/\/$/, '');
          node.size = typeof entry.size === 'number' ? entry.size : 0;
          node.streamName = parts[i];
          node.streamPath = fullPath.replace(/\/$/, '');
          node.fileIndex = index;
        }

        nodeMap.set(currentPath, node);
        parent.children.push(node);
      }

      parent = node;
    }
  }

  return root;
}

function extractStrings(buffer, minLength = 4) {
  const results = [];
  const ascii = buffer.toString('latin1');
  const asciiRegex = new RegExp(`[\\x20-\\x7E]{${minLength},}`, 'g');
  for (const match of ascii.matchAll(asciiRegex)) {
    results.push(match[0]);
  }

  const utf16Regex = new RegExp(`(?:[\\x20-\\x7E]\\x00){${minLength},}`, 'g');
  for (const match of buffer.toString('latin1').matchAll(utf16Regex)) {
    const raw = match[0];
    let out = '';
    for (let i = 0; i < raw.length; i += 2) {
      out += raw[i];
    }
    if (out.trim()) {
      results.push(out);
    }
  }

  return [...new Set(results)];
}

function summarizeBytes(buffer, limit = 16) {
  const slice = buffer.subarray(0, Math.min(limit, buffer.length));
  return Array.from(slice, byte => byte.toString(16).padStart(2, '0')).join(' ');
}

function parseEscherRange(buffer, start, end, diagnostics, ancestry = [], includePayloadBuffers = false) {
  const nodes = [];
  let pos = start;

  while (pos + 8 <= end) {
    let foundAt = -1;
    let opt = 0;
    let rid = 0;
    let len = 0;
    let payloadStart = 0;
    let payloadEnd = 0;

    for (let candidate = pos; candidate < Math.min(end - 8, pos + 16); candidate++) {
      const cOpt = buffer.readUInt16LE(candidate);
      const cRid = buffer.readUInt16LE(candidate + 2);
      const cLen = buffer.readUInt32LE(candidate + 4);
      const cPayloadStart = candidate + 8;
      const cPayloadEnd = cPayloadStart + cLen;

      if (!ESCHER_KNOWN_RECORD_IDS.has(cRid)) continue;
      if (cPayloadEnd > end) continue;

      foundAt = candidate;
      opt = cOpt;
      rid = cRid;
      len = cLen;
      payloadStart = cPayloadStart;
      payloadEnd = cPayloadEnd;
      break;
    }

    if (foundAt < 0) {
      break;
    }

    if (foundAt > pos) {
      diagnostics.push({
        type: 'escher-resync',
        recordId: rid,
        recordName: recordName(rid),
        offset: foundAt,
        skippedBytes: foundAt - pos,
        context: ancestry.join(' > ') || '(root EscherStm)'
      });
    }

    const version = opt & 0xF;
    const instance = opt >> 4;
    const recName = recordName(rid);
    const node = {
      kind: 'record',
      name: recName,
      offset: foundAt,
      recordId: rid,
      recordName: recName,
      version,
      instance,
      length: len
    };

    const payload = buffer.subarray(payloadStart, payloadEnd);
    if (ESCHER_CONTAINER_IDS.has(rid)) {
      node.children = parseEscherRange(
        buffer,
        payloadStart,
        payloadEnd,
        diagnostics,
        [...ancestry, recName],
        includePayloadBuffers
      );
    } else {
      node.payload = {
        length: payload.length,
        preview: summarizeBytes(payload, 24)
      };
      if (includePayloadBuffers) {
        node.payloadBuffer = payload;
      }
    }

    nodes.push(node);
    pos = payloadEnd;
  }

  return nodes;
}

function parseEscherPropertyTable(payload) {
  if (!payload || payload.length < 6) {
    return [];
  }

  const entries = [];
  for (let i = 0; i + 6 <= payload.length; i += 6) {
    entries.push({
      id: payload.readUInt16LE(i),
      value: payload.readUInt32LE(i + 2)
    });
  }
  return entries;
}

function parsePointRectangle(payload) {
  if (!payload || payload.length < 28) {
    return null;
  }

  const declaredLength = payload.readUInt16LE(0);
  if (declaredLength !== payload.length) {
    return null;
  }

  const values = {};
  for (let i = 4; i + 6 <= payload.length; i += 6) {
    const id = payload.readUInt16LE(i);
    if (id < 8193 || id > 8196) continue;
    const raw = payload.readUInt32LE(i + 2);
    values[id] = signedInt32(raw) / 65536;
  }

  if (
    typeof values[8193] !== 'number' ||
    typeof values[8194] !== 'number' ||
    typeof values[8195] !== 'number' ||
    typeof values[8196] !== 'number'
  ) {
    return null;
  }

  return {
    x1: values[8193],
    y1: values[8194],
    x2: values[8195],
    y2: values[8196]
  };
}

function flattenEscherRecords(records) {
  const out = [];
  const walk = nodes => {
    for (const node of nodes) {
      out.push(node);
      if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(records);
  return out;
}

function extractShapeObjectsFromEscher(escherRecords, diagnostics, quillStrings, imageAssetId) {
  const flat = flattenEscherRecords(escherRecords);
  const shapeNodes = flat.filter(node => node.recordId === 0xF004 && Array.isArray(node.children));
  const extracted = [];

  for (const shapeNode of shapeNodes) {
    const children = shapeNode.children || [];
    const pointRecord = children.find(node => node.recordId === 0xF010 && node.payloadBuffer);
    const rect = parsePointRectangle(pointRecord?.payloadBuffer);
    if (!rect) continue;

    const spDefinition = children.find(node => node.recordId === 0xF00A);
    const optRecord = children.find(node => node.recordId === 0xF00B);
    const tertiaryOptRecord = children.find(node => node.recordId === 0xF122);
    const hasText = children.some(node => node.recordId === 0xF00D);

    const properties = [
      ...parseEscherPropertyTable(optRecord?.payloadBuffer),
      ...parseEscherPropertyTable(tertiaryOptRecord?.payloadBuffer)
    ];
    const propIds = new Set(properties.map(item => item.id));
    const isImageShape = imageAssetId && propIds.has(262);

    extracted.push({
      recordOffset: shapeNode.offset,
      shapeInst: typeof spDefinition?.instance === 'number' ? spDefinition.instance : null,
      hasText,
      isImageShape: Boolean(isImageShape),
      rect,
      propertyIds: Array.from(propIds).sort((a, b) => a - b)
    });
  }

  if (!extracted.length) {
    return {
      page: {
        id: 'page-1',
        name: 'Page 1',
        width: 100,
        height: 100,
        objects: []
      },
      diagnosticsAdded: 0
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of extracted) {
    const x1 = Math.min(item.rect.x1, item.rect.x2);
    const x2 = Math.max(item.rect.x1, item.rect.x2);
    const y1 = Math.min(item.rect.y1, item.rect.y2);
    const y2 = Math.max(item.rect.y1, item.rect.y2);
    if (x1 < minX) minX = x1;
    if (x2 > maxX) maxX = x2;
    if (y1 < minY) minY = y1;
    if (y2 > maxY) maxY = y2;
  }

  const pageWidth = Math.max(1, maxX - minX);
  const pageHeight = Math.max(1, maxY - minY);

  const objects = [];
  for (let i = 0; i < extracted.length; i++) {
    const item = extracted[i];
    const x = Math.min(item.rect.x1, item.rect.x2) - minX;
    const y = Math.min(item.rect.y1, item.rect.y2) - minY;
    const width = Math.max(0.1, Math.abs(item.rect.x2 - item.rect.x1));
    const height = Math.max(0.1, Math.abs(item.rect.y2 - item.rect.y1));
    const baseId = `shape-${i + 1}`;

    if (item.isImageShape && imageAssetId) {
      objects.push({
        id: `${baseId}-image`,
        name: `Image shape @${item.recordOffset}`,
        type: 'image',
        assetId: imageAssetId,
        x,
        y,
        width,
        height,
        preserveAspectRatio: 'none',
        opacity: 1
      });
      continue;
    }

    if (item.hasText) {
      objects.push({
        id: `${baseId}-textbox`,
        name: `Text box @${item.recordOffset}`,
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: 'transparent',
        stroke: '#333333',
        strokeWidth: 0.08,
        opacity: 1
      });

      continue;
    }

    objects.push({
      id: `${baseId}-shape`,
      name: `Shape @${item.recordOffset}`,
      type: 'rect',
      x,
      y,
      width,
      height,
      fill: 'transparent',
      stroke: '#111111',
      strokeWidth: 0.08,
      opacity: 1
    });
  }

  diagnostics.push({
    type: 'escher-layout-derived',
    recordId: 0xF010,
    recordName: 'ClientAnchorOrPoints',
    offset: 0,
    context: '(document)',
    message: `Generated ${objects.length} render objects from Escher shape records without hard-coded geometry.`
  });

  return {
    page: {
      id: 'page-1',
      name: 'Page 1',
      width: pageWidth,
      height: pageHeight,
      objects
    },
    diagnosticsAdded: objects.length
  };
}

function findPngPayload(buffer) {
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const start = buffer.indexOf(pngSig);
  if (start < 0) {
    return null;
  }
  return buffer.subarray(start);
}

function readPngDimensions(pngPayload) {
  if (!pngPayload || pngPayload.length < 24) {
    return null;
  }
  return {
    width: pngPayload.readUInt32BE(16),
    height: pngPayload.readUInt32BE(20)
  };
}

function summarizeUnsupportedRecords(diagnostics) {
  const unsupported = diagnostics.filter(item => item.type === 'unsupported-record');
  const grouped = new Map();

  for (const item of unsupported) {
    const key = item.recordId;
    const current = grouped.get(key) || {
      recordId: item.recordId,
      recordName: item.recordName,
      count: 0
    };
    current.count += 1;
    grouped.set(key, current);
  }

  return {
    total: unsupported.length,
    byRecordId: Array.from(grouped.values()).sort((a, b) => b.count - a.count)
  };
}

function parseEscherStream(buffer, diagnostics, options = {}) {
  const records = parseEscherRange(
    buffer,
    0,
    buffer.length,
    diagnostics,
    [],
    Boolean(options.includePayloadBuffers)
  );

  for (const record of flattenEscherRecords(records)) {
    if (!ESCHER_NAMES.has(record.recordId) && !ESCHER_CONTAINER_IDS.has(record.recordId)) {
      diagnostics.push({
        type: 'unsupported-record',
        recordId: record.recordId,
        recordName: record.recordName,
        offset: record.offset,
        length: record.length,
        context: '(Escher stream)'
      });
    }
  }

  return records;
}

function buildProjectDocument(fileName, streams, diagnostics) {
  const assets = [];
  const warnings = [];
  const embeddedPng = streams.escherDelay ? findPngPayload(streams.escherDelay) : null;

  let imageAssetId = null;
  if (embeddedPng) {
    const dimensions = readPngDimensions(embeddedPng) || { width: 0, height: 0 };
    imageAssetId = 'asset-embedded-image-1';
    assets.push({
      id: imageAssetId,
      kind: 'image',
      mimeType: 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      encoding: 'base64',
      data: embeddedPng.toString('base64')
    });
  } else {
    warnings.push('No embedded PNG payload found in EscherDelayStm.');
  }

  const escherRecords = streams.escherStm
    ? parseEscherStream(streams.escherStm, diagnostics, { includePayloadBuffers: true })
    : [];

  const layout = extractShapeObjectsFromEscher(escherRecords, diagnostics, [], imageAssetId);
  const unsupported = summarizeUnsupportedRecords(diagnostics);

  warnings.push(
    `Rendered layout uses only records found in the opened .pub file (no hard-coded geometry).`
  );
  warnings.push(
    `Unsupported Escher records detected: ${unsupported.total}. Use diagnostics panel for details.`
  );

  return {
    format: 'altpub.v1',
    source: {
      type: 'pub-import',
      originalFileName: fileName
    },
    meta: {
      title: fileName,
      schemaVersion: 1
    },
    pages: [layout.page],
    assets,
    diagnostics: {
      unsupportedSummary: unsupported
    },
    warnings
  };
}

function decorateStreamNode(node, content, diagnostics) {
  const summary = {
    size: content.length
  };

  const strings = extractStrings(content, 4);
  if (strings.length) {
    summary.strings = strings.slice(0, 40);
  }

  if (node.name === 'EscherStm') {
    summary.format = 'Escher drawing tree';
    summary.records = parseEscherStream(content, diagnostics, { includePayloadBuffers: false });
    summary.recordCount = summary.records.length;
  } else if (node.name === 'EscherDelayStm') {
    summary.format = 'deferred binary streams';
    summary.containsPng = content.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])) !== -1;
  } else if (node.name === 'CONTENTS') {
    summary.format = 'Quill story content';
  }

  node.summary = summary;
  return node;
}

function enrichTree(node, cfb, diagnostics) {
  if (node.kind === 'stream' && node.streamPath) {
    const entry = getEntry(cfb, node.streamPath);
    if (entry) {
      node.size = entry.entry.size || entry.content.length;
      decorateStreamNode(node, entry.content, diagnostics);
    }
  }

  if (node.children) {
    node.children.forEach(child => enrichTree(child, cfb, diagnostics));
  }

  return node;
}

async function extractStructure(filePath) {
  const cfb = readCFB(filePath);
  const diagnostics = [];
  const tree = enrichTree(buildOleTree(cfb), cfb, diagnostics);
  const fileName = filePath.split(/[\\/]/).pop();

  const escherDelay = getEntry(cfb, 'Root Entry/Escher/EscherDelayStm')?.content || null;
  const escherStm = getEntry(cfb, 'Root Entry/Escher/EscherStm')?.content || null;
  const quillContents = getEntry(cfb, 'Root Entry/Quill/QuillSub/CONTENTS')?.content || null;
  const document = buildProjectDocument(
    fileName,
    { escherDelay, escherStm, quillContents },
    diagnostics
  );
  const unsupportedSummary = summarizeUnsupportedRecords(diagnostics);

  return {
    filePath,
    fileName,
    kind: 'publisher-document',
    root: tree,
    document,
    diagnostics: {
      unsupportedRecords: diagnostics.filter(item => item.type === 'unsupported-record'),
      unsupportedSummary
    }
  };
}

module.exports = {
  extractStructure
};
