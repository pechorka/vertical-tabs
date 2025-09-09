const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');
const newTabEl = document.getElementById('newtab');
const resultsEl = document.getElementById('results');

let allTabs = [];
let currentWindowId = null;
let collapsedGroups = {}; // { [groupKey]: boolean }
// Inline edit state: { [tabId]: string } if present -> editing with current value
const editState = {};
let pendingEditFocusId = null;
let historyResults = [];
let openMenuTabId = null;

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
      const isEditing = editState[tab.id] !== undefined;
      const isMenuOpen = openMenuTabId === tab.id;
      item.className = `item${tab.active ? ' active' : ''}${tab.pinned ? ' pinned' : ''}${isEditing ? ' editing' : ''}${isMenuOpen ? ' menu-open' : ''}`;
      item.draggable = true;
      item.dataset.tabId = String(tab.id);

      const icon = document.createElement('img');
      icon.className = 'favicon';
      icon.alt = '';
      icon.referrerPolicy = 'no-referrer';
      icon.src = faviconUrl(tab);
      item.appendChild(icon);

      if (isEditing) {
        const ta = document.createElement('textarea');
        ta.className = 'edit-input';
        ta.rows = 3;
        ta.value = editState[tab.id] ?? tab.url ?? '';
        ta.setAttribute('data-edit-for', String(tab.id));
        ta.addEventListener('click', (e) => e.stopPropagation());
        ta.addEventListener('input', (e) => {
          editState[tab.id] = ta.value;
        });
        ta.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            await submitEdit(tab);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            delete editState[tab.id];
            render();
          }
        });
        item.appendChild(ta);
      } else {
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = tab.title || '(untitled)';
        item.appendChild(title);
      }

      const ctrls = document.createElement('div');
      ctrls.className = 'controls';

      // Menu trigger
      const menuBtn = document.createElement('button');
      menuBtn.className = 'menu-btn';
      menuBtn.title = 'More actions';
      menuBtn.textContent = '⋯';
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenuTabId = openMenuTabId === tab.id ? null : tab.id;
        render();
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
      
      ctrls.appendChild(menuBtn);
      ctrls.appendChild(close);
      item.appendChild(ctrls);

      // Dropdown menu panel
      const panel = document.createElement('div');
      panel.className = 'menu-panel';
      panel.addEventListener('click', (e) => e.stopPropagation());

      const miCopy = document.createElement('button');
      miCopy.className = 'menu-item';
      miCopy.textContent = 'Copy URL';
      miCopy.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = tab.url || '';
        try {
          await navigator.clipboard.writeText(url);
        } catch (_) {
          try {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            ta.remove();
          } catch {}
        }
        openMenuTabId = null;
        render();
      });

      const miEdit = document.createElement('button');
      miEdit.className = 'menu-item';
      miEdit.textContent = 'Edit URL';
      miEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenuTabId = null;
        editState[tab.id] = tab.url || '';
        pendingEditFocusId = tab.id;
        render();
      });

      panel.appendChild(miCopy);
      panel.appendChild(miEdit);
      item.appendChild(panel);

      // Activate on click
      item.addEventListener('click', async () => {
        if (editState[tab.id] !== undefined) return; // ignore clicks while editing
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

  // Focus newly created edit textarea if requested
  if (pendingEditFocusId != null) {
    const el = document.querySelector(`.edit-input[data-edit-for="${pendingEditFocusId}"]`);
    if (el) {
      el.focus();
      try { el.select(); } catch {}
    }
    pendingEditFocusId = null;
  }
}

async function refresh() {
  await loadTabs();
  render();
}

function renderHistoryResults() {
  const frag = document.createDocumentFragment();
  for (const item of historyResults) {
    const el = document.createElement('div');
    el.className = 'result-item';

    const title = document.createElement('div');
    title.className = 'res-title';
    title.textContent = item.title || '(untitled)';
    el.appendChild(title);

    const url = document.createElement('div');
    url.className = 'res-url';
    url.textContent = item.url || '';
    el.appendChild(url);

    el.addEventListener('click', async () => {
      if (!item.url) return;
      await openInNewTab(item.url);
    });

    frag.appendChild(el);
  }
  resultsEl.replaceChildren(frag);
}

async function updateHistoryResults() {
  const q = newTabEl.value.trim();
  if (!q) {
    historyResults = [];
    renderHistoryResults();
    return;
  }
  try {
    // Search across all time, limit to reasonable amount
    const raw = await chrome.history.search({ text: q, maxResults: 50, startTime: 0 });
    const s = q.toLowerCase();
    // Only match by URL, but render title first
    historyResults = raw
      .filter(it => (it.url || '').toLowerCase().includes(s))
      .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
  } catch (e) {
    historyResults = [];
  }
  renderHistoryResults();
}

async function openInNewTab(url) {
  try {
    await chrome.tabs.create({ windowId: currentWindowId, url, active: true });
  } catch {}
  // Clear input and results
  newTabEl.value = '';
  historyResults = [];
  renderHistoryResults();
  await refresh();
}

async function openDuckDuckGo(query) {
  const q = query.trim();
  const url = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
  await openInNewTab(url);
}

// Wire up UI events
filterEl.addEventListener('input', () => render());
// Also handle native clear (x) on search inputs
filterEl.addEventListener('search', () => render());
newTabEl.addEventListener('input', async () => {
  await updateHistoryResults();
});
newTabEl.addEventListener('search', async () => {
  await updateHistoryResults();
});

newTabEl.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = newTabEl.value.trim();
    const ctrl = e.ctrlKey || e.metaKey; // allow Cmd+Enter on mac
    if (ctrl) {
      await openDuckDuckGo(q);
      return;
    }
    // If there are matches, open the first one; otherwise DDG
    if (historyResults.length > 0) {
      await openInNewTab(historyResults[0].url);
    } else {
      await openDuckDuckGo(q);
    }
  }
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

async function submitEdit(tab) {
  const val = (editState[tab.id] ?? '').trim();
  delete editState[tab.id];
  if (!val) { render(); return; }
  let target = val;
  try {
    // Will throw if invalid
    // eslint-disable-next-line no-new
    new URL(target);
  } catch {
    // Try prefixing http:// if missing scheme
    try {
      target = 'http://' + target;
      // eslint-disable-next-line no-new
      new URL(target);
    } catch {
      // If still invalid, just re-render and bail
      render();
      return;
    }
  }
  try {
    await chrome.tabs.update(tab.id, { url: target, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
  await refresh();
}

// Close menus on outside click or ESC
document.addEventListener('click', () => {
  if (openMenuTabId != null) {
    openMenuTabId = null;
    render();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openMenuTabId != null) {
    openMenuTabId = null;
    render();
  }
});
