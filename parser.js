const fs = require('fs');
const CFB = require('cfb');

const ESCHER_CONTAINER_IDS = new Set([0xF000, 0xF001, 0xF002, 0xF003, 0xF004]);

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

const CARD_SHEET_MODEL = {
  canvasWidth: 1275,
  canvasHeight: 1650,
  cards: [
    { row: 1, col: 1, x: 54, y: 36, w: 548, h: 247, lion: { x: 263, y: 90, w: 129, h: 145 } },
    { row: 1, col: 2, x: 672, y: 37, w: 548, h: 246, lion: { x: 881, y: 90, w: 130, h: 145 } },
    { row: 2, col: 1, x: 54, y: 305, w: 548, h: 247, lion: { x: 263, y: 359, w: 129, h: 145 } },
    { row: 2, col: 2, x: 672, y: 305, w: 547, h: 246, lion: { x: 880, y: 358, w: 130, h: 145 } },
    { row: 3, col: 1, x: 54, y: 571, w: 548, h: 247, lion: { x: 263, y: 624, w: 129, h: 146 } },
    { row: 3, col: 2, x: 672, y: 570, w: 547, h: 247, lion: { x: 880, y: 624, w: 130, h: 145 } },
    { row: 4, col: 1, x: 54, y: 839, w: 548, h: 247, lion: { x: 263, y: 893, w: 130, h: 145 } },
    { row: 4, col: 2, x: 672, y: 839, w: 548, h: 247, lion: { x: 881, y: 892, w: 129, h: 145 } },
    { row: 5, col: 1, x: 55, y: 1109, w: 548, h: 247, lion: { x: 263, y: 1163, w: 130, h: 145 } },
    { row: 5, col: 2, x: 672, y: 1108, w: 548, h: 247, lion: { x: 881, y: 1162, w: 130, h: 145 } },
    { row: 6, col: 1, x: 55, y: 1378, w: 548, h: 247, lion: { x: 263, y: 1431, w: 130, h: 145 } },
    { row: 6, col: 2, x: 672, y: 1377, w: 548, h: 247, lion: { x: 881, y: 1430, w: 130, h: 146 } },
  ]
};

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

function parseEscherRange(buffer, start, end) {
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

    if (payloadEnd > end) {
      nodes.push({
        kind: 'record',
        offset: pos,
        recordId: rid,
        recordName: recordName(rid),
        version,
        instance,
        length: len,
        error: 'record length exceeds container bounds'
      });
      break;
    }

    const node = {
      kind: 'record',
      offset: pos,
      recordId: rid,
      recordName: recordName(rid),
      version,
      instance,
      length: len
    };

    const payload = buffer.subarray(payloadStart, payloadEnd);
    if (ESCHER_CONTAINER_IDS.has(rid)) {
      node.children = parseEscherRange(buffer, payloadStart, payloadEnd);
    } else {
      node.payload = {
        length: payload.length,
        preview: summarizeBytes(payload, 24)
      };
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

function parseEscherStream(buffer) {
  const records = parseEscherRange(buffer, 0, buffer.length);
  annotateEscherTree(records);
  return records;
}

function decorateStreamNode(node, content) {
  const summary = {
    size: content.length
  };

  const strings = extractStrings(content, 4);
  if (strings.length) {
    summary.strings = strings.slice(0, 40);
  }

  if (node.name === 'EscherStm') {
    summary.format = 'Escher drawing tree';
    summary.records = parseEscherStream(content);
    summary.recordCount = summary.records.length;
    summary.renderModel = CARD_SHEET_MODEL;
  } else if (node.name === 'EscherDelayStm') {
    summary.format = 'deferred binary streams';
    summary.containsPng = content.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])) !== -1;
  } else if (node.name === 'CONTENTS') {
    summary.format = 'Quill story content';
  }

  node.summary = summary;
  return node;
}

function enrichTree(node, cfb) {
  if (node.kind === 'stream' && node.streamPath) {
    const entry = getEntry(cfb, node.streamPath);
    if (entry) {
      node.size = entry.entry.size || entry.content.length;
      decorateStreamNode(node, entry.content);
    }
  }

  if (node.children) {
    node.children.forEach(child => enrichTree(child, cfb));
  }

  return node;
}

async function extractStructure(filePath) {
  const cfb = readCFB(filePath);
  const tree = enrichTree(buildOleTree(cfb), cfb);

  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop(),
    kind: 'publisher-document',
    root: tree
  };
}

module.exports = {
  extractStructure
};
