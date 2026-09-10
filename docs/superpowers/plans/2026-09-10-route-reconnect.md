# Route reconnect implementation plan

**Goal:** Deliver approved coordinate paste, ten Wi-Fi history shortcuts and synchronized route recovery in v1.2.0.

**Architecture:** One shared route engine per playback group, with a shared manager owning membership, ready targets and asynchronous recovery. Desktop/Web adapters supply ADB and broadcast/log functions; per-device location engines retain existing responsibilities.

**Tech Stack:** TypeScript, React/Zustand, Electron, standalone Node/WebSocket, Vitest, pnpm.

## Tasks

- [x] Add `parseCoordinatePair` to `src/shared/coordinate-validation.ts`: split a trimmed string by one comma with surrounding whitespace or whitespace alone; require exactly two complete numbers and latitude/longitude ranges. Test comma, whitespace, negative, boundaries and malformed inputs in `tests/unit/coordinate-validation.test.ts`. Wire `onPaste` in both Teleport fields, prevent default only on valid pairs, call existing `applyTarget`. Set ConnectionDialog `QUICK_HISTORY_LIMIT = 10`.
- [x] Preserve selected serials through device discovery; retain missing selected cards as offline, while explicit deselection still works. Test disappearance, offline/unauthorized, reappearance and explicit clearing. Change RoutePanel's dynamic addition to join all effective targets through backend routePlay without resetting the running group's waypoints.
- [x] Extend both existing runtime route engines with separate member/ready-target lists and per-device delivery draining. Keep their existing geometry and jitter behavior; common grouping/recovery and command handling live in shared modules. Fan out state to members and coordinate pushes only to ready targets. Keep route time independent of ADB latency; resume preserves progress.
- [x] Add `src/shared/device-engine-manager.ts`, runtime factory adapters and shared engine command handlers. Group route instances during play; preserve them while offline; detach individual members on stops/mode switches. Re-enable mock GPS before readmitting recovered targets, retry failure on subsequent device polls, and invalidate stale async completions. Notify manager on every successful device poll, including unchanged connected sets.
- [x] Add behavioral tests parameterized across desktop and Web managers with fake ADB and timers: identical per-tick payloads, partial/all offline continuation, recovery, setup failure retry, pause, individual stop, Stop All, pending recovery cancellation and independent groups.
- [x] Run `pnpm test`, `pnpm exec tsc --noEmit -p tsconfig.node.json`, `pnpm exec tsc --noEmit -p tsconfig.web.json`, `pnpm exec tsc --noEmit -p tsconfig.web-server.json`, `pnpm build`, `pnpm build:web`. Expected: all successful. Exercise rendered Teleport paste and ten history entries against isolated mock transport. Inspect ADB availability read-only.
- [ ] Record results and release notes, bump version to 1.2.0, commit scoped files, push main after fast-forward verification and annotated v1.2.0 tag, verify CI/release completion and downloadable assets with matching commit.

## Review

All approved spec items have tasks above. No dependency upgrades or persistent on-disk route sessions are needed. Existing unrelated `.ai-local/` remains untracked.

## Verification completed

- Node 22.19.0: 139 tests passed, including 36 route/recovery tests across both runtime engines.
- Node, renderer and standalone server TypeScript configurations passed.
- Electron build, standalone server bundle and Web client build passed.
- Chromium at 1440x1000 and 390x844: comma paste in latitude, whitespace paste in longitude, invalid-pair isolation, no automatic Teleport, selection retention on disappearance/reappearance, top-ten frequency order and tenth shortcut selection passed with no page errors.
- Read-only `adb devices -l` returned no connected devices. Recovery is simulated; physical network/device behavior was not exercised.
- Existing SQLite native module targets Node 22; the initial Node 24 test invocation failed on ABI mismatch. Switching to installed Node 22 resolved this without changing dependencies.
