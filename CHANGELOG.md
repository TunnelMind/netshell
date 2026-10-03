<!-- DRAFT for Josh's voice (spec 102 N005); not final copy -->
# Changelog

## Unreleased — security dependency updates (2026-10-02)

- `npm audit` went from 66 vulnerable packages (4 critical, 48 high, 8 moderate, 6 low) to 41 (1 critical, 35 high, 2 moderate, 3 low).
- Both critical Dependabot alerts are closed. shell-quote is now 1.12.0. websocket-driver is now 0.7.5.
- protobufjs is now 7.6.6. It is a runtime gRPC dependency, through @grpc/proto-loader.
- All of this came from in-range updates (`npm update`). Only `package-lock.json` changed. The ranges in `package.json` did not.
- Still open: Electron 41.2.0 has 18 advisories. A same-major fix (41.10.6 or later) exists. It is not applied yet; that is task N003, still pending. Electron ships inside the packaged app, so it is the one open item that reaches users.
- The other 40 open packages are build-time tooling only. The lockfile marks them `"dev": true`. They come from the @electron-forge 7.x chain (extract-zip is also pulled in by Electron's installer). Fixing them needs Forge 8, a major version bump.
- One critical is still open: tar 6.2.1. It is one of those build-only packages.
- Full inventory: [docs/security/2026-10-02-deps.md](docs/security/2026-10-02-deps.md).
