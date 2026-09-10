const openPubBtn = document.getElementById('openPubBtn');
const openProjectBtn = document.getElementById('openProjectBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const printBtn = document.getElementById('printBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const status = document.getElementById('status');
const treePane = document.getElementById('treePane');
const structureTree = document.getElementById('structureTree');
const elementTree = document.getElementById('elementTree');
const detailPane = document.getElementById('detailPane');
const renderStage = document.getElementById('renderStage');
const renderPane = document.getElementById('renderPane');
const diagnosticsPane = document.getElementById('diagnosticsPane');
const logPane = document.getElementById('logPane');
const diagnosticsSummary = document.getElementById('diagnosticsSummary');
const diagnosticsTableWrap = document.getElementById('diagnosticsTableWrap');
const documentWarnings = document.getElementById('documentWarnings');
const logMessages = document.getElementById('logMessages');
const splitterTreeDetail = document.getElementById('splitterTreeDetail');
const splitterDetailRender = document.getElementById('splitterDetailRender');
const splitterRenderDiagnostics = document.getElementById('splitterRenderDiagnostics');
const splitterDiagnosticsLog = document.getElementById('splitterDiagnosticsLog');

let selectedTreeElement = null;
let currentTreeRoot = null;
let currentDocument = null;
let currentSource = null;
let selectedObjectId = null;
let zoomFactor = 1;
const nodeElements = new Map();
const objectTreeElements = new Map();
const undoStack = [];
const redoStack = [];
const loadLogEntries = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(message) {
  status.textContent = message;
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
  name.textContent = node.name || '(record)';
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

function clearTreeSelection() {
  if (selectedTreeElement) {
    selectedTreeElement.classList.remove('selected');
    selectedTreeElement = null;
  }
}

function clearElementSelection() {
  for (const element of objectTreeElements.values()) {
    element.classList.remove('selected');
  }
}

function updateElementTreeSelection() {
  clearElementSelection();
  if (!selectedObjectId) return;
  const element = objectTreeElements.get(selectedObjectId);
  if (element) {
    element.classList.add('selected');
    element.scrollIntoView({ block: 'nearest' });
  }
}

function updateZoomLabel() {
  if (!zoomResetBtn) return;
  zoomResetBtn.textContent = `Zoom ${Math.round(zoomFactor * 100)}%`;
}

function renderLoadLog() {
  if (!logMessages) return;
  logMessages.innerHTML = '';
  if (!loadLogEntries.length) {
    logMessages.innerHTML = '<div class="empty">Load and processing messages will appear here.</div>';
    return;
  }

  for (const entry of loadLogEntries) {
    const row = document.createElement('div');
    row.className = `log-entry${entry.level === 'error' ? ' error' : ''}`;
    const time = new Date(entry.timestamp || Date.now()).toLocaleTimeString();
    row.innerHTML = `<span class="time">${time}</span><span>${entry.message}</span>`;
    logMessages.appendChild(row);
  }
  logMessages.scrollTop = logMessages.scrollHeight;
}

function appendLoadLog(message, level = 'info', timestamp = null) {
  loadLogEntries.push({
    timestamp: timestamp || new Date().toISOString(),
    level,
    message
  });
  while (loadLogEntries.length > 500) {
    loadLogEntries.shift();
  }
  renderLoadLog();
}

function clearLoadLog() {
  loadLogEntries.length = 0;
  renderLoadLog();
}

function renderTreeDetails(node) {
  detailPane.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'title';
  title.textContent = node.name || '(record)';
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
  if (node.summary && typeof node.summary === 'object') {
    pairs.push(['Summary', node.summary.format || 'structured data']);
  }

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

  if (selectedObjectId) {
    renderObjectEditor(selectedObjectId);
  }
}

function selectTreeNode(node, element) {
  clearTreeSelection();
  selectedTreeElement = element;
  selectedTreeElement.classList.add('selected');
  renderTreeDetails(node);
}

function renderTreeNode(node, depth = 0) {
  const details = document.createElement('details');
  details.className = 'node';
  details.open = depth < 2 || node.kind === 'storage';
  nodeElements.set(node, details);

  const summary = document.createElement('summary');
  summary.appendChild(makeLine(node));
  summary.addEventListener('click', event => {
    event.preventDefault();
    details.open = !details.open;
    selectTreeNode(node, details);
  });
  details.appendChild(summary);

  const children = getChildNodes(node);
  for (const child of children) {
    details.appendChild(renderTreeNode(child, depth + 1));
  }

  return details;
}

function findPage() {
  return currentDocument?.pages?.[0] || null;
}

function findAsset(assetId) {
  return currentDocument?.assets?.find(item => item.id === assetId) || null;
}

function findObject(objectId) {
  const page = findPage();
  if (!page || !Array.isArray(page.objects)) return null;
  return page.objects.find(item => item.id === objectId) || null;
}

function pushUndoState(previousDoc) {
  undoStack.push(clone(previousDoc));
  while (undoStack.length > 100) {
    undoStack.shift();
  }
  redoStack.length = 0;
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
  const canSave = Boolean(currentDocument);
  saveProjectBtn.disabled = !canSave;
}

function renderWarnings() {
  documentWarnings.innerHTML = '';
  const warnings = Array.isArray(currentDocument?.warnings) ? currentDocument.warnings : [];
  if (!warnings.length) {
    return;
  }
  for (const warning of warnings) {
    const line = document.createElement('div');
    line.className = 'doc-warning';
    line.textContent = `• ${warning}`;
    documentWarnings.appendChild(line);
  }
}

function renderObjectEditor(objectId) {
  const object = findObject(objectId);
  if (!object) {
    return;
  }

  let container = detailPane.querySelector('.object-editor');
  if (container) {
    container.remove();
  }

  container = document.createElement('div');
  container.className = 'object-editor';

  const heading = document.createElement('div');
  heading.className = 'title';
  heading.style.fontSize = '16px';
  heading.textContent = 'Selected object';
  container.appendChild(heading);

  const form = document.createElement('div');
  form.className = 'field-grid';

  const makeNumberField = (label, value, key) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    const cap = document.createElement('span');
    cap.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = Number.isFinite(value) ? String(value) : '0';
    input.dataset.key = key;
    wrapper.appendChild(cap);
    wrapper.appendChild(input);
    return wrapper;
  };

  const xField = makeNumberField('X', object.x, 'x');
  const yField = makeNumberField('Y', object.y, 'y');
  const wField = makeNumberField('Width', object.width, 'width');
  const hField = makeNumberField('Height', object.height, 'height');
  form.appendChild(xField);
  form.appendChild(yField);
  form.appendChild(wField);
  form.appendChild(hField);
  container.appendChild(form);

  if (object.type === 'text') {
    const label = document.createElement('label');
    label.className = 'field';
    label.style.marginTop = '10px';
    const cap = document.createElement('span');
    cap.textContent = 'Text';
    const textarea = document.createElement('textarea');
    textarea.value = object.text || '';
    textarea.dataset.key = 'text';
    label.appendChild(cap);
    label.appendChild(textarea);
    container.appendChild(label);
  }

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply object changes';
  applyBtn.style.marginTop = '12px';
  applyBtn.addEventListener('click', () => {
    const latestObject = findObject(objectId);
    if (!latestObject) return;

    const snapshot = clone(currentDocument);
    const fields = container.querySelectorAll('input[data-key], textarea[data-key]');
    for (const field of fields) {
      const key = field.dataset.key;
      if (!key) continue;
      if (field.tagName === 'TEXTAREA') {
        latestObject[key] = field.value;
        continue;
      }

      const value = Number(field.value);
      if (!Number.isFinite(value)) continue;
      latestObject[key] = value;
    }

    pushUndoState(snapshot);
    renderDocument();
    renderTreeDetails(currentTreeRoot || { name: 'Document', kind: 'document' });
  });
  container.appendChild(applyBtn);
  detailPane.appendChild(container);
}

function selectObject(objectId) {
  selectedObjectId = objectId;
  updateElementTreeSelection();
  const treeSelectedNode = selectedTreeElement && currentTreeRoot ? currentTreeRoot : { name: 'Document', kind: 'document' };
  renderTreeDetails(treeSelectedNode);
  renderDocument();
}

function renderObject(svg, object) {
  let node = null;

  if (object.type === 'image') {
    const asset = findAsset(object.assetId);
    if (!asset) return null;
    node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    node.setAttribute('href', `data:${asset.mimeType};base64,${asset.data}`);
    node.setAttribute('x', String(object.x || 0));
    node.setAttribute('y', String(object.y || 0));
    node.setAttribute('width', String(object.width || asset.width || 100));
    node.setAttribute('height', String(object.height || asset.height || 100));
    if (object.preserveAspectRatio) {
      node.setAttribute('preserveAspectRatio', object.preserveAspectRatio);
    }
  } else if (object.type === 'imageFragment') {
    const asset = findAsset(object.assetId);
    if (!asset || !object.source) return null;

    const clipId = `clip-${object.id}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', String(object.x || 0));
    clipRect.setAttribute('y', String(object.y || 0));
    clipRect.setAttribute('width', String(object.width || 1));
    clipRect.setAttribute('height', String(object.height || 1));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    node.setAttribute('href', `data:${asset.mimeType};base64,${asset.data}`);
    node.setAttribute('x', String((object.x || 0) - (object.source.x || 0)));
    node.setAttribute('y', String((object.y || 0) - (object.source.y || 0)));
    node.setAttribute('width', String(asset.width || object.width || 1));
    node.setAttribute('height', String(asset.height || object.height || 1));
    node.setAttribute('clip-path', `url(#${clipId})`);
  } else if (object.type === 'rect') {
    node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.setAttribute('x', String(object.x || 0));
    node.setAttribute('y', String(object.y || 0));
    node.setAttribute('width', String(object.width || 100));
    node.setAttribute('height', String(object.height || 100));
    node.setAttribute('fill', object.fill || '#ffffff');
    node.setAttribute('stroke', object.stroke || '#111111');
    node.setAttribute('stroke-width', String(object.strokeWidth || 1));
  } else if (object.type === 'text') {
    node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', String(object.x || 0));
    node.setAttribute('y', String(object.y || 0));
    node.setAttribute('font-size', String(object.fontSize || 20));
    node.setAttribute('font-family', object.fontFamily || 'Segoe UI, Arial, sans-serif');
    node.setAttribute('fill', object.fill || '#111111');
    node.setAttribute('text-anchor', object.textAlign === 'center' ? 'middle' : 'start');
    node.textContent = object.text || '';
  } else {
    node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.setAttribute('x', String(object.x || 0));
    node.setAttribute('y', String(object.y || 0));
    node.setAttribute('width', String(object.width || 80));
    node.setAttribute('height', String(object.height || 80));
    node.setAttribute('fill', '#ffeecc');
    node.setAttribute('stroke', '#333');
    node.setAttribute('stroke-width', '1');
  }

  node.setAttribute('opacity', String(object.opacity ?? 1));
  node.dataset.objectId = object.id;
  node.style.cursor = 'pointer';
  node.addEventListener('click', event => {
    event.stopPropagation();
    selectObject(object.id);
  });

  if (selectedObjectId && selectedObjectId === object.id) {
    const bbox = {
      x: Number(object.x || 0),
      y: Number(object.y || 0),
      width: Number(object.width || 100),
      height: Number(object.height || 100)
    };
    const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    highlight.setAttribute('x', String(bbox.x));
    highlight.setAttribute('y', String(bbox.y));
    highlight.setAttribute('width', String(bbox.width));
    highlight.setAttribute('height', String(bbox.height));
    highlight.setAttribute('fill', 'none');
    highlight.setAttribute('stroke', '#0088ff');
    highlight.setAttribute('stroke-width', String(Math.max(0.3, (object.strokeWidth || 1) * 2)));
    highlight.setAttribute('stroke-dasharray', '8 6');
    svg.appendChild(node);
    svg.appendChild(highlight);
    return node;
  }

  svg.appendChild(node);
  return node;
}

function renderDocument() {
  const page = findPage();
  if (!page) {
    renderStage.innerHTML = '<div class="empty">No page available to render.</div>';
    return;
  }

  const rawStageWidth = renderStage.clientWidth;
  const rawStageHeight = renderStage.clientHeight;
  if (rawStageWidth < 10 || rawStageHeight < 10) {
    requestAnimationFrame(() => {
      if (currentDocument) {
        renderDocument();
      }
    });
    return;
  }

  const stageWidth = Math.max(rawStageWidth, 320);
  const stageHeight = Math.max(rawStageHeight, 440);
  const fitScale = Math.min(stageWidth / page.width, stageHeight / page.height);
  const scale = Math.max(0.05, fitScale * zoomFactor);
  const displayWidth = Math.max(120, Math.floor(page.width * scale));
  const displayHeight = Math.max(120, Math.floor(page.height * scale));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', displayWidth);
  svg.setAttribute('height', displayHeight);
  svg.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
  svg.addEventListener('click', () => {
    selectedObjectId = null;
    renderTreeDetails(currentTreeRoot || { name: 'Document', kind: 'document' });
    renderDocument();
  });

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(page.width));
  background.setAttribute('height', String(page.height));
  background.setAttribute('fill', '#ffffff');
  svg.appendChild(background);

  const objects = Array.isArray(page.objects) ? page.objects : [];
  for (const object of objects) {
    renderObject(svg, object);
  }

  renderStage.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'render-shell';
  shell.appendChild(svg);
  renderStage.appendChild(shell);
}

function renderDiagnostics(diagnostics) {
  diagnosticsTableWrap.innerHTML = '';
  const list = Array.isArray(diagnostics?.unsupportedRecords) ? diagnostics.unsupportedRecords : [];
  const summary = diagnostics?.unsupportedSummary;

  if (!summary) {
    diagnosticsSummary.textContent = 'No diagnostics loaded.';
  } else {
    diagnosticsSummary.textContent = `Unsupported records: ${summary.total} total across ${summary.byRecordId.length} record types.`;
  }

  if (!list.length) {
    diagnosticsTableWrap.className = 'empty';
    diagnosticsTableWrap.textContent = 'No unsupported records were detected in the parsed Escher streams.';
    return;
  }

  diagnosticsTableWrap.className = '';
  const table = document.createElement('table');
  table.className = 'diagnostics-table';

  const header = document.createElement('thead');
  header.innerHTML = '<tr><th>Record</th><th>Offset</th><th>Length</th><th>Context</th></tr>';
  table.appendChild(header);

  const body = document.createElement('tbody');
  for (const row of list) {
    const tr = document.createElement('tr');
    const rec = `0x${row.recordId.toString(16).toUpperCase()} (${row.recordName})`;
    tr.innerHTML = `<td>${rec}</td><td>${row.offset}</td><td>${row.length || ''}</td><td>${row.context || ''}</td>`;
    body.appendChild(tr);
  }
  table.appendChild(body);
  diagnosticsTableWrap.appendChild(table);
}

function renderElementTree() {
  objectTreeElements.clear();
  elementTree.innerHTML = '';
  const page = findPage();
  const objects = Array.isArray(page?.objects) ? page.objects : [];
  if (!objects.length) {
    elementTree.innerHTML = '<div class="empty">No renderable elements were loaded.</div>';
    return;
  }

  for (const object of objects) {
    const button = document.createElement('button');
    button.className = 'element-item';
    const label = object.name || object.id || 'object';
    button.textContent = `${label} · ${object.type}`;
    button.addEventListener('click', () => {
      selectObject(object.id);
    });
    objectTreeElements.set(object.id, button);
    elementTree.appendChild(button);
  }
  updateElementTreeSelection();
}

function setPaneWidths(leftPane, rightPane, deltaX) {
  const layoutWidth = treePane.parentElement.clientWidth;
  const splitterAllowance = 24;
  const minPane = 160;

  const leftWidth = leftPane.getBoundingClientRect().width;
  const rightWidth = rightPane.getBoundingClientRect().width;
  const newLeft = Math.max(minPane, leftWidth + deltaX);
  const newRight = Math.max(minPane, rightWidth - deltaX);
  if (newLeft + newRight + splitterAllowance > layoutWidth) {
    return;
  }
  leftPane.style.width = `${newLeft}px`;
  rightPane.style.width = `${newRight}px`;
}

function wireSplitter(splitter, leftPane, rightPane) {
  if (!splitter || !leftPane || !rightPane) return;

  let dragStartX = null;
  splitter.addEventListener('pointerdown', event => {
    dragStartX = event.clientX;
    splitter.classList.add('dragging');
    splitter.setPointerCapture(event.pointerId);
  });

  splitter.addEventListener('pointermove', event => {
    if (dragStartX === null) return;
    const deltaX = event.clientX - dragStartX;
    dragStartX = event.clientX;
    setPaneWidths(leftPane, rightPane, deltaX);
    if (currentDocument) {
      renderDocument();
    }
  });

  const stopDragging = event => {
    if (dragStartX === null) return;
    dragStartX = null;
    splitter.classList.remove('dragging');
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  };

  splitter.addEventListener('pointerup', stopDragging);
  splitter.addEventListener('pointercancel', stopDragging);
}

function resetViewForNoFile(message) {
  structureTree.innerHTML = `<div class="empty">${message}</div>`;
  elementTree.innerHTML = '<div class="empty">No renderable elements were loaded.</div>';
  detailPane.innerHTML = '<div class="empty">No file loaded.</div>';
  renderStage.innerHTML = '<div class="empty">No layout available.</div>';
  diagnosticsSummary.textContent = 'No diagnostics loaded.';
  diagnosticsTableWrap.className = 'empty';
  diagnosticsTableWrap.textContent = 'No diagnostics loaded.';
  documentWarnings.innerHTML = '';
  currentTreeRoot = null;
  currentDocument = null;
  currentSource = null;
  selectedObjectId = null;
  zoomFactor = 1;
  undoStack.length = 0;
  redoStack.length = 0;
  updateZoomLabel();
  updateUndoRedoButtons();
}

function loadDocumentIntoView(sourceLabel, payload) {
  const doc = payload?.document;
  if (!doc) {
    resetViewForNoFile('No structured data was returned for this file.');
    return;
  }

  currentSource = sourceLabel;
  currentDocument = doc;
  selectedObjectId = null;
  zoomFactor = 1;
  undoStack.length = 0;
  redoStack.length = 0;
  updateZoomLabel();

  setStatus(`${payload.fileName || 'Untitled'} — ${sourceLabel}`);
  appendLoadLog(`Loaded ${payload.fileName || 'file'} from ${sourceLabel}.`);
  renderWarnings();

  if (payload.root) {
    currentTreeRoot = payload.root;
    structureTree.innerHTML = '';
    nodeElements.clear();
    const root = renderTreeNode(payload.root, 0);
    structureTree.appendChild(root);
    selectTreeNode(payload.root, root);
  } else {
    currentTreeRoot = null;
    structureTree.innerHTML = '<div class="empty">No OLE structure tree is available for this file.</div>';
    detailPane.innerHTML = '<div class="empty">Select a drawing object to edit its properties.</div>';
  }

  renderElementTree();
  renderDocument();
  renderDiagnostics(payload.diagnostics || doc.diagnostics || null);
  updateUndoRedoButtons();
}

async function openPubFile() {
  try {
    clearLoadLog();
    appendLoadLog('Open .pub requested.');
    await window.pubViewer.openPubFile();
  } catch (error) {
    appendLoadLog(`Open request failed: ${error.message || String(error)}`, 'error');
    setStatus(`Open failed: ${error.message || String(error)}`);
  }
}

async function openProjectFile() {
  try {
    appendLoadLog('Open project requested.');
    await window.pubViewer.openProjectFile();
  } catch (error) {
    appendLoadLog(`Open project failed: ${error.message || String(error)}`, 'error');
    setStatus(`Open project failed: ${error.message || String(error)}`);
  }
}

async function saveProjectFile() {
  if (!currentDocument) {
    setStatus('Nothing to save.');
    return;
  }

  try {
    const filePath = await window.pubViewer.saveProjectFile(currentDocument);
    if (filePath) {
      setStatus(`Saved project to ${filePath}`);
    }
  } catch (error) {
    setStatus(`Save failed: ${error.message || String(error)}`);
  }
}

async function printDocument() {
  try {
    await window.pubViewer.printDocument();
    setStatus('Print dialog opened.');
  } catch (error) {
    setStatus(`Print failed: ${error.message || String(error)}`);
  }
}

function undo() {
  if (!undoStack.length || !currentDocument) return;
  redoStack.push(clone(currentDocument));
  currentDocument = undoStack.pop();
  selectedObjectId = null;
  updateElementTreeSelection();
  renderWarnings();
  renderDocument();
  if (currentTreeRoot) {
    renderTreeDetails(currentTreeRoot);
  } else {
    detailPane.innerHTML = '<div class="empty">Select a drawing object to edit its properties.</div>';
  }
  updateUndoRedoButtons();
}

function redo() {
  if (!redoStack.length || !currentDocument) return;
  undoStack.push(clone(currentDocument));
  currentDocument = redoStack.pop();
  selectedObjectId = null;
  updateElementTreeSelection();
  renderWarnings();
  renderDocument();
  if (currentTreeRoot) {
    renderTreeDetails(currentTreeRoot);
  } else {
    detailPane.innerHTML = '<div class="empty">Select a drawing object to edit its properties.</div>';
  }
  updateUndoRedoButtons();
}

if (openPubBtn) openPubBtn.addEventListener('click', openPubFile);
if (openProjectBtn) openProjectBtn.addEventListener('click', openProjectFile);
if (saveProjectBtn) saveProjectBtn.addEventListener('click', saveProjectFile);
if (printBtn) printBtn.addEventListener('click', printDocument);
if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);
if (zoomInBtn) {
  zoomInBtn.addEventListener('click', () => {
    zoomFactor = Math.min(8, zoomFactor * 1.2);
    updateZoomLabel();
    renderDocument();
  });
}
if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', () => {
    zoomFactor = Math.max(0.2, zoomFactor / 1.2);
    updateZoomLabel();
    renderDocument();
  });
}
if (zoomResetBtn) {
  zoomResetBtn.addEventListener('click', () => {
    zoomFactor = 1;
    updateZoomLabel();
    renderDocument();
  });
}

window.addEventListener('resize', () => {
  if (currentDocument) {
    renderDocument();
  }
});

window.pubViewer.onPubFileLoaded(result => {
  if (!result) return;
  loadDocumentIntoView('Publisher import', result);
});

window.pubViewer.onPubFileLoadFailed(error => {
  const message = error?.message || 'Unknown load error';
  appendLoadLog(`.pub load failed: ${message}`, 'error');
  setStatus(`Open failed: ${message}`);
});

window.pubViewer.onPubLoadLog(event => {
  if (!event || !event.message) return;
  appendLoadLog(event.message, event.level || 'info', event.timestamp);
});

window.pubViewer.onProjectFileLoaded(result => {
  if (!result) return;
  loadDocumentIntoView('AltPublisher project', result);
});

window.pubViewer.onDiagnosticsVisibilityChanged(visible => {
  diagnosticsPane.classList.toggle('hidden', !visible);
  splitterRenderDiagnostics.style.display = visible ? 'block' : 'none';
  if (!visible) {
    splitterDiagnosticsLog.style.display = 'none';
  } else {
    splitterDiagnosticsLog.style.display = 'block';
  }
  if (currentDocument) {
    renderDocument();
  }
});

window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
});

window.pubViewer.onSaveRequested(saveProjectFile);

if (renderPane) {
  renderPane.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1.1 : 0.9;
    zoomFactor = Math.max(0.2, Math.min(8, zoomFactor * delta));
    updateZoomLabel();
    renderDocument();
  }, { passive: false });
}

wireSplitter(splitterTreeDetail, treePane, detailPane);
wireSplitter(splitterDetailRender, detailPane, renderPane);
wireSplitter(splitterRenderDiagnostics, renderPane, diagnosticsPane);
wireSplitter(splitterDiagnosticsLog, diagnosticsPane, logPane);
renderLoadLog();
updateZoomLabel();
updateUndoRedoButtons();
