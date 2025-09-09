const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');
const newTabBtn = document.getElementById('new-tab');

let allTabs = [];
let currentWindowId = null;
let collapsedGroups = {}; // { [groupKey]: boolean }

async function loadTabs() {
  const win = await chrome.windows.getCurrent();
  currentWindowId = win.id;
  allTabs = await chrome.tabs.query({ windowId: currentWindowId });
  await loadCollapsedState();
}

function faviconUrl(tab) {
  if (tab.favIconUrl) return tab.favIconUrl;
  try { return new URL(tab.url).origin + '/favicon.ico'; } catch { return ''; }
}

function matchesFilter(tab, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (tab.title || '').toLowerCase().includes(s) || (tab.url || '').toLowerCase().includes(s);
}

function isIp(host) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function groupKeyForTab(tab) {
  try {
    const u = new URL(tab.url);
    const proto = u.protocol.replace(':', '');
    if (proto === 'chrome' || proto === 'chrome-extension' || proto === 'edge' || proto === 'about') {
      return proto;
    }
    const host = u.hostname || '';
    if (!host) return proto || 'other';
    if (host === 'localhost' || isIp(host)) return host;
    const parts = host.split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return host;
  } catch {
    return 'other';
  }
}

function groupTitle(key) {
  // For protocol groups like 'chrome', show 'chrome://'
  if (key === 'chrome' || key === 'chrome-extension' || key === 'edge' || key === 'about') {
    return key + '://';
  }
  return key;
}

async function loadCollapsedState() {
  try {
    const key = `vt_collapsed_${currentWindowId}`;
    const data = await chrome.storage.local.get(key);
    collapsedGroups = data[key] || {};
  } catch {
    collapsedGroups = {};
  }
}

async function saveCollapsedState() {
  try {
    const key = `vt_collapsed_${currentWindowId}`;
    await chrome.storage.local.set({ [key]: collapsedGroups });
  } catch {}
}

function render() {
  const q = filterEl.value.trim();
  const frag = document.createDocumentFragment();

  // Group tabs by domain key while preserving order by tab.index
  const byIndex = [...allTabs].sort((a, b) => a.index - b.index);
  const groups = new Map(); // key -> { title, tabs: [], firstIndex }

  for (const tab of byIndex) {
    if (!matchesFilter(tab, q)) continue;
    const key = groupKeyForTab(tab);
    const title = groupTitle(key);
    if (!groups.has(key)) {
      groups.set(key, { title, tabs: [], firstIndex: tab.index });
    }
    const g = groups.get(key);
    g.tabs.push(tab);
  }

  // Sort groups by the first tab index to follow window order
  const orderedGroups = [...groups.entries()].sort((a, b) => a[1].firstIndex - b[1].firstIndex);

  for (const [key, g] of orderedGroups) {
    // Group container
    const groupEl = document.createElement('section');
    groupEl.className = 'group';

    // Header with collapse toggle
    const header = document.createElement('div');
    header.className = 'group-header';

    const caret = document.createElement('span');
    const isCollapsed = !!collapsedGroups[key];
    caret.className = 'group-caret';
    caret.textContent = isCollapsed ? '▸' : '▾';
    header.appendChild(caret);

    const htitle = document.createElement('div');
    htitle.className = 'group-title';
    htitle.textContent = g.title;
    header.appendChild(htitle);

    const count = document.createElement('div');
    count.className = 'group-count';
    count.textContent = String(g.tabs.length);
    header.appendChild(count);

    header.addEventListener('click', async () => {
      collapsedGroups[key] = !collapsedGroups[key];
      await saveCollapsedState();
      render();
    });

    groupEl.appendChild(header);

    const body = document.createElement('div');
    body.className = `group-body${isCollapsed ? ' collapsed' : ''}`;

    for (const tab of g.tabs) {
      const item = document.createElement('div');
      item.className = `item${tab.active ? ' active' : ''}${tab.pinned ? ' pinned' : ''}`;
      item.draggable = true;
      item.dataset.tabId = String(tab.id);

      const icon = document.createElement('img');
      icon.className = 'favicon';
      icon.alt = '';
      icon.referrerPolicy = 'no-referrer';
      icon.src = faviconUrl(tab);
      item.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = tab.title || '(untitled)';
      item.appendChild(title);

      const ctrls = document.createElement('div');
      ctrls.className = 'controls';

      const pin = document.createElement('button');
      pin.className = 'btn';
      pin.textContent = tab.pinned ? 'Unpin' : 'Pin';
      pin.title = tab.pinned ? 'Unpin tab' : 'Pin tab';
      pin.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
        await refresh();
      });

      const close = document.createElement('button');
      close.className = 'btn danger';
      close.textContent = 'Close';
      close.title = 'Close tab';
      close.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await chrome.tabs.remove(tab.id); } catch {}
        await refresh();
      });

      ctrls.appendChild(pin);
      ctrls.appendChild(close);
      item.appendChild(ctrls);

      // Activate on click
      item.addEventListener('click', async () => {
        try {
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch {}
        await refresh();
      });

      // Drag & drop reorder
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(tab.id));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        const draggedId = Number(e.dataTransfer.getData('text/plain'));
        if (!draggedId || draggedId === tab.id) return;
        const targetIndex = tab.index;
        try { await chrome.tabs.move(draggedId, { index: targetIndex }); } catch {}
        await refresh();
      });

      body.appendChild(item);
    }

    groupEl.appendChild(body);
    frag.appendChild(groupEl);
  }

  listEl.replaceChildren(frag);
}

async function refresh() {
  await loadTabs();
  render();
}

// Wire up UI events
filterEl.addEventListener('input', () => render());
newTabBtn.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ windowId: currentWindowId, active: true });
  } catch {}
  await refresh();
});

// Listen to tab events to keep in sync
chrome.tabs.onCreated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onUpdated.addListener((_, changeInfo) => {
  if (changeInfo.status || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned !== undefined) {
    refresh();
  }
});
chrome.tabs.onMoved.addListener(refresh);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onDetached.addListener(refresh);
chrome.tabs.onAttached.addListener(refresh);
chrome.windows.onFocusChanged.addListener(refresh);

// Initial render
refresh();
