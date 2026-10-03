<!-- DRAFT for Josh's voice (spec 102 N005); not final copy -->
# Changelog

## Unreleased — security dependency updates (2026-10-02)

- `npm audit` went from 66 vulnerable packages (4 critical, 48 high, 8 moderate, 6 low) to 58 (1 critical, 52 high, 2 moderate, 3 low), as of 2026-10-02. The count rose because npm's advisory database added new advisories (for example braces and http-cache-semantics, published 2026-09-18), not because of this update.
- Both critical Dependabot alerts are closed. shell-quote is now 1.12.0. websocket-driver is now 0.7.5.
- protobufjs is now 7.6.6. It is a runtime gRPC dependency, through @grpc/proto-loader.
- The non-Electron updates were in-range (`npm update`). For them only `package-lock.json` changed. The ranges in `package.json` did not.
- Electron updated from 41.2.0 to 41.10.7, the same major version. Electron ships inside the packaged app.
- Most open items are in the @electron-forge 7.x build chain. Fixing them needs Forge 8, a major version bump. One runtime-path item remains: braces 3.0.3, reached through nunjucks → chokidar.
- One critical is still open: tar 6.2.1. It is in that Forge build chain.
- Full inventory: [docs/security/2026-10-02-deps.md](docs/security/2026-10-02-deps.md).
