Vertical Tabs (Chrome Extension)

Simple Manifest V3 extension that shows a vertical list of tabs in Chrome’s side panel. Click to activate, drag to reorder, pin/unpin, or close tabs.

Install (Load Unpacked)

- Open Chrome and go to `chrome://extensions/`.
- Enable "Developer mode" (top-right).
- Click "Load unpacked" and select this folder.
- Optionally pin the extension’s toolbar icon for quick access.

Open the Side Panel

- Click the extension’s toolbar icon to open the side panel, or
- Open the side panel UI from the Chrome side panel menu and pick "Vertical Tabs (Simple)".

Permissions

- `tabs`: read/update tabs to list, activate, pin, close, and reorder.
- `sidePanel`: open/enable the extension side panel from the action.
- `storage`: reserved for future options (not actively used yet).

Notes

- Drag-and-drop reorders within the current window only.
- If the side panel API is unavailable on an older Chrome, the action click will be a no-op. Update Chrome to the latest stable.

