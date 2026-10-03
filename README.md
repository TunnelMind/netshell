# NetShell

## nsh

`nsh` is NetShell's parsers on the command line: text in, JSON out, no network.
The contract (commands, the `nsh/1` envelope, exit codes) is
[ADR-032](docs/adr/ADR-032-nsh-cli-contract.md).

Build and run from the repo root:

```sh
npm run build:cli                 # bundles src/cli/nsh.ts to dist-cli/nsh.js
node dist-cli/nsh.js normalize interfaces --vendor ios tests/fixtures/normalize/interfaces/ios.txt
```

The package's bin entry also installs it as `nsh`.

Commands (ADR-032 §1). The device text comes from FILE (or `--config F`) if
given, else from stdin:

```
nsh normalize {interfaces|bgp|arp|device} --vendor V   [FILE | stdin]
nsh comply    --policy P [--config F | stdin]
nsh render    --template T --vars V
nsh topology  lldp                                      [FILE | stdin]
```

`V` is one of `ios`, `iosxe`, `iosxr`, `nxos`, `junos`, `eos`, `generic`.
Every result is one envelope `{"schema":"nsh/1","command","vendor","data","warnings"}`.

Exit codes (ADR-032 §3):

- `0` Ran and succeeded. For `comply`, every check passed.
- `1` Ran, but found failures. Only `comply` uses it, when at least one check has status `"fail"`; the envelope is still printed.
- `2` Usage error: unknown command or flag, missing flag, bad `--vendor`, or an unreadable file. Nothing on stdout.
- `3` The input could not be parsed, including empty input. Nothing on stdout.

`nsh render` runs the template as code: nunjucks is not a sandbox, so a
template can read environment variables. Use only templates you trust as you
would a script. See ADR-032 §4.

### jq pipelines

Interfaces that are not up:

```sh
node dist-cli/nsh.js normalize interfaces --vendor ios tests/fixtures/normalize/interfaces/ios.txt \
  | jq -r '.data[] | select(.status != "up") | "\(.name) \(.status)"'
```

BGP peers not Established:

```sh
node dist-cli/nsh.js normalize bgp --vendor ios tests/fixtures/normalize/bgp/ios.txt \
  | jq -r '.data[] | select(.state != "Established") | "\(.neighborAddress) AS\(.asn) \(.state)"'
```

LLDP neighbours with a management address:

```sh
node dist-cli/nsh.js topology lldp tests/fixtures/topology/lldp-ios.txt \
  | jq -r '.data.nodes[] | select(.host) | "\(.label) \(.host) \(.type)"'
```

### Performance (SC-002)

SC-002: `nsh` answers a 1 MB `show interfaces` in under 1 s. Measured
2026-09-29 on host BEAST (WSL2), node v22.22.0, with the built bundle.

- Input: 1,048,950 bytes (810 copies of the IOS fixture), 3240 interfaces parsed (`jq '.data|length'`).
- 10 runs, wall clock including node startup: min 0.045 s, median 0.046 s, max 0.052 s. Under 1 s.

Reproduce:

```sh
for i in $(seq 810); do cat tests/fixtures/normalize/interfaces/ios.txt; done > /tmp/nsh-sc002.txt
time node dist-cli/nsh.js normalize interfaces --vendor ios /tmp/nsh-sc002.txt > /dev/null
```

## Security

<!-- DRAFT for Josh's voice (spec 102 N005); not final copy -->

- The dependency audit lives in [docs/security/2026-10-02-deps.md](docs/security/2026-10-02-deps.md).
- Fixed on 2026-10-02 by in-range updates: both critical Dependabot alerts (shell-quote 1.12.0, websocket-driver 0.7.5) and the runtime gRPC dependency protobufjs (7.6.6).
- Electron was updated from 41.2.0 to 41.10.7 on 2026-10-02. Electron ships inside the packaged app.
- Most open alerts, including one critical (tar 6.2.1), are in build tooling (@electron-forge 7.x); fixing them needs Forge 8. One is on the runtime path: braces, through nunjucks → chokidar.
