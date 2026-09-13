# Repository and UI Reliability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement tasks with spec and quality review. User has authorized implementation and release; continue without further approval gates.

**Goal:** Resolve the approved audit findings and publish a verified patch release.

**Architecture:** Preserve the shared engine manager and both runtime adapters. Centralize input contracts/parsing and keep renderer ownership explicit. Retain current UI tokens and saved data.

**Tech Stack:** TypeScript, Electron, Express/WS, React, SQLite, Vitest, pnpm.

## Task 1: Shared input and persistence reliability
- [x] Add regression cases in tests/unit for invalid engine payloads without manager mutations, GPX route/track coordinates and endpoints, history timestamp ties and malformed saved names.
- [x] Add src/shared/runtime-validation.ts and gpx.ts; register validation before engine handlers; mirror ADB boundary checks. Replace both GPX parsers. Reject nonfinite/range-invalid coordinates; cap input at 5 MiB and output at 2500 points with endpoints.
- [x] Update both database adapters to transactional insert/prune and `ORDER BY visited_at DESC, id DESC`; validate runtime names.
- [x] Validate planner input/profile/output and bound connector generation and total fetch duration in both adapters.
- [x] Run targeted Vitest tests, inspect diff, obtain spec and quality review, then commit scoped task files.

## Task 2: Explicit command ownership and UI lifecycle
- [x] Extend preload and browser command signatures with serials and pass selection snapshots from all renderer call sites; preserve explicit global Stop All.
- [x] Replace joystick deferred start and movement loop with cancelable sessions; use elapsed time and configured speed; cleanup captured targets on release/blur/unmount.
- [x] Guard displayed location/route events by display owner and revisions; reset event watermark on connection epoch and discard outdated hydration.
- [x] Invalidate road plans on changes; protect async Play/target-enrollment with catch/finally and mock-setup result checks.
- [x] Test delayed-start cancellation, target changes, unselected route events and stale plan prevention. Review and commit.

## Task 3: Runtime/browser transport parity
- [x] Initialize browser adapter when no Electron preload exists. Serve embedded /api/call, /api/gpx/parse, /api/version and /api/client-ip using existing handlers.
- [x] Validate request envelopes, bound bodies and WS payloads, constrain static paths and symlinks, unregister broadcasts on close.
- [x] Reject WS pending requests on disconnect, clear completion timers, bound REST requests, and settle GPX picker cancellation.
- [x] Exercise HTTP/WS parity and traversal in isolated integration tests; build packaged renderer and open embedded browser page. Review and commit.

## Task 4: Responsive and accessible UI
- [x] Make TopBar speed controls and map controls reachable at 390px; synchronize bottom sheet/map mode; replace unusable default tiles while preserving selected providers.
- [x] Consolidate dialog behavior with role, aria-modal, label, initial focus, focus trap, Escape and focus restoration. Compose Input handlers and label/error IDs.
- [x] Capture desktop/mobile browser evidence and keyboard checks with fake ADB. Review and commit.

## Task 5: Delivery and final verification
- [x] Review deployment and shutdown scripts; use unique macOS download temporary directory; retain documented system ADB on Linux.
- [x] Replace masked CI build with failing type checks for node, renderer and server, plus both builds. Run pnpm test, all tsc checks and pnpm build / pnpm build:web.
- [x] Update audit ledger with evidence-backed resolutions and remaining hardware/platform limits. Bump patch version and add release notes.
- [ ] Review aggregate changes; commit only scoped files, merge to main, push and wait for CI. Tag patch release, verify successful artifact jobs and GitHub release/tag/commit agreement.
