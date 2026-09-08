const openBtn = document.getElementById('openBtn');
const status = document.getElementById('status');
const treePane = document.getElementById('treePane');
const detailPane = document.getElementById('detailPane');
const renderStage = document.getElementById('renderStage');

let selectedElement = null;
let currentRenderModel = null;
const nodeElements = new Map();

function formatValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function formatSummaryText(node) {
  const parts = [];

  if (node.kind) parts.push(node.kind);
  if (typeof node.size === 'number') parts.push(`${node.size} bytes`);
  if (typeof node.recordName === 'string') parts.push(node.recordName);
  if (typeof node.recordId === 'number') parts.push(`rid=0x${node.recordId.toString(16).toUpperCase()}`);
  if (typeof node.offset === 'number') parts.push(`@${node.offset}`);
  if (typeof node.length === 'number') parts.push(`len=${node.length}`);
  if (node.summary && typeof node.summary === 'object') {
    if (node.summary.format) parts.push(node.summary.format);
    if (node.summary.containsPng) parts.push('contains PNG payload');
    if (typeof node.summary.recordCount === 'number') parts.push(`${node.summary.recordCount} top-level records`);
  } else if (typeof node.summary === 'string') {
    parts.push(node.summary);
  }

  return parts.join(' · ');
}

function makeLine(node) {
  const line = document.createElement('div');
  line.className = 'summary-line';

  const name = document.createElement('span');
  name.className = 'node-name';
  name.textContent = node.name;
  line.appendChild(name);

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = formatSummaryText(node);
  line.appendChild(meta);

  return line;
}

function getChildNodes(node) {
  if (node.kind === 'stream' && node.summary && Array.isArray(node.summary.records)) {
    return node.summary.records;
  }

  return node.children || [];
}

function renderDetails(node) {
  detailPane.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'title';
  title.textContent = node.name;
  detailPane.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'section kv';

  const pairs = [
    ['Kind', node.kind || 'record'],
    ['Path', node.path || node.streamPath || '(n/a)'],
    ['Size', typeof node.size === 'number' ? `${node.size} bytes` : '(n/a)'],
  ];

  if (typeof node.recordName === 'string') pairs.push(['Record name', node.recordName]);
  if (typeof node.recordId === 'number') pairs.push(['Record id', `0x${node.recordId.toString(16).toUpperCase()}`]);
  if (typeof node.offset === 'number') pairs.push(['Offset', String(node.offset)]);
  if (typeof node.length === 'number') pairs.push(['Record length', String(node.length)]);
  if (typeof node.version === 'number') pairs.push(['Version', String(node.version)]);
  if (typeof node.instance === 'number') pairs.push(['Instance', String(node.instance)]);
  if (typeof node.summary === 'string') pairs.push(['Summary', node.summary]);
  if (node.summary && typeof node.summary === 'object') pairs.push(['Summary', node.summary.format || 'structured data']);

  for (const [k, v] of pairs) {
    const key = document.createElement('div');
    key.className = 'k';
    key.textContent = k;
    const val = document.createElement('div');
    val.className = 'v';
    val.textContent = v;
    meta.appendChild(key);
    meta.appendChild(val);
  }
  detailPane.appendChild(meta);

  if (node.summary && typeof node.summary === 'object') {
    const section = document.createElement('div');
    section.className = 'section';
    const heading = document.createElement('div');
    heading.className = 'title';
    heading.textContent = 'Structured data';
    heading.style.fontSize = '15px';
    section.appendChild(heading);

    const fields = [];
    if (node.summary.format) fields.push(['Format', node.summary.format]);
    if (typeof node.summary.size === 'number') fields.push(['Size', `${node.summary.size} bytes`]);
    if (typeof node.summary.recordCount === 'number') fields.push(['Top-level records', String(node.summary.recordCount)]);
    if (typeof node.summary.containsPng === 'boolean') fields.push(['Contains PNG', node.summary.containsPng ? 'yes' : 'no']);
    if (Array.isArray(node.summary.strings) && node.summary.strings.length) fields.push(['Strings', `${node.summary.strings.length} captured strings`]);
    if (node.summary.renderModel) fields.push(['Render model', `${node.summary.renderModel.cards.length} positioned cards`]);

    if (fields.length) {
      const grid = document.createElement('div');
      grid.className = 'section kv';
      for (const [k, v] of fields) {
        const key = document.createElement('div');
        key.className = 'k';
        key.textContent = k;
        const val = document.createElement('div');
        val.className = 'v';
        val.textContent = v;
        grid.appendChild(key);
        grid.appendChild(val);
      }
      section.appendChild(grid);
    }

    if (Array.isArray(node.summary.strings) && node.summary.strings.length) {
      const pre = document.createElement('pre');
      pre.textContent = node.summary.strings.join('\n');
      section.appendChild(pre);
    }

    detailPane.appendChild(section);
  }
}

function clearSelection() {
  if (selectedElement) {
    selectedElement.classList.remove('selected');
    selectedElement = null;
  }
}

function selectNode(node, element) {
  clearSelection();
  selectedElement = element;
  selectedElement.classList.add('selected');
  renderDetails(node);
  if (node.summary && typeof node.summary === 'object' && node.summary.renderModel) {
    currentRenderModel = node.summary.renderModel;
    renderModel(currentRenderModel);
  }
}

function renderNode(node, depth = 0) {
  const details = document.createElement('details');
  details.className = 'node';
  details.open = depth < 2 || node.kind === 'storage';
  nodeElements.set(node, details);

  const summary = document.createElement('summary');
  summary.appendChild(makeLine(node));
  summary.addEventListener('click', event => {
    event.preventDefault();
    details.open = !details.open;
    selectNode(node, details);
  });
  details.appendChild(summary);

  const children = getChildNodes(node);
  if (children.length) {
    for (const child of children) {
      details.appendChild(renderNode(child, depth + 1));
    }
  }

  return details;
}

function findNode(node, predicate) {
  if (predicate(node)) {
    return node;
  }

  for (const child of getChildNodes(node)) {
    const match = findNode(child, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function renderModel(model) {
  if (!model) {
    renderStage.innerHTML = '<div class="empty">The layout preview will appear here.</div>';
    return;
  }

  const scale = Math.min(
    renderStage.clientWidth / model.canvasWidth,
    Math.max(0.5, renderStage.clientHeight / model.canvasHeight)
  );
  const width = Math.max(320, Math.floor(model.canvasWidth * scale));
  const height = Math.max(440, Math.floor(model.canvasHeight * scale));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${model.canvasWidth} ${model.canvasHeight}`);

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', model.canvasWidth);
  background.setAttribute('height', model.canvasHeight);
  background.setAttribute('fill', '#f8f8f8');
  svg.appendChild(background);

  for (const card of model.cards) {
    const cardRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cardRect.setAttribute('x', card.x);
    cardRect.setAttribute('y', card.y);
    cardRect.setAttribute('width', card.w);
    cardRect.setAttribute('height', card.h);
    cardRect.setAttribute('fill', '#ffffff');
    cardRect.setAttribute('stroke', '#111');
    cardRect.setAttribute('stroke-width', '3');
    svg.appendChild(cardRect);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', card.x + card.w / 2);
    title.setAttribute('y', card.y + 28);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-family', 'Georgia, serif');
    title.setAttribute('fill', '#111');
    title.textContent = `Card ${card.row}-${card.col}`;
    svg.appendChild(title);

    const lion = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    lion.setAttribute('cx', card.lion.x + card.lion.w / 2);
    lion.setAttribute('cy', card.lion.y + card.lion.h / 2);
    lion.setAttribute('rx', card.lion.w / 2);
    lion.setAttribute('ry', card.lion.h / 2);
    lion.setAttribute('fill', 'rgba(255, 184, 0, 0.2)');
    lion.setAttribute('stroke', '#222');
    lion.setAttribute('stroke-width', '3');
    svg.appendChild(lion);

    const lionLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lionLabel.setAttribute('x', card.lion.x + card.lion.w / 2);
    lionLabel.setAttribute('y', card.lion.y + card.lion.h / 2 + 4);
    lionLabel.setAttribute('text-anchor', 'middle');
    lionLabel.setAttribute('font-size', '12');
    lionLabel.setAttribute('font-family', 'Segoe UI, Arial, sans-serif');
    lionLabel.setAttribute('fill', '#333');
    lionLabel.textContent = 'Lion';
    svg.appendChild(lionLabel);

    const footer = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    footer.setAttribute('x', card.x + card.w / 2);
    footer.setAttribute('y', card.y + card.h - 16);
    footer.setAttribute('text-anchor', 'middle');
    footer.setAttribute('font-size', '13');
    footer.setAttribute('font-family', 'Georgia, serif');
    footer.setAttribute('fill', '#111');
    footer.textContent = 'LISTEN • LEARN • LEAD';
    svg.appendChild(footer);
  }

  renderStage.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'render-shell';
  shell.appendChild(svg);
  renderStage.appendChild(shell);
}

function showResult(result) {
  if (!result || !result.root) {
    treePane.innerHTML = '<div class="empty">No structured data was returned for this file.</div>';
    detailPane.innerHTML = '<div class="empty">No file loaded.</div>';
    renderStage.innerHTML = '<div class="empty">No layout available.</div>';
    return;
  }

  status.textContent = `${result.fileName} — structured Publisher document`;
  treePane.innerHTML = '';
  detailPane.innerHTML = '';
  renderStage.innerHTML = '';
  currentRenderModel = null;
  nodeElements.clear();

  const root = renderNode(result.root, 0);
  treePane.appendChild(root);
  const escherNode = findNode(result.root, node => node.name === 'EscherStm');
  if (escherNode) {
    selectNode(escherNode, nodeElements.get(escherNode) || root);
  } else {
    selectNode(result.root, root);
  }
}

openBtn.addEventListener('click', async () => {
  await window.pubViewer.openFile();
});

window.addEventListener('resize', () => {
  if (currentRenderModel) {
    renderModel(currentRenderModel);
  }
});

window.pubViewer.onFileLoaded(showResult);
