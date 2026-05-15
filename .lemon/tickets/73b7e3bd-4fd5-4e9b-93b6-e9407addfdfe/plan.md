# CLI + Server Bundled Release & Dynamic Port

## Overview
Add a GitHub Actions workflow that auto-releases a bundled CLI+Server executable on changes to `packages/cli`, `packages/server`, or `packages/shared`. Replace the hardcoded default port `3000` with `3456` and implement automatic port fallback on startup. Update all consumers (CLI, Electron, docs) to respect the new default and dynamic port resolution.

## Key Files / Changes

```
.github/
└── workflows/
    └── release-cli.yml          # NEW: tag-bump, build matrix, release publish
packages/
├── server/
│   └── src/
│       └── index.ts             # MOD: port fallback logic, return resolved port
├── cli/
│   ├── src/
│   │   ├── index.ts             # MOD: default port 3456 in serve option & ApiClient
│   │   ├── api-client.ts        # MOD: default baseUrl port 3456
│   │   └── commands/
│   │       └── serve.ts         # MOD: default port 3456
│   └── package.json             # MOD: add build/bundle script for executable
├── electron/
│   └── src/
│       └── main.ts              # MOD: use resolved port from startServer()
└── shared/                      # (no code changes, included in path trigger)
docs/
├── api/
│   ├── rest-api.md              # MOD: localhost:3000 → 3456
│   └── websocket.md             # MOD: localhost:3000 → 3456
└── architecture/
    ├── cli.md                   # MOD: port references
    └── electron-app.md          # MOD: port references
```

## Step-by-step Implementation

### 1. Dynamic Port & Server Bootstrap
- **Modify `packages/server/src/index.ts`:**
  1. Change `startServer` signature so `port` is optional or defaults to `3456` internally.
  2. Implement a `findAvailablePort(startPort: number, maxAttempts = 100)` helper that attempts `fastify.listen()` sequentially. On `EADDRINUSE`, increment and retry; on other errors, throw.
  3. Log the resolved listening port.
  4. Return the resolved port number from `startServer` so callers (Electron, CLI tests) can consume it.
- **Modify `packages/cli/src/commands/serve.ts`:**
  1. Change default from `3000` to `3456`.
  2. Pass the port into `startServer` and log the returned resolved port.
- **Modify `packages/cli/src/index.ts`:**
  1. Update the `--port` option default from `"3000"` to `"3456"`.
  2. Update `getClient()` base URL from `localhost:${LEMON_PORT || 3000}` to `localhost:${LEMON_PORT || 3456}`.
- **Modify `packages/cli/src/api-client.ts`:**
  1. Update the default base URL construction to use `3456` when no env var is provided.
- **Modify `packages/electron/src/main.ts`:**
  1. Remove the hardcoded `port: 3000` argument.
  2. Call `startServer({ dataDir })` (or with an explicit `port: 3456` if desired), capture the returned port, and store it.
  3. Use the stored port when constructing the production file server URL or any health-check polling.

### 2. Cross-Platform Build Tooling
- **Modify `packages/cli/package.json`:**
  1. Add a `bundle:exe` script (or equivalent) that:
     - Runs `pnpm build` for the workspace graph (`@lemon/shared` → `@lemon/server` → `@lemon/cli`).
     - Bundles `dist/index.js` and all `node_modules` dependencies into a single self-contained binary per target platform. Use `esbuild` (or `rollup`) to produce a single JS entry, then use `pkg` (or Node.js SEA) to compile the native executable. Include `better-sqlite3` native `.node` binaries as bundled assets so the runtime can load them.
     - Outputs to `dist/lemon-cli` (macOS / Linux) or `dist/lemon-cli.exe` (Windows).
  2. Ensure the bundled binary correctly resolves `__dirname` / `import.meta.url` for asset paths (native modules, prebuilt addons).

### 3. GitHub Actions Workflow
- **Create `.github/workflows/release-cli.yml`:**
  1. **Trigger:** `on.push.branches: [main]` with `paths:` filters for `packages/cli/**`, `packages/server/**`, `packages/shared/**`.
  2. **Version Job:**
     - Checkout with full tag history (`fetch-depth: 0`).
     - Find the latest `cli-*` tag via `git tag -l 'cli-*' --sort=-v:refname`.
     - Parse the semver suffix, bump the patch version (e.g., `cli-0.1.0` → `cli-0.1.1`). Use a small shell/node script for deterministic parsing.
     - Export `NEW_TAG` and `VERSION` as job outputs.
  3. **Build Matrix Job** (depends on Version job):
     - Runners:
       - `macos-latest` for macOS x64 and arm64 (cross-compile both architectures using `pkg --targets`).
       - `windows-latest` for Windows x64.
     - Steps per runner:
       1. Checkout, setup Node 20+, setup pnpm.
       2. `pnpm install`.
       3. `pnpm --filter @lemon/cli... build` (builds dependencies in topological order).
       4. Run the bundling script to produce the platform-specific binary.
       5. Rename binary to `lemon-cli-{VERSION}` (macOS) or `lemon-cli-{VERSION}.exe` (Windows).
       6. Upload as a workflow artifact.
  4. **Release Job** (needs: [Version, Build]):
     - Download all matrix artifacts.
     - Create and push the new `cli-{VERSION}` git tag (using the `GITHUB_TOKEN` with write permissions).
     - Create a GitHub Release for that tag using `gh release create` (or `softprops/action-gh-release`).
     - Attach the three downloaded binaries to the release.

### 4. Documentation Updates
- Update `docs/api/rest-api.md`: change `http://localhost:3000` to `http://localhost:3456`.
- Update `docs/api/websocket.md`: change `ws://localhost:3000/ws` to `ws://localhost:3456/ws`.
- Update `docs/architecture/cli.md`: change all `3000` references to `3456` (env vars, code snippet, command example).
- Update `docs/architecture/electron-app.md`: change "port 3000" to "port 3456 (or dynamically resolved port)" and describe that `startServer` returns the actual port.

## Testing Strategy
- **Local server startup:** Manually occupy port `3456` (e.g., `nc -l 3456`), then start the server. Verify it binds to `3457` and logs the new port. Repeat to verify ceiling behavior.
- **CLI serve:** Run `lemon serve` without `--port`; verify it starts on `3456`. Run with `PORT=4000 lemon serve`; verify it respects the override.
- **Electron:** Launch the Electron app; verify `main.ts` no longer hardcodes `3000` and that the renderer loads successfully by querying the dynamically returned port.
- **ApiClient:** Verify `LEMON_PORT=9999 node -e "..."` correctly targets `9999`, and defaults to `3456` when unset.
- **Workflow dry-run:** Open a PR that touches `packages/server/src/index.ts`, merge to `main`, and confirm the workflow triggers. For safety, test tag-bumping logic locally with `git tag` mock data before merging.
- **Artifact smoke test:** Download each built artifact (macOS x64, macOS arm64, Windows x64) and run `lemon-cli-{version} serve` to confirm the server starts and responds on the expected port.

## Risks and Considerations
- **Native module bundling (`better-sqlite3`):** `pkg` and similar tools sometimes fail to auto-detect `.node` binaries. The bundling script must explicitly copy `better-sqlite3/prebuilds/` (or the platform-specific `.node`) next to the executable and ensure the runtime can resolve it via `process.execPath` or a patched `require` path. Test on all three target platforms.
- **Cross-compilation limits:** Building macOS x64 on an Apple Silicon runner (or vice versa) requires the packager to support cross-compilation (e.g., `pkg --targets node20-macos-x64`). If unsupported, split macOS into two separate matrix jobs each running on the appropriate runner type (GitHub provides both `macos-13` for Intel and `macos-latest` for ARM).
- **Tag collisions in CI:** If two merges happen in rapid succession, the version-bump job could compute the same next patch. Use a serial job dependency (Version → Build → Release) so the tag is pushed before the next workflow run fetches tags.
- **Electron production path assumptions:** Changing `startServer` to return a value may break existing code if not awaited. Ensure `main.ts` uses `await startServer(...)` or `.then()` before creating the BrowserWindow.
- **Monorepo build graph:** The workflow must build `@lemon/shared` and `@lemon/server` before bundling `@lemon/cli`. Use `pnpm --filter @lemon/cli... run build` (with the `...` filter) to build dependencies automatically.