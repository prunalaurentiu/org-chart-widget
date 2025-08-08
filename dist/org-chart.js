document.addEventListener('DOMContentLoaded', () => {
  let rawData = [], idToRecord = {}, expandedMap = {}, depthMap = {}, ceoColorMap = {};

  // 1) Load & parse CSV via jsDelivr CDN from your GitHub repo
  const csvUrl = 'https://cdn.jsdelivr.net/gh/prunalaurentiu/org-chart-widget@main/org-chart-dept.csv';
  Papa.parse(csvUrl, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: ({ data }) => {
      rawData = data;
      rawData.forEach(r => {
        const id = r['Employee ID']?.trim();
        if (id) idToRecord[id] = r;
      });
      computeDepthMap();
      buildCeoColorMap();

      // auto-expand depth 0 & 1 (Actionariat & CEO)
      Object.entries(depthMap).forEach(([id,d]) => {
        if ((d === 0 || d === 1) &&
            rawData.some(r => r['Supervisor ID']?.trim() === id)) {
          expandedMap[id] = true;
        }
      });

      drawTree();
      setupControls();
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────
  function getDescendantIds(id) {
    const direct = rawData
      .filter(r => r['Supervisor ID']?.trim() === id)
      .map(r => r['Employee ID'].trim());
    return direct.reduce((all, cid) => {
      all.push(cid, ...getDescendantIds(cid));
      return all;
    }, []);
  }

  function computeDepthMap() {
    depthMap = {};
    const roots = rawData
      .filter(r => !r['Supervisor ID']?.trim())
      .map(r => r['Employee ID'].trim());
    const queue = roots.map(id => ({ id, depth: 0 }));
    while (queue.length) {
      const { id, depth } = queue.shift();
      depthMap[id] = depth;
      rawData
        .filter(r => r['Supervisor ID']?.trim() === id)
        .forEach(r => queue.push({ id: r['Employee ID'].trim(), depth: depth + 1 }));
    }
  }

  function buildCeoColorMap() {
    const palette = [
      '#e57373','#64b5f6','#81c784','#ffb74d','#ba68c8',
      '#4db6ac','#ffd54f','#90a4ae','#ff8a65'
    ];
    const ceo = rawData.find(r => {
      const rl = (r.Role||'').trim().toLowerCase();
      return rl === 'ceo' || rl.includes('chief executive officer');
    });
    if (!ceo) return;
    const cid = ceo['Employee ID'].trim();
    rawData
      .filter(r => r['Supervisor ID']?.trim() === cid)
      .map(r => r['Employee ID'].trim())
      .forEach((id, i) => ceoColorMap[id] = palette[i % palette.length]);
  }

  function getRoots() {
    return rawData
      .filter(r => !r['Supervisor ID']?.trim())
      .map(r => r['Employee ID'].trim())
      .sort((a, b) =>
        idToRecord[a].Name.trim().localeCompare(idToRecord[b].Name.trim())
      );
  }

  // ── Draw & center ─────────────────────────────────────────────
  function drawTree() {
    const outer = document.getElementById('chart_outer'),
          cont  = document.getElementById('chart_div');
    cont.innerHTML = '';
    getRoots().forEach(root => cont.appendChild(createNode(root)));
    setTimeout(() => {
      const first = cont.querySelector('.wrapper');
      if (first) {
        outer.scrollLeft =
          first.offsetLeft + first.offsetWidth/2 - outer.clientWidth/2;
      }
    }, 0);
  }

  // ── Create a node ─────────────────────────────────────────────
  function createNode(id) {
    const rec   = idToRecord[id],
          depth = depthMap[id] || 0,
          isRoot= depth === 0;
    const direct   = rawData.filter(r => r['Supervisor ID']?.trim() === id),
          dc       = direct.length,
          ic       = getDescendantIds(id).length - dc,
          expanded = !!expandedMap[id],
          willEx   = !expanded;

    // branch color for depth ≥2
    let branchColor = null;
    if (depth >= 2) {
      let cur = id;
      while ((depthMap[cur] || 0) > 2) {
        cur = idToRecord[cur]['Supervisor ID'].trim();
      }
      branchColor = ceoColorMap[cur] || null;
    }

    const wrap = document.createElement('div');
    wrap.className = `wrapper depth-${depth}`;
    wrap.dataset.id = id;

    const node = document.createElement('div');
    node.className = 'node';

    // LEFT avatar if Image Path present
    const left = rec['Image Path']?.trim();
    if (left) {
      const imgL = document.createElement('img');
      imgL.className = 'avatar-left';
      imgL.src       = left;
      node.appendChild(imgL);
    }

    // INFO card
    const info = document.createElement('div');
    info.className = 'info';
    let bg = '#fff', br = 'transparent';
    if (depth === 0) {
      bg = 'rgba(81,45,168,0.15)'; br = 'rgba(81,45,168,0.5)';
    } else if (depth === 1) {
      bg = 'rgba(198,40,40,0.15)'; br = 'rgba(198,40,40,0.5)';
    } else if (branchColor) {
      bg = hexToRgba(branchColor, 0.15); br = hexToRgba(branchColor, 0.5);
    }
    info.style.backgroundColor = bg;
    info.style.border = `4px solid ${br}`;
    info.innerHTML = `
      <div><strong>${rec.Name.trim()}</strong></div>
      <div><em>${rec.Role.trim()}</em></div>
      <div class="report-count">${dc} direct report${dc!==1?'s':''}</div>
      <div class="report-count">${ic} indirect report${ic!==1?'s':''}</div>
    `;
    node.appendChild(info);

    // TOGGLE
    if (dc > 0) {
      const t = document.createElement('span');
      t.className = 'toggle';
      t.textContent = expanded ? '–' : '+';
      t.onclick = () => {
        expandedMap[id] = willEx;
        drawTree();
        setTimeout(() => {
          const w = document.querySelector(
            `#chart_div .wrapper[data-id="${id}"]`
          );
          if (w) w.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }, 0);
      };
      node.appendChild(t);
    }

    // RIGHT avatar for Actionariat only
    if (isRoot) {
      const right = rec['Image Path Right']?.trim();
      if (right) {
        const imgR = document.createElement('img');
        imgR.className = 'avatar-right';
        imgR.src       = right;
        node.appendChild(imgR);
      }
    }

    wrap.appendChild(node);

    // CHILDREN
    if (dc > 0) {
      const ch = document.createElement('div');
      ch.className = 'children';
      ch.style.display = expanded ? 'flex' : 'none';
      direct.sort((a,b) => a.Name.trim().localeCompare(b.Name.trim()))
            .forEach(r => ch.appendChild(createNode(r['Employee ID'].trim())));
      wrap.appendChild(ch);
    }

    return wrap;
  }

  // ── Controls ─────────────────────────────────────────────────
  function applyLayerAction(expand) {
    const f = document.getElementById('layer_filter').value;
    rawData.forEach(r => {
      const i = r['Employee ID']?.trim();
      if (!i) return;
      const hasKids = rawData.some(x => x['Supervisor ID']?.trim() === i);
      if (f === 'all' || (hasKids && depthMap[i] === +f)) {
        expandedMap[i] = expand;
      }
    });
    drawTree();
  }
  function setupControls() {
    document.getElementById('expand_btn').onclick   = () => applyLayerAction(true);
    document.getElementById('collapse_btn').onclick = () => applyLayerAction(false);
  }

  // Utility: hex → rgba
  function hexToRgba(hex, a) {
    const [r,g,b] = hex.replace('#','').match(/.{2}/g).map(x => parseInt(x,16));
    return `rgba(${r},${g},${b},${a})`;
  }
});
