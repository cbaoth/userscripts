# Developer Setup

## Live Editing in VSCode with Violentmonkey

Violentmonkey supports tracking local files and auto-reloading them on save. This lets you edit scripts in VSCode and test changes in the browser immediately, without any manual copy-paste.

> **Note:** No VSCode debugger integration — use browser DevTools (F12) for debugging.

### Setup (one-time per script)

**Option A — Drag & drop (Chrome 133+ / Chromium-based browsers)**

1. Open the Violentmonkey management page (click the VM icon → gear icon, or navigate to the extension's dashboard).
2. In VSCode's Explorer panel, drag the `.user.js` file and drop it onto the Violentmonkey management page.
3. A dialog will appear asking to install the script. Click **"Track external edits"** (not the plain install button).
4. Confirm the install.

Chrome 133+ uses `FileSystemObserver` for near-instant detection of file saves. Earlier Chromium versions poll periodically.

**Option B — Local HTTP server (all browsers)**

1. Install `http-server` globally if you don't have it:
   ```sh
   npm install -g http-server
   ```
2. Start it in the repo root (the `-c5` flag sets a 5-second cache max-age, minimizing stale-script issues):
   ```sh
   http-server -c5 .
   ```
3. Navigate to `http://localhost:8080/<script-name>.user.js` in your browser.
4. Violentmonkey will prompt to install. Click **"Track external edits"**.

### Editing workflow

- Edit the script in VSCode and save (`Ctrl+S`).
- Violentmonkey detects the change and updates the installed version automatically.
- Reload the target page in the browser to run the updated script.
- Prettier auto-formats on save if `esbenp.prettier-vscode` is installed (see `.vscode/extensions.json`).

### Caveats

- **Switching git branches**: Click "Stop tracking" in Violentmonkey before switching branches to avoid the wrong file version being tracked. Re-enable after switching.
- **Firefox**: File tracking via drag-and-drop requires keeping the file's browser tab open, or enabling file URL access (security risk). The local server approach (Option B) is preferred for Firefox.
- **Chromium without Chrome**: Vivaldi, Edge, Brave, and other Chromium-based browsers support Violentmonkey despite it being removed from the Chrome Web Store (MV3 conflict). The drag-and-drop workflow works the same way.

## Linting

Run ESLint across all scripts:

```sh
npm install       # first time only
npm run lint      # check for errors
npm run lint:fix  # auto-fix where possible
```

ESLint auto-fix also runs on save in VSCode when `dbaeumer.vscode-eslint` is installed (the global setting `source.fixAll: always` applies to JS files).

## Build Toolchain (future consideration)

For scripts that grow complex enough to benefit from TypeScript, CSS modules, or a component framework, Violentmonkey's official [`@violentmonkey/userscript` generator](https://github.com/violentmonkey/generator-userscript) provides a Rollup+Babel+PostCSS setup. See [violentmonkey.github.io/guide/using-modern-syntax](https://violentmonkey.github.io/guide/using-modern-syntax/) for details. Not needed for current scripts.
