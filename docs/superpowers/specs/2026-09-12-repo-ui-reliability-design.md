# Repository and UI reliability release

Approved by the user's 「確認設計」 followed by requests to continue to completion. Retain existing visual language and explicit Teleport confirmation; repair the findings in docs/audits/2026-09-12/repo-ui-review.md. Do not change saved data formats or include .ai-local.

## Command ownership and lifecycle

Renderer commands snapshot the currently selected serials (falling back only to the active device), and pass those serials through both adapters. Stop All remains explicitly global. Shared-route membership keeps its existing synchronized route semantics. Reject malformed numeric, coordinate, serial and route payloads before any engine or ADB mutation. Joystick movement uses elapsed time and TopBar speed, cancels deferred setup on release/blur/unmount, and stops the captured target set even if selection changes. Only the active display device can update the single displayed route state. Reconnect hydration establishes a new event epoch; old request results cannot replace newer selected-device state.

## Runtime parity and bounded inputs

Serve the browser adapter in the embedded LAN build and implement its REST routes alongside WS using the existing handler registry. Constrain static access with canonical relative paths. Reject pending transport requests on disconnect, clear timers on settlement, and bound HTTP requests. Share GPX parsing with finite/range checks, track and route support, input/output bounds and retained endpoints. Validate planner input and returned geometry, limit connector allocations and overall request duration. Make history ordering deterministic and insertion/pruning atomic in both adapters. Preserve prepared SQL statements and legacy saved-location migration.

## User experience

Keep every speed and map-mode control reachable at 390px viewport width. Use an available keyless default map provider while preserving user-selected providers. Route failures always clear busy state and explain the failed operation; changed road control points/profile invalidate old plans. Shared dialog behavior supplies semantics, initial focus, Tab trapping, Escape dismissal and focus restoration across all dialogs. Associate form labels/errors with controls. Synchronize mobile panel and map mode without triggering GPS movement.

## Packaging and verification

Review startup/shutdown, deployment scripts and all tracked runtime/UI areas. Fix confirmed defects, record intentional behavior and evidence limits. Linux system ADB is documented; do not change bundling without need. Replace masked CI failures with actual type checks and both builds. Use unique temporary directories in resource scripts. Add behavioral regressions for command targeting, delayed completion, parsing, validation, history and server containment. Verify responsive UI, dialogs, route failures and reconnect using an isolated database and fake ADB; distinguish simulation from physical-device validation.

## Release acceptance

Every audit finding has a resolution or evidence-backed disposition. Tests, all runtime type checks and Electron/Web builds pass. Commit scoped changes, push main, wait for CI, tag the next patch version, publish release artifacts and verify tag/commit/asset alignment. Report any unavailable platform or physical-device verification honestly. No new features or visual redesign are required.
