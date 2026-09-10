# Coordinate paste, Wi-Fi history, and synchronized route recovery

User approved this design on 2026-09-10.

## Behavior

- Pasting exactly two valid decimal coordinates separated by a comma or whitespace into either Teleport coordinate field fills latitude first and longitude second. Whitespace around values is accepted. A single value retains normal paste behavior. Malformed pairs never partially overwrite the other field. Pasting only prepares a target; Teleport remains explicit.
- Add device displays the ten most frequently used IP/port records, preserving existing frequency and recency tie-breaking and deletion behavior.
- A route started for multiple selected devices uses one route engine, one progress clock, and identical location payloads for its members. Independently started routes remain separate.
- Temporary disconnection preserves selection and route membership. The shared timeline continues even when all members are offline. Reconnected members have mock GPS reinitialized and join the current route position, without replaying missed segments or restarting at the first waypoint.
- Pause remains paused across reconnect. Stop, mode switch, and explicit removal from a running group cancel recovery for affected members. Unchecking controls command targeting and does not itself stop an already running route (existing interaction semantics). Stop All includes offline members. Recovery failure is retried while the member remains connected; obsolete asynchronous recovery must not revive a stopped or replaced session.
- Electron and standalone Web use the same grouping/recovery coordination. Sessions are in-memory; application/server restart recovery is outside scope.

## Implementation boundaries

Coordinate parsing belongs in shared coordinate validation; Teleport owns paste interaction. Device selection is frontend intent, independent of transient connectivity. A shared engine manager owns route membership and reconnect lifecycle, with runtime adapters supplying ADB, route/location engine factories and logging. Route engine owns movement and broadcasts one location to all ready members. Runtime command handlers use manager operations to avoid duplicate controls or writers for a shared engine. Existing per-device location engines continue handling Teleport and Joystick.

## Lifecycle and failure handling

Members remain identifiable while absent from device discovery. Disconnected route members receive no pushes until mock setup succeeds; connected peers continue receiving updates. Recovery is serialized per device and guarded by membership/session identity after awaits. Stop and mode changes remove recovery eligibility before asynchronous cleanup. Recovered devices receive the shared engine's next current-coordinate update, including hold updates when paused or naturally completed. No automatic route motion follows explicit stop.

## Validation and delivery

Use automated behavioral tests for both runtime adapters: shared payload equality, partial and total disconnection, reconnect setup, failed setup retry, paused recovery, and stop/replacement during delayed recovery. Test parser boundaries and retained selection. Verify rendered paste into each field and ten history entries. Run unit suite, TypeScript checks, Electron and standalone builds. Inspect available ADB devices without moving real devices for tests. Document simulated versus physical coverage. Commit only task files, push branch and version tag, and verify release workflow, published artifacts and tag/commit alignment.
