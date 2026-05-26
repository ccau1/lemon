# Electron App Architecture

## Structure

- **Main Process** (`src/main.ts`): starts the embedded server, creates the browser window, handles native IPC
- **Preload Script** (`src/preload.ts`): exposes a safe `electronAPI` to the renderer

## Behavior

- On app launch, `startServer()` from `@lemon/server` is invoked directly on port 3456 (or dynamically resolved port). `startServer()` returns the actual listening port and the main process should use that returned value instead of hardcoding a port.
- In development, the renderer loads `http://localhost:5173` (web dev server)
- In production, the renderer loads the built `packages/web/dist/index.html`

## Native APIs Exposed

- `window.electronAPI.selectFolder()` — open OS folder picker
- `window.electronAPI.notify(title, body)` — show native notification
