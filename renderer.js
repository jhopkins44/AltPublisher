const openPubBtn = document.getElementById('openPubBtn');
const openProjectBtn = document.getElementById('openProjectBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const printBtn = document.getElementById('printBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const status = document.getElementById('status');
const treePane = document.getElementById('treePane');
const detailPane = document.getElementById('detailPane');
const renderStage = document.getElementById('renderStage');
const diagnosticsPane = document.getElementById('diagnosticsPane');
const diagnosticsSummary = document.getElementById('diagnosticsSummary');
const diagnosticsTableWrap = document.getElementById('diagnosticsTableWrap');
const documentWarnings = document.getElementById('documentWarnings');

let selectedTreeElement = null;
let currentTreeRoot = null;
let currentDocument = null;
let currentSource = null;
let selectedObjectId = null;
const nodeElements = new Map();
const undoStack = [];
const redoStack = [];

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
    highlight.setAttribute('stroke-width', '4');
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

  const stageWidth = Math.max(renderStage.clientWidth, 320);
  const stageHeight = Math.max(renderStage.clientHeight, 440);
  const scale = Math.min(stageWidth / page.width, stageHeight / page.height);
  const displayWidth = Math.max(320, Math.floor(page.width * scale));
  const displayHeight = Math.max(440, Math.floor(page.height * scale));

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

function resetViewForNoFile(message) {
  treePane.innerHTML = `<div class="empty">${message}</div>`;
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
  undoStack.length = 0;
  redoStack.length = 0;
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
  undoStack.length = 0;
  redoStack.length = 0;

  setStatus(`${payload.fileName || 'Untitled'} — ${sourceLabel}`);
  renderWarnings();

  if (payload.root) {
    currentTreeRoot = payload.root;
    treePane.innerHTML = '';
    nodeElements.clear();
    const root = renderTreeNode(payload.root, 0);
    treePane.appendChild(root);
    selectTreeNode(payload.root, root);
  } else {
    currentTreeRoot = null;
    treePane.innerHTML = '<div class="empty">No OLE structure tree is available for this file.</div>';
    detailPane.innerHTML = '<div class="empty">Select a drawing object to edit its properties.</div>';
  }

  renderDocument();
  renderDiagnostics(payload.diagnostics || doc.diagnostics || null);
  updateUndoRedoButtons();
}

async function openPubFile() {
  try {
    await window.pubViewer.openPubFile();
  } catch (error) {
    setStatus(`Open failed: ${error.message || String(error)}`);
  }
}

async function openProjectFile() {
  try {
    await window.pubViewer.openProjectFile();
  } catch (error) {
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
  renderWarnings();
  renderDocument();
  if (currentTreeRoot) {
    renderTreeDetails(currentTreeRoot);
  } else {
    detailPane.innerHTML = '<div class="empty">Select a drawing object to edit its properties.</div>';
  }
  updateUndoRedoButtons();
}

openPubBtn.addEventListener('click', openPubFile);
openProjectBtn.addEventListener('click', openProjectFile);
saveProjectBtn.addEventListener('click', saveProjectFile);
printBtn.addEventListener('click', printDocument);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

window.addEventListener('resize', () => {
  if (currentDocument) {
    renderDocument();
  }
});

window.pubViewer.onPubFileLoaded(result => {
  if (!result) return;
  loadDocumentIntoView('Publisher import', result);
});

window.pubViewer.onProjectFileLoaded(result => {
  if (!result) return;
  loadDocumentIntoView('AltPublisher project', result);
});

window.pubViewer.onDiagnosticsVisibilityChanged(visible => {
  diagnosticsPane.classList.toggle('hidden', !visible);
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

updateUndoRedoButtons();
