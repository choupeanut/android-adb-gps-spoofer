# Android ADB Spoofer Repair and Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all configured TypeScript projects pass, make the standalone Web workflow runnable from a root install, add opt-in LAN authentication, and package one generated logo as the Electron app icon on supported platforms.

**Architecture:** Preserve the existing Electron and standalone Web service copies. Fix each runtime at its existing boundary, normalize shared data contracts, and keep Web runtime dependencies available both to the root local workflow and the Docker runtime manifest. Generate one square logo source, derive platform icon formats deterministically, and retain the existing Electron Builder product identity.

**Tech Stack:** TypeScript 5.x, Electron 33, React 19, Vitest, Vite, esbuild, Express, WebSocket, better-sqlite3, electron-builder, ImageGen plus local image conversion tools.

## Global Constraints

- Do not change the existing app ID `com.peanutchou.android-adb-gps-spoofer` or product name `Android ADB GPS Spoofer`.
- Keep the Electron service files and standalone Web service files behaviorally aligned where they implement the same handler.
- Do not modify `.ai-local/` or unrelated user changes.
- Use TDD for behavior changes: add a focused failing test, run it red, implement the smallest fix, then run it green.
- Keep agent write sets disjoint; agents must not revert changes made by other agents.
- `WEB_AUTH_TOKEN` is optional for backward-compatible LAN use; when configured, both REST and WebSocket commands require it.
- Same-origin Web requests need no CORS headers by default; `WEB_CORS_ORIGIN` explicitly enables one configured cross-origin value.
- The logo must be square, text-free, dark navy with Android-green location/ADB visual language, and contain no watermark.

---

### Task 1: Electron main, shared types, and database contract

**Owner:** Agent 1

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/services/adb.service.ts`
- Modify: `src/main/services/db.ts`
- Modify: `src/shared/types.ts` only if the current contract needs a precise type correction
- Test: add or modify the smallest relevant file under `tests/unit/`

**Interfaces:**
- Preserve `SavedLocation.createdAt: string`.
- Preserve `Database.getSavedLocations(): SavedLocation[]` and `Database.addSavedLocation(name: string, lat: number, lng: number): SavedLocation`.
- Preserve all existing `GpsSpoofApi` and ADB service method signatures.

- [ ] **Step 1: Capture the current failure**

Run:

```bash
pnpm exec tsc -p tsconfig.node.json --noEmit
```

Expected: failure in `src/main/index.ts`, `src/main/services/adb.service.ts`, and `src/main/services/db.ts`.

- [ ] **Step 2: Add a focused database contract test**

Test the real/stub result shape with a minimal mock or test seam. The expected object must use `createdAt`, never `created_at`:

```ts
expect(result).toMatchObject({ id: expect.any(Number), name: 'Home', lat: 25, lng: 121, createdAt: expect.any(String) })
expect('created_at' in result).toBe(false)
```

Run the focused test and verify it fails before changing production code.

- [ ] **Step 3: Implement minimal fixes**

Use a module-local `let isQuitting = false`, set it in `before-quit`, and reference it in the window close handler. Remove the obsolete typed `webContents.on('crashed')` listener. Ignore or log ADB stderr instead of declaring an unused binding. Change both database SELECT statements to alias `created_at AS createdAt`, and return `createdAt` from the stub path.

- [ ] **Step 4: Run focused verification**

```bash
pnpm test -- tests/unit/database.test.ts
pnpm exec tsc -p tsconfig.node.json --noEmit
```

Expected: focused test and node project typecheck pass.

- [ ] **Step 5: Report changed files and commands**

Return the exact paths, test command/output, and any concern without modifying files outside this task.

---

### Task 2: Renderer React 19 type hygiene

**Owner:** Agent 2

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/stores/ui.store.ts`
- Modify: renderer files reported by `tsconfig.web.json` only
- Test: no new runtime test is required for type-only edits; use the renderer TypeScript project as the regression test

**Interfaces:**
- `Tab` must be exactly `'teleport' | 'joystick' | 'route' | 'tools' | 'logs'`.
- Components may continue returning `JSX.Element` only if the React 19 type namespace is imported correctly; otherwise use `React.JSX.Element` with the necessary type import.

- [ ] **Step 1: Capture the current failure**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
```

Expected: JSX namespace errors, invalid `Tab` comparisons, and unused locals/imports.

- [ ] **Step 2: Implement minimal type fixes**

Import the React 19 JSX type namespace in files that use it, expand `Tab` to the five rendered tabs, and remove only unused `isTablet`, `activeDevice`, `Loader2`, `statusColors`, and `CircleMarker` bindings reported by the compiler. Do not change rendered behavior.

- [ ] **Step 3: Run focused verification**

```bash
pnpm exec tsc -p tsconfig.web.json --noEmit
pnpm build
```

Expected: both commands pass.

- [ ] **Step 4: Report changed files and commands**

Return exact paths and output summary.

---

### Task 3: Standalone Web packaging and optional auth

**Owner:** Agent 3

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `web/package.json`
- Modify: `web/server/index.ts`
- Modify: `web/client/web-api.ts`
- Modify: `README.md` and `docs/deployment.md` for the final commands/env variables
- Test: `tests/integration/websocket.test.ts` or a new focused server auth test

**Interfaces:**
- `WEB_AUTH_TOKEN?: string` enables auth.
- `WEB_CORS_ORIGIN?: string` enables one explicit CORS origin.
- Root scripts must expose `build:web:server`, `build:web:client`, `build:web`, and `start:web`.
- Browser token transport is the `token` URL parameter for the WebSocket and REST adapter; the server also accepts `Authorization: Bearer <token>` for direct API clients.

- [ ] **Step 1: Add a failing auth test**

Add a focused HTTP/WebSocket test proving that with `WEB_AUTH_TOKEN=test-token`, an unauthenticated `/api/call` returns 401, a wrong token returns 401, and `Authorization: Bearer test-token` reaches the registered handler. For the WebSocket path, a wrong/missing token must be rejected before command execution.

- [ ] **Step 2: Run the focused test red**

```bash
pnpm test -- tests/integration/websocket.test.ts
```

Expected: the new auth assertions fail against the current unauthenticated server.

- [ ] **Step 3: Add local dependency/build support**

Add `express` and `cors` to root runtime dependencies and their declaration packages to root devDependencies. Add the four root Web scripts. Change `web/package.json` build scripts to resolve root files with `../` while leaving its Docker `start` command valid.

- [ ] **Step 4: Implement auth and CORS**

Add one shared `isAuthorized` check for HTTP and WebSocket requests. Accept `Authorization: Bearer <token>` and `?token=<token>` for browser WebSocket/REST use. Return 401 before invoking a handler. Configure `cors` with no headers by default and the exact `WEB_CORS_ORIGIN` when set. Emit a warning at startup when no auth token is configured. Keep unknown channels returning 404/error as before.

- [ ] **Step 5: Run focused green verification**

```bash
pnpm test -- tests/integration/websocket.test.ts
pnpm exec tsc -p tsconfig.web-server.json --noEmit
pnpm build:web
```

Expected: auth tests, server typecheck, and client/server builds pass.

- [ ] **Step 6: Verify local startup**

```bash
rm -rf /tmp/android-adb-gps-spoofer-data
PORT=0 DATA_DIR=/tmp/android-adb-gps-spoofer-data timeout 5s pnpm start:web
```

Expected: the server starts and no `Cannot find module 'express'` error occurs.

- [ ] **Step 7: Report changed files and commands**

Return exact paths and all focused outputs.

---

### Task 4: Generated logo and platform icon packaging

**Owner:** Agent 4

**Files:**
- Create: `resources/branding/android-adb-gps-spoofer-logo.png`
- Modify: `resources/icon.png`
- Create or modify: `resources/icon.ico`
- Create: `resources/icon.icns`
- Modify: `electron-builder.yml` only if required by the generated asset layout
- Create: a deterministic conversion script under `scripts/` only if no existing system tool can provide the required formats

**Interfaces:**
- The source logo is a square PNG with no text and no watermark.
- Electron Builder continues reading the configured Linux, Windows, and macOS icon paths.

- [ ] **Step 1: Generate and inspect the source artwork**

Use the approved imagegen prompt: square app logo; dark navy background; centered Android-green location pin merged with a crosshair and restrained ADB terminal cursor; flat high-contrast silhouette; no words, letters, watermark, shadows, or extra objects; generous padding; recognizable at 16px.

Copy the selected output into `resources/branding/android-adb-gps-spoofer-logo.png` and inspect it before conversion.

- [ ] **Step 2: Convert deterministically**

Create the required PNG/ICO/ICNS sizes from the same source. Preserve the existing `electron-builder.yml` identity and verify that `resources/icon.icns` now exists.

- [ ] **Step 3: Validate files**

```bash
file resources/branding/android-adb-gps-spoofer-logo.png resources/icon.png resources/icon.ico resources/icon.icns
```

Expected: PNG, ICO, and ICNS signatures are recognized and all images are square.

- [ ] **Step 4: Run packaging verification**

```bash
pnpm dist:linux
```

Expected: electron-builder can resolve the Linux icon and completes the available Linux artifact build. Report macOS/Windows packaging as platform-unverified if the current host cannot build them.

- [ ] **Step 5: Report changed files and commands**

Return asset paths, source prompt summary, conversion tool, and packaging output.

---

### Task 5: Whole-branch review and final verification

**Owner:** Agent 5

**Files:** read-only review; do not modify files unless explicitly asked by the controller

- [ ] **Step 1: Inspect the combined diff**

Check that agent write sets do not overlap incorrectly, no generated secrets or `.ai-local` files were added, and package scripts/docs agree with the actual files.

- [ ] **Step 2: Run the full verification matrix**

```bash
pnpm test
pnpm exec tsc -b --pretty false
pnpm build
pnpm build:web
git diff --check
```

- [ ] **Step 3: Review security and icon invariants**

Confirm auth blocks handlers before execution, no-auth startup warning is present, same-origin CORS is the default, and all referenced icon files exist.

- [ ] **Step 4: Return a review verdict**

Report `PASS` or a numbered list of concrete blocking findings with file paths and commands; do not make unrelated refactors.

---

## Final handoff

The controller integrates agent changes, reruns the full matrix after any review fix, checks the final Git status, and reports the generated asset paths plus any platform-specific packaging limitation.
