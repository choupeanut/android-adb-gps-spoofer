# Task 3 Report — Standalone Web Packaging and Optional Auth

## Status

Completed and committed as a focused Task 3 change.

## Changed files

- `package.json`
- `pnpm-lock.yaml`
- `web/package.json`
- `web/server/index.ts`
- `web/client/web-api.ts`
- `tests/integration/websocket.test.ts`
- `README.md`
- `docs/deployment.md`
- `.superpowers/sdd/task-3-report.md`

## Implementation summary

- Added root `express` and `cors` runtime dependencies plus `@types/express` and `@types/cors` development dependencies.
- Added root `build:web:server`, `build:web:client`, `build:web`, and `start:web` scripts.
- Updated `web/package.json` build scripts to find root TypeScript and Vite configuration files through `../`; the Docker `start` script remains `node dist/server/index.js`.
- Added one shared server authorization predicate:
  - No token configured: requests remain permitted and startup emits a warning.
  - `WEB_AUTH_TOKEN` configured: `/api/*` requests require either `Authorization: Bearer <token>` or `?token=<token>`.
  - WebSocket upgrades at `/ws` use the same predicate and reject missing/wrong tokens with HTTP 401 before a connection or command handler is created.
- Added optional CORS configuration: no CORS headers when `WEB_CORS_ORIGIN` is unset; exactly that origin when it is set.
- Updated the browser adapter to retain the `token` URL parameter and attach it to WebSocket, REST invocation, GPX upload, version, and client-IP calls.
- Added real-server integration coverage that bundles and starts the standalone server in a child process, then verifies HTTP and WebSocket rejection/acceptance paths.
- Documented local, Docker, and Compose commands and the new environment variables.

## TDD evidence

1. Added the auth integration tests first.
2. Initial required red command could not start the child server because root `express`/`cors` were not packaged.
3. After adding the required dependencies, local startup still failed before auth because the existing `better-sqlite3` native binary was a Windows PE DLL on this Linux host. `pnpm rebuild better-sqlite3` rebuilt only the local ignored dependency.
4. The red command then reached the intended assertions:
   - unauthenticated `/api/call` returned `200` instead of expected `401`;
   - a WebSocket without a token opened instead of being rejected.
5. Implemented the smallest shared auth/CORS/package changes and reran the checks green.

## Final verification

```bash
pnpm test -- tests/integration/websocket.test.ts
```

Exit 0. The command ran 9 test files with 57 passing tests, including 8 integration tests. (The repository's Vitest invocation also discovers the existing unit tests.)

```bash
pnpm exec tsc -p tsconfig.web-server.json --noEmit
```

Exit 0 with no diagnostics.

```bash
pnpm build:web
```

Exit 0. The server bundle was generated and Vite built the client successfully (1,826 modules transformed).

```bash
rm -rf /tmp/android-adb-gps-spoofer-data
PORT=0 DATA_DIR=/tmp/android-adb-gps-spoofer-data timeout 5s pnpm start:web
```

The expected timeout was observed after the server logged that it was listening on `http://0.0.0.0:0`; there was no `Cannot find module 'express'` error. The final verification wrapper treats timeout exit code 124 as the expected result and exited 0.

## Notes

- The local `better-sqlite3` rebuild was needed only because the pre-existing installed native binary targeted Windows while this verification host is Linux. It changed no tracked source or lockfile content.
- Other workers' resource and local-tool changes were left untouched.
