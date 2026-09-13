# Repository and UI reliability review

Reviewed baseline: `fcdfa3c` (v1.2.2). Final local verification: 2026-09-13, preparing v1.2.3. The user approved the repair design. Scope covers Electron, embedded LAN and standalone Web runtimes, shared engines, ADB boundaries, persistence, parsers, React UI, deployment and release workflows.

## Findings and disposition

| Area | Confirmed problem | Resolution and evidence |
| --- | --- | --- |
| Command ownership | Selected-device controls could reach unrelated engines | Explicit serial snapshots across preload/browser APIs; global Stop All remains explicit. Shared command lane orders cancellation, cleanup and successor movement. Deferred handoff regressions pass. |
| Joystick | Release during setup could still start movement | Cancelable sessions, captured targets, serialized cleanup, blur/unmount handling and elapsed-time movement at configured speed. Delayed setup/start and keyboard ownership tests pass. |
| Renderer events | Inactive/stale events and hydration could overwrite displayed state | Display owner and per-device revisions, hydration tickets and reconnect reset. Shared route completion elects one owner and rejects stale membership before bookkeeping. |
| Route controls | Errors could leave Play busy; outdated road plans remained playable | catch/finally, setup-result checks and cancellation guards; edits invalidate plans. Teleport no longer appears as a paused route. Actual browser Play → Pause → Resume → Pause verified. |
| Embedded browser | Packaged renderer assumed Electron preload | Conditional browser adapter and HTTP/WS endpoints using registered handlers. Actual Linux packaged app served a functioning LAN page; saved location survived reload with native SQLite. |
| Static server | Prefix containment allowed sibling paths | Canonical relative and realpath containment, symlink/traversal tests, bounded WS/body sizes, request-envelope validation and predictable asset caching/404 behavior. |
| Transport | Disconnect left pending requests; fallback and picker could hang | Reject pending WS calls on close, clear timers, bounded REST, GPX cancellation settlement and trailing-undefined argument normalization. Integration/regression tests pass. |
| Input/ADB | TypeScript-only assumptions reached runtime commands | Shared runtime validation plus both ADB adapters validate serials, coordinates, speed and other payload fields before operations. Malformed requests cannot mutate engines. |
| GPX | Runtime parsers diverged; invalid coordinates and lost endpoint | Shared validated track/route/waypoint parser, 5 MiB input and 2,500-point output limits, preserved endpoints and entity rejection. |
| Road planner | Unbounded input/geometry and stalled response parsing | Validate profiles and coordinates, cap input/output/connector work, total 8-second deadline including response parsing. Both adapters covered. |
| SQLite | Timestamp ties could prune the newest history row | Transactional insert/prune with `visited_at DESC, id DESC`; malformed saved names rejected. Both adapters tested. |
| Mobile | Speed controls and mode switch clipped at 390px | Responsive two-row toolbar, reachable labeled controls, synchronized sheet/map modes. Final 390×844 screenshot verified. |
| Maps | Default CARTO tiles displayed an API-key watermark | Canonical OpenStreetMap default; preserved explicit provider selections; escaped custom attribution. Attribution remains visible above mobile sheet. [CARTO notice](https://carto.com/basemaps/apikey/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). |
| Dialogs/inputs | Missing focus containment, Escape and label associations | Shared native modal, explicit boundary Tab loop, initial focus and restoration; input labels/error IDs and handler composition. Browser Shift+Tab reaches Cancel, Tab returns Close, Escape returns Select devices. |
| Connection dialog | Duplicate submission and stale async callbacks | Busy latch and generation/mount guards prevent old operations changing newly opened dialogs; validated port inputs. |
| Shutdown | Accepted commands could run after final stop | Stop admission, drain accepted commands, then final engine cleanup; stop polling and close sockets/listeners. Shared gate regressions pass. |
| CI/release | Compilation and Docker failures could be masked | Real failing type checks plus both builds; Docker success required before GitHub release. Linux retains documented system ADB; macOS download uses task-owned temporary directories. |
| Portainer | Failures could proceed to replacement or lose migration data | Validate inputs/endpoints/volumes; require source DB and completed Docker operations; retain incomplete migration marker and abort on failure. Eight isolated fake-service tests pass. No live deployment performed. |
| Existing subsystems | Maps-link resolver, bounded logging, saved-data compatibility | Existing redirect/host validation and explicit Teleport confirmation retained. Logs remain bounded in memory; README corrected. User data and local `.ai-local/` files excluded from changes. |

## Verification

- `pnpm test`: **272 tests passed across 25 files**.
- `pnpm typecheck`: node, renderer/browser and standalone server configurations passed.
- `pnpm build` and `pnpm build:web`: passed.
- Linux `electron-builder --linux --dir`: passed for repaired code before final version/paused-state adjustment. Actual unpacked Electron process and its LAN page exercised, including SQLite save/reload. Final platform artifacts are built by release CI.
- Final browser used built v1.2.3 Web UI, isolated temporary data and two synthetic ADB devices. Teleport, selection, manual route playback/pause/resume, dialog keyboard interaction and mobile layout exercised. Earlier packaged saved-location persistence also verified.
- Automated coverage includes malformed inputs, shared-route completion, asynchronous command cancellation, transport disconnect/timeouts, history ordering, planner deadlines and deployment failures.
- Spec/quality review approved the implementation. `git diff --check` passed.

## Visual evidence

Original captures show the baseline issues: [desktop watermark](evidence/01-desktop.jpg), [route](evidence/02-route.jpg), [dialog](evidence/03-add-device.jpg), [clipped mobile controls](evidence/04-mobile.jpg).

Final exact browser captures, saved and visually inspected without alteration:

- [v1.2.3 route playing after Pause/Resume](evidence/09-route-final.jpg)
- [modal with visible keyboard focus](evidence/10-modal-final.jpg)
- [390×844 mobile controls and visible attribution](evidence/11-mobile-final.jpg)

Intermediate images 06–08 record implementation progress, not final acceptance; the initial development Electron run used a SQLite fallback, subsequently resolved by native packaging and verified in the actual unpacked application.

## Limits and release acceptance

No physical Android device was used; ADB commands were handled by a task-owned fake executable. Real USB/Wi-Fi behavior, Windows/macOS launch and physical GPS observations remain hardware/platform acceptance checks. Windows/macOS packaging and bundled ADB checks run in release CI. No production Portainer service or user database was changed. This audit is evidence of the reviewed paths and tests, not proof that every possible defect is absent.

Publication acceptance requires green main CI, successful Windows/Linux/macOS/Docker release jobs, five downloadable assets and matching main/tag commits. These remote results are checked after this report is committed.
