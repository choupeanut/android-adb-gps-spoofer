# Android ADB GPS Spoofer Repair and Icon Design

## Goal

Make the Electron and standalone Web runtimes type-checkable and locally runnable, reduce the documented LAN-control risk, and replace the placeholder application artwork with a generated logo packaged as the desktop application icon.

## Current evidence

- `pnpm test` passes 53 tests and `pnpm build` succeeds because the bundlers transpile without running TypeScript validation.
- `pnpm exec tsc -p tsconfig.node.json --noEmit` fails in Electron main code, SQLite result typing, and unused-variable checks.
- `pnpm exec tsc -p tsconfig.web.json --noEmit` fails on React 19 JSX types, the `Tab` union, and unused imports/locals.
- `pnpm exec tsc -p tsconfig.web-server.json --noEmit` cannot resolve `express` and `cors` from the root install.
- `node dist/server/index.js` fails locally with `Cannot find module 'express'` after the documented root install.
- `web/package.json` points to root-level build configuration files that are not present in `web/` when its scripts are run from that directory.
- `resources/icon.icns` is referenced by `electron-builder.yml` but is absent from the repository.

## Design decisions

### Runtime and type correctness

1. Keep the existing dual-runtime architecture and avoid duplicating or relocating service implementations.
2. Replace the Electron app augmentation for `isQuitting` with a module-local boolean, and use only Electron events whose installed type definitions support them.
3. Normalize saved-location SQL result names to the shared camelCase contract (`createdAt`) and use the same contract in stub paths.
4. Update renderer components to use the React 19 JSX type namespace and expand `Tab` to match the actual five sidebar tabs.
5. Remove only unused imports and locals surfaced by strict type checking; do not perform unrelated UI refactors.

### Standalone Web packaging

1. Add the server's runtime dependencies and their TypeScript declarations to the root development workflow so the README's local build/start commands work after `pnpm install`.
2. Add explicit root scripts for server bundle, client bundle, and combined Web build/start operations.
3. Keep `web/package.json` as the Docker runtime manifest, but make its scripts resolve the root config paths correctly if run from `web/`.
4. Preserve esbuild's externalization of native/runtime packages for the Docker image.

### LAN API safety

1. Add an optional `WEB_AUTH_TOKEN` bearer-token check to both `/api/call` and WebSocket command messages.
2. When a token is configured, the browser adapter sends it using the same-origin bootstrap configuration; unauthenticated requests receive 401 and no handler executes.
3. When no token is configured, preserve current LAN behavior but emit a startup warning explaining that the control surface is unauthenticated.
4. Keep CORS behavior restricted to same-origin by default; support an explicit `WEB_CORS_ORIGIN` value for intentional cross-origin deployments.

### Generated logo and platform icons

1. Generate a square, text-free logo in the visual direction “technology location + ADB terminal”: dark navy background, high-contrast Android-green location pin/crosshair, restrained terminal-cursor detail, crisp silhouette, and no watermark.
2. Store the selected source artwork under `resources/branding/android-adb-gps-spoofer-logo.png` and retain the existing `resources/icon.png` as the canonical Linux/renderer-sized icon generated from that source.
3. Produce Windows `.ico` and macOS `.icns` assets from the same artwork using deterministic local conversion tooling.
4. Update `electron-builder.yml` only as needed to point at the generated assets; preserve existing product name and app ID.
5. Validate the icon files with file/type inspection and a release packaging command available on the current platform.

## Test strategy

- Add focused unit coverage for saved-location key normalization and Web auth behavior.
- Use the TypeScript project build as the regression gate for all three runtime configurations.
- Run the existing Vitest suite unchanged and run Electron/Web production builds.
- Run the standalone server smoke test with a temporary `DATA_DIR`, first without auth and then with `WEB_AUTH_TOKEN`, verifying the expected status codes.
- Verify generated PNG/ICO/ICNS dimensions and file signatures before claiming icon integration complete.

## Agent boundaries

Four implementation agents will work in disjoint write sets:

1. Electron main/shared/database: `src/main/**`, `src/shared/**`, related unit tests.
2. Renderer typing: `src/renderer/**`, related unit tests only if needed.
3. Standalone Web packaging/security: `web/**`, root package/config/docs files, Web tests.
4. Logo and icon packaging: `resources/branding/**`, `resources/icon.*`, `electron-builder.yml`, icon conversion scripts if needed.

A fifth agent performs the final whole-branch review and verification. Agents must not revert unrelated work and must report exact files changed and commands run.
