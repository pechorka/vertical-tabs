const listEl = document.getElementById('list');
const filterEl = document.getElementById('filter');
const newTabBtn = document.getElementById('new-tab');

let allTabs = [];
let currentWindowId = null;

async function loadTabs() {
  const win = await chrome.windows.getCurrent();
  currentWindowId = win.id;
  allTabs = await chrome.tabs.query({ windowId: currentWindowId });
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

function render() {
  const q = filterEl.value.trim();
  const frag = document.createDocumentFragment();
  const byIndex = [...allTabs].sort((a, b) => a.index - b.index);
  byIndex.forEach(tab => {
    if (!matchesFilter(tab, q)) return;

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

    frag.appendChild(item);
  });

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
