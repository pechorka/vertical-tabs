// Ensure the side panel is enabled and points to our UI
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
  } catch (e) {
    // Older Chrome versions may not support sidePanel API
    console.warn('sidePanel API not available:', e);
  }
});

// Clicking the toolbar icon opens the side panel for current tab
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || tab.id === undefined) return;
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn('Failed to open side panel:', e);
  }
});

// Keyboard shortcuts to focus the side panel
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'focus-tab-panel-alt' || command === 'focus-tab-panel-ctrl') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id !== undefined) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (e) {
      console.warn('Failed to open side panel:', e);
    }
  }
});

