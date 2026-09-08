const fs = require('fs');
const CFB = require('cfb');

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
  [0xF00A, 'OPT'],
  [0xF00B, 'Anchor'],
  [0xF00D, 'Textbox'],
  [0xF00E, 'ClientTextbox'],
  [0xF00F, 'Column'],
  [0xF010, 'Arc'],
  [0xF011, 'ClientAnchor'],
  [0xF018, 'SolverContainer'],
  [0xF122, 'ShapeProps'],
]);

function recordName(id) {
  return ESCHER_NAMES.get(id) || `0x${id.toString(16).toUpperCase()}`;
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

function parseEscherRange(buffer, start, end, diagnostics, ancestry = []) {
  const nodes = [];
  let pos = start;

  while (pos + 8 <= end) {
    const opt = buffer.readUInt16LE(pos);
    const rid = buffer.readUInt16LE(pos + 2);
    const len = buffer.readUInt32LE(pos + 4);
    const version = opt & 0xF;
    const instance = opt >> 4;
    const payloadStart = pos + 8;
    const payloadEnd = payloadStart + len;
    const recName = recordName(rid);

    if (payloadEnd > end) {
      nodes.push({
        kind: 'record',
        name: recName,
        offset: pos,
        recordId: rid,
        recordName: recName,
        version,
        instance,
        length: len,
        error: 'record length exceeds container bounds'
      });

      diagnostics.push({
        type: 'parse-error',
        recordId: rid,
        recordName: recName,
        offset: pos,
        context: ancestry.join(' > '),
        message: 'Record length exceeds container bounds'
      });
      break;
    }

    const node = {
      kind: 'record',
      name: recName,
      offset: pos,
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
        [...ancestry, recName]
      );
    } else {
      node.payload = {
        length: payload.length,
        preview: summarizeBytes(payload, 24)
      };

      if (!ESCHER_NAMES.has(rid)) {
        diagnostics.push({
          type: 'unsupported-record',
          recordId: rid,
          recordName: recName,
          offset: pos,
          length: len,
          context: ancestry.join(' > ') || '(root EscherStm)'
        });
      }

      if (rid === 0xF009 || rid === 0xF011 || rid === 0xF00B || rid === 0xF122) {
        node.payloadWords16 = [];
        for (let i = 0; i + 2 <= Math.min(payload.length, 24); i += 2) {
          node.payloadWords16.push(payload.readUInt16LE(i));
        }
      }
      if (rid === 0xF00D || rid === 0xF010) {
        node.summary = rid === 0xF00D ? 'text object marker' : 'line/arc marker';
      }
    }

    nodes.push(node);
    pos = payloadEnd;
  }

  return nodes;
}

function annotateEscherTree(nodes) {
  for (const node of nodes) {
    if (node.kind !== 'record' || !node.children) continue;

    const childIds = new Set(node.children.map(child => child.recordId));
    if (childIds.has(0xF00D)) {
      node.summary = 'text-bearing object';
    } else if (childIds.has(0xF010)) {
      node.summary = 'line / arc object';
    } else if (childIds.has(0xF00B) || childIds.has(0xF011)) {
      node.summary = 'positioned page object';
    }

    annotateEscherTree(node.children);
  }
}

function parseEscherStream(buffer, diagnostics) {
  const records = parseEscherRange(buffer, 0, buffer.length, diagnostics);
  annotateEscherTree(records);
  return records;
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

function buildProjectDocument(fileName, streams, diagnostics) {
  const assets = [];
  const pages = [];
  const warnings = [];

  const embeddedPng = streams.escherDelay ? findPngPayload(streams.escherDelay) : null;
  if (embeddedPng) {
    const dimensions = readPngDimensions(embeddedPng) || { width: 1275, height: 1650 };
    const assetId = 'asset-preview-png';
    assets.push({
      id: assetId,
      kind: 'image',
      mimeType: 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      encoding: 'base64',
      data: embeddedPng.toString('base64')
    });

    pages.push({
      id: 'page-1',
      name: 'Page 1',
      width: dimensions.width,
      height: dimensions.height,
      objects: [
        {
          id: 'obj-preview-image',
          name: 'Imported page preview',
          type: 'image',
          assetId,
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height,
          opacity: 1
        }
      ]
    });
  } else {
    warnings.push('No embedded PNG payload found in EscherDelayStm. Falling back to blank page.');
    pages.push({
      id: 'page-1',
      name: 'Page 1',
      width: 1275,
      height: 1650,
      objects: []
    });
  }

  const unsupported = summarizeUnsupportedRecords(diagnostics);
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
    pages,
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
    summary.records = parseEscherStream(content, diagnostics);
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
  const unsupportedSummary = summarizeUnsupportedRecords(diagnostics);

  return {
    filePath,
    fileName,
    kind: 'publisher-document',
    root: tree,
    document: buildProjectDocument(
      fileName,
      { escherDelay, escherStm, quillContents },
      diagnostics
    ),
    diagnostics: {
      unsupportedRecords: diagnostics.filter(item => item.type === 'unsupported-record'),
      unsupportedSummary
    }
  };
}

module.exports = {
  extractStructure
};
