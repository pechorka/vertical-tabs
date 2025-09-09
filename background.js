async function toggleOverlayOnTab(tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'toggle-ui' });
  } catch (e) {
    // If content script isn't injected yet, inject and try again
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      await chrome.tabs.sendMessage(tabId, { type: 'toggle-ui' });
    } catch (err) {
      console.warn('Failed to toggle overlay:', err);
    }
  }
}

// Toolbar icon toggles the in-page overlay
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id === undefined) return;
  await toggleOverlayOnTab(tab.id);
});

// Keyboard command Alt+T toggles overlay on active tab
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-ui') return;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.id !== undefined) {
      await toggleOverlayOnTab(active.id);
    }
  } catch (e) {
    console.warn('toggle-ui command failed:', e);
  }
});
