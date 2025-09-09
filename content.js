// Injects/removes a centered overlay iframe that hosts the extension UI.

(() => {
  const OVERLAY_ID = 'vt-overlay-root';

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.35); }
      #${OVERLAY_ID} .vt-modal { position: relative; width: min(520px, 96vw); height: min(84vh, 900px); box-shadow: 0 16px 48px rgba(0,0,0,0.45); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
      #${OVERLAY_ID} .vt-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      #${OVERLAY_ID} .vt-close { position: absolute; top: 8px; right: 10px; z-index: 2; background: rgba(0,0,0,0.35); color: #e7e9ee; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 3px 6px; cursor: pointer; }
      #${OVERLAY_ID} .vt-close:hover { background: rgba(0,0,0,0.55); }
    `;
    return style;
  }

  function buildOverlay() {
    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.tabIndex = -1; // allow programmatic focus

    // Stop scroll/interaction beneath overlay
    root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.addEventListener('mousedown', (e) => {
      if (e.target === root) removeOverlay();
    });

    const modal = document.createElement('div');
    modal.className = 'vt-modal';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vt-close';
    closeBtn.textContent = 'Esc or Alt+T to close';
    closeBtn.addEventListener('click', () => removeOverlay());
    modal.appendChild(closeBtn);

    const iframe = document.createElement('iframe');
    iframe.className = 'vt-frame';
    iframe.src = chrome.runtime.getURL('sidepanel.html');
    modal.appendChild(iframe);

    root.appendChild(modal);
    root.appendChild(createStyles());
    return root;
  }

  function addKeyHandlers() {
    document.addEventListener('keydown', escCloseHandler, true);
  }
  function removeKeyHandlers() {
    document.removeEventListener('keydown', escCloseHandler, true);
  }
  function escCloseHandler(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      removeOverlay();
    }
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const root = buildOverlay();
    document.documentElement.appendChild(root);
    addKeyHandlers();
    // Move focus into the overlay and then into the iframe when ready
    try { root.focus(); } catch {}
    const frame = root.querySelector('iframe.vt-frame');
    if (frame) {
      const focusFrame = () => {
        try { frame.focus(); } catch {}
        try { frame.contentWindow && frame.contentWindow.focus && frame.contentWindow.focus(); } catch {}
      };
      // Try immediately and also after load to be safe
      setTimeout(focusFrame, 0);
      frame.addEventListener('load', () => setTimeout(focusFrame, 0), { once: true });
    }
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    removeKeyHandlers();
  }

  function toggleOverlay() {
    if (document.getElementById(OVERLAY_ID)) removeOverlay();
    else showOverlay();
  }

  // Listen for messages from background to toggle UI
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'toggle-ui') {
      toggleOverlay();
    } else if (msg.type === 'show-ui') {
      showOverlay();
    } else if (msg.type === 'hide-ui') {
      removeOverlay();
    }
  });
})();
