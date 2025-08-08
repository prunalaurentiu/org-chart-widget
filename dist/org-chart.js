// 1️⃣ Globals
let rawData = [];
const idToRecord = {};
const expandedMap = {};
let depthMap = {};

// 2️⃣ Helper for indirect counts
function getDescendantIds(id) {
  const direct = rawData
    .filter(r => r['Supervisor ID'] && r['Supervisor ID'].trim() === id)
    .map(r => r['Employee ID'].trim());
  return direct.reduce((all, cid) => {
    all.push(cid);
    all.push(...getDescendantIds(cid));
    return all;
  }, []);
}

// 3️⃣ Compute depthMap via BFS
function computeDepthMap() {
  depthMap = {};
  const roots = getRoots();
  const queue = roots.map(id => ({ id, depth: 0 }));
  while (queue.length) {
    const { id, depth } = queue.shift();
    depthMap[id] = depth;
    rawData
      .filter(r => r['Supervisor ID'] && r['Supervisor ID'].trim() === id)
      .map(r => r['Employee ID'].trim())
      .forEach(childId => queue.push({ id: childId, depth: depth + 1 }));
  }
}

// 4️⃣ Load & parse CSV, then initialize
function init() {
  Papa.parse(
    'https://gist.githubusercontent.com/prunalaurentiu/18b83b6277f9962fe3c2de0b1006a98a/raw/5795d077f26cbc84b49255677f54e449d60aaae9/V1%2520usable.txt',
    {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        rawData = data;
        rawData.forEach(r => {
          const id = r['Employee ID'] && r['Employee ID'].trim();
          if (id) idToRecord[id] = r;
        });
        computeDepthMap();
        drawTree();
        setupControls();
      }
    }
  );
}

// 5️⃣ Get top-level roots (duplicate Actionariat twice)
function getRoots() {
  const roots = rawData
    .filter(r => !r['Supervisor ID'] || !r['Supervisor ID'].trim())
    .map(r => r['Employee ID'].trim());
  const action = roots.filter(id => idToRecord[id].Name.trim() === 'Actionariat');
  const others = roots.filter(id => idToRecord[id].Name.trim() !== 'Actionariat');
  return action.flatMap(id => [id, id]).concat(others);
}

// 6️⃣ Render the chart
function drawTree() {
  const container = document.getElementById('chart_div');
  container.innerHTML = '';
  getRoots().forEach(rootId => container.appendChild(createNode(rootId)));
}

// 7️⃣ Create a node + its direct-children row
function createNode(id) {
  const rec = idToRecord[id];
  const depth = depthMap[id];
  const isRoot = depth === 0;

  // wrapper + depth class
  const wrapper = document.createElement('div');
  wrapper.className = 'wrapper';
  wrapper.classList.add(`depth-${depth}`);
  wrapper.dataset.id = id;

  // direct reports sorted
  const direct = rawData
    .filter(r => r['Supervisor ID'] && r['Supervisor ID'].trim() === id)
    .sort((a, b) => a.Name.trim().localeCompare(b.Name.trim()));
  const dc = direct.length;
  const ic = getDescendantIds(id).length - dc;
  const expanded = !!expandedMap[id];
  const willExpand = !expanded;

  // ── NODE BOX ────────────────────────────────
  const node = document.createElement('div');
  node.className = 'node';

  // [+]/[-] toggle
  if (dc > 0) {
    const t = document.createElement('span');
    t.className = 'toggle';
    t.textContent = expanded ? '[+]' : '[-]';
    t.onclick = () => {
      expandedMap[id] = willExpand;
      drawTree();
      if (willExpand) {
        setTimeout(() => {
          const kids = document.querySelector(
            `#chart_div .wrapper[data-id="${id}"] > .children`
          );
          if (kids) kids.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }, 0);
      }
    };
    node.appendChild(t);
  } else {
    const spacer = document.createElement('span');
    spacer.style.cssText = 'display:inline-block;width:20px;';
    node.appendChild(spacer);
  }

  // left avatar
  if (rec['Image URL left'] && rec['Image URL left'].trim()) {
    const imgL = document.createElement('img');
    imgL.className = 'avatar-left';
    imgL.src = rec['Image URL left'].trim();
    node.appendChild(imgL);
  }

  // info block
  const info = document.createElement('div');
  info.className = 'info';
  const nameEl = document.createElement('div');
  nameEl.innerHTML = `<strong>${rec.Name.trim()}</strong>`;
  const roleEl = document.createElement('div');
  roleEl.innerHTML = `<em style="font-size:0.85em;">${rec.Role.trim()}</em>`;
  const dEl = document.createElement('div');
  dEl.className = 'report-count';
  dEl.textContent = `${dc} direct report${dc !== 1 ? 's' : ''}`;
  const iEl = document.createElement('div');
  iEl.className = 'report-count';
  iEl.textContent = `${ic} indirect report${ic !== 1 ? 's' : ''}`;
  info.append(nameEl, roleEl, dEl, iEl);
  node.appendChild(info);

  // right avatar (root only)
  if (isRoot && rec['Image URL right'] && rec['Image URL right'].trim()) {
    const imgR = document.createElement('img');
    imgR.className = 'avatar-right';
    imgR.src = rec['Image URL right'].trim();
    node.appendChild(imgR);
  }

  wrapper.appendChild(node);

  // ── children row ────────────────────────────
  if (dc > 0) {
    const ch = document.createElement('div');
    ch.className = 'children';
    ch.style.display = willExpand ? 'flex' : 'none';
    direct.forEach(r => ch.appendChild(createNode(r['Employee ID'].trim())));
    wrapper.appendChild(ch);
  }

  return wrapper;
}

// 8️⃣ Expand/Collapse per layer filter
function applyLayerAction(expand) {
  const filter = document.getElementById('layer_filter').value;
  if (filter === 'all') {
    rawData.forEach(r => {
      const id = r['Employee ID'] && r['Employee ID'].trim();
      if (id && rawData.some(x => x['Supervisor ID'] && x['Supervisor ID'].trim() === id)) {
        expandedMap[id] = expand;
      }
    });
  } else {
    const layer = parseInt(filter, 10);
    Object.entries(depthMap).forEach(([id, d]) => {
      if (
        d === layer &&
        rawData.some(r => r['Supervisor ID'] && r['Supervisor ID'].trim() === id)
      ) {
        expandedMap[id] = expand;
      }
    });
  }
  drawTree();
}

// 9️⃣ Controls wiring
function setupControls() {
  document.getElementById('expand_btn').onclick = () => applyLayerAction(true);
  document.getElementById('collapse_btn').onclick = () => applyLayerAction(false);
}

// 🔟 Kick everything off
document.addEventListener('DOMContentLoaded', init);
