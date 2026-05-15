# CLI + Server Bundled Release & Dynamic Port

## Overview
- Add a GitHub Actions workflow that triggers on `main` branch pushes affecting `packages/cli`, `packages/server`, or `packages/shared` (server/cli-related changes).
- Workflow bumps a `cli-*` git tag, bundles the CLI and server into a single cross-platform executable, and publishes the artifacts to a GitHub Release.
- Replace the hardcoded default server port `3000` with a unique default port and implement automatic fallback to the next available port if the default is occupied.

## In Scope
- New GitHub Actions workflow `.github/workflows/release-cli.yml`
- Tag-bumping logic using `cli-*` prefix (e.g., `cli-0.1.0`) based on the latest existing `cli-*` tag
- Cross-platform executable builds:
  - macOS Intel (`x64`)
  - macOS Silicon (`arm64`)
  - Windows (`x64`)
- Artifact naming convention: `lemon-cli-{tag-version}` (macOS no extension, Windows `.exe`)
- GitHub Release creation with attached build artifacts
- Change default server port from `3000` to `3456` in all entry points
- Port-conflict detection at server startup; if `3456` is in use, increment and retry until an open port is found
- Update CLI `ApiClient` default URL, `serve` command default, and server bootstrap to use the new port logic
- Update documentation references (`docs/api/rest-api.md`, `docs/api/websocket.md`, `docs/architecture/cli.md`, `docs/architecture/electron-app.md`) from `3000` to the new default

## Out of Scope
- Linux builds or packaging formats (deb, rpm, AppImage)
- Code signing / notarization for macOS
- Auto-updater mechanism
- Docker image builds
- Changes to the web app or Electron renderer bundling
- Modifying the `pnpm build` graph beyond what is required for the CLI/server bundle

## Technical Requirements
- **Trigger:** `push` to `main` with path filters:
  - `packages/cli/**`
  - `packages/server/**`
  - `packages/shared/**`
- **Tag Bump:** Calculate next semver patch (or minor if explicitly configured) from latest `cli-*` tag, create and push new tag in the workflow
- **Build:** Bundle `@lemon/cli`, `@lemon/server`, and `@lemon/shared` (including `node_modules` dependencies and native binaries such as `better-sqlite3`) into a single self-contained executable per target platform
- **Artifacts:** Upload platform-specific binaries to the workflow run and attach them to the GitHub Release
- **Port Default:** `3456` used when `PORT` / `LEMON_PORT` env vars are absent
- **Port Fallback:** Server startup attempts to bind; on `EADDRINUSE`, tries `port + 1` iteratively up to a reasonable ceiling (e.g., `port + 100`), logging the resolved port
- **CLI Compatibility:** `lemon serve` and the CLI’s internal `ApiClient` must respect the same env vars and fallback logic
- **Electron Compatibility:** `packages/electron` must read the resolved port from the server rather than hardcoding `3000`

## File Structure

```
.github/
└── workflows/
    └── release-cli.yml
packages/
├── cli/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── api-client.ts
│   │   └── commands/
│   │       └── serve.ts
│   └── ...
├── server/
│   ├── package.json
│   └── src/
│       └── index.ts
├── shared/
│   └── ...
└── electron/
    └── src/
        └── main.ts
docs/
├── api/
│   ├── rest-api.md
│   └── websocket.md
└── architecture/
    ├── cli.md
    └── electron-app.md
```

## Acceptance Criteria
- [ ] Pushing a change to `main` inside `packages/cli`, `packages/server`, or `packages/shared` triggers the release workflow
- [ ] The workflow creates a new git tag with the `cli-` prefix and incremented version
- [ ] The workflow produces three executables: `lemon-cli-{version}` (macOS x64), `lemon-cli-{version}` (macOS arm64), and `lemon-cli-{version}.exe` (Windows x64)
- [ ] A GitHub Release is created (or updated) for the new `cli-` tag containing all three artifacts
- [ ] Server defaults to port `3456` when no `PORT` or `LEMON_PORT` env var is set
- [ ] If port `3456` is occupied, the server automatically binds to the next available port (e.g., `3457`) and logs the actual listening port
- [ ] CLI `ApiClient` and `lemon serve` correctly target the new default port and respect env vars
- [ ] Electron app starts the embedded server without assuming port `3000`
- [ ] All documentation referencing `localhost:3000` is updated to the new default port behavior