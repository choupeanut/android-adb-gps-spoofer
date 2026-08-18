# Google Maps Link Import and Favorite Locations Design

## Summary

Add Google Maps shared-link import to the existing Teleport flow and make saved locations usable as persistent quick picks. Link resolution fills a pending destination for review; it never changes an Android device location until the user presses Teleport.

The feature must behave the same in the Electron desktop runtime, its embedded LAN WebSocket runtime, and the standalone Web server.

## Link Resolution

The renderer calls a backend `resolveGoogleMapsLink(url)` API. A shared Node-safe resolver parses full Google Maps URLs locally and follows redirects only for supported short-link hosts.

Host and path matching are exact: `goo.gl` is accepted only when its path is `/maps` or begins `/maps/`; `maps.app.goo.gl` requires one non-empty share-token path segment matching `/[A-Za-z0-9_-]+` and rejects its root; `google.com` and `www.google.com` are accepted only when the path is `/maps` or begins `/maps/`; and `maps.google.com` accepts `/`, `/maps`, and paths beginning `/maps/`. Ports, URL credentials, non-HTTPS protocols, sibling domains, lookalike suffixes, and all other Google hosts are rejected. Supported coordinate shapes include numeric `q` or `query` parameters, `@lat,lng` path segments, and independent `!3dLAT` plus `!4dLNG` data segments in either order.

Redirect handling accepts HTTPS only, validates every hop against the supported Google host set, stops after five redirects, shares a five-second timeout across the operation, rejects redirect loops, and never reads arbitrary response content. Extracted coordinates must have latitude from -90 through 90 and longitude from -180 through 180. A supported URL that contains no coordinates returns a distinct no-coordinates error.

The public result is a transport-safe discriminated union, never a transport-specific thrown error: `GoogleMapsLinkResult = { ok: true, lat, lng } | { ok: false, code, message }`. `code` is one of `unsupported-url`, `no-coordinates`, `invalid-coordinates`, `redirect-rejected`, `too-many-redirects`, `timeout`, or `network-error`. Messages are fixed user-safe strings and never include the submitted URL. Electron IPC, embedded WebSocket, and standalone WebSocket/REST return this union unchanged.

Only Google-link targets start an immediate Nominatim reverse-geocode request. Text search keeps its returned display name and saved favorites keep their stored name. Manual and map-click targets request a suggestion only when the user first opens Save with no current suggestion. The renderer aborts the previous reverse request and also compares a monotonically increasing request id before applying a response. Typing in the name field marks it user-edited and aborts the active request, so a stale response cannot overwrite a newer target or user-edited name. Reverse-geocoding failure falls back to formatted coordinates and does not block Teleport or saving.

## Teleport Interaction

The existing search field becomes a combined place-search and Google Maps link field. A recognized supported URL goes through the resolver; ordinary text keeps the existing forward-geocoding behavior. Unsupported URLs are rejected instead of being sent as place searches.

All successful target sources use one renderer helper: map clicks, manual coordinates, text search, Google Maps links, and saved-location selection. It fills latitude and longitude, records the pending target, and lets the map display and focus the pending marker. Applying a target never invokes ADB. The existing Teleport button remains the only action that enables mock location and pushes the destination.

Manual coordinate fields apply their target when either field blurs or the user presses Enter, but only when both complete values are valid. Teleport and Save revalidate the current field values directly, so they never depend on blur having fired. Latitude and longitude fields validate complete numeric syntax and geographic range. Errors appear beside the relevant controls after blur, Enter, Teleport, or Save rather than while typing partial values.

The existing star button continues to mean Save current target. It reveals an editable name field. Names are trimmed, required, and limited to 80 characters. A reverse-geocoded suggestion may be overwritten before saving.

## Favorite Locations

`SavedLocation` gains a required `lastUsedAt` field. Both SQLite implementations add a backward-compatible `last_used_at` column when opening an existing database and return `createdAt` and `lastUsedAt` consistently.

The public runtime APIs add exact `locations-rename(id: number, name: string)` and `locations-touch(id: number)` channels, exposed as `renameLocation` and `touchLocation`. Both return `SavedLocationMutationResult = { ok: true, location: SavedLocation } | { ok: false, code: 'invalid-id' | 'invalid-name' | 'not-found', message: string }`; they do not throw for expected validation or lookup failures. IDs must be positive safe integers. Rename validates the same 1-80 character rule as the renderer. Touch updates only `last_used_at`; renaming does not change usage order. Duplicate names and duplicate coordinates remain allowed. The existing save endpoint also validates its name and coordinates on the backend so WebSocket/REST callers cannot bypass renderer validation.

The Teleport panel always shows up to three most recently used favorites as compact quick-pick buttons. Selecting one immediately fills the pending target, then updates usage time in the background; a touch persistence failure must not prevent selecting the location. A disclosure below the main actions exposes the complete list, where users can select, rename inline, or delete a favorite. Save, rename, touch, and delete refresh both the quick picks and full list.

The existing `SavedLocations` component is refactored into the full-list manager rendered by `TeleportPanel`. Its legacy entry is removed from the unused desktop `Sidebar`, so only the shared Teleport panel owns favorite loading and management in the active desktop and mobile layouts.

Favorites sort by `last_used_at DESC`, then `created_at DESC`, then `id DESC`. New rows initialize `last_used_at` at creation. Existing migrated rows receive their existing creation timestamp when available and use creation time and id to break ties. Shared saved-location schema, validation, row mapping, and CRUD helpers are used by both SQLite wrappers so migration and camelCase behavior cannot drift.

## Error Handling and Accessibility

Link import distinguishes unsupported URL, missing coordinates, invalid coordinates, redirect rejection, timeout, and network failure. The UI shows concise recovery-oriented inline feedback and disables duplicate submission while resolving. Error responses and logs do not echo the complete submitted URL.

Interactive icons use Lucide icons and descriptive accessible labels. Quick picks and management controls retain visible focus states and at least 44-pixel touch areas. Loading, success, error, expanded, and editing states are expressed semantically rather than through color alone. Desktop floating panels and the mobile BottomSheet use the same Teleport component and behavior.

## Verification

Automated tests cover every supported URL shape, redirect limits and host validation, timeouts, coordinate boundaries, the provided `goo.gl/maps/24gF1HXWyAAmK1SQ8` result (`62.015955, -6.853447`), database migration, rename validation, recent-use ordering, and camelCase runtime contracts.

Run the complete Vitest suite, Electron production build, and standalone Web build. Smoke-test desktop and mobile-width Web flows to confirm that link import does not teleport before confirmation, favorite data survives restart, rename and delete refresh the UI, and the recent-three order changes after selection.

No version bump, package release, deployment, Google Maps Platform API, or API-key management is included.
