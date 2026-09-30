# ADR-032: nsh CLI contract

**Status: Accepted** — Josh in chat, 2026-09-29 ~21:45: "I also accept your builds" (GATE 1, spec 096)
**Date**: 2026-09-29
**Spec**: tunnelmind-spec `specs/096-netshell-cli/spec.md` (plan: `specs/096-netshell-cli/plan.md`)

## Context

NetShell already has parsers for vendor `show` output, a compliance evaluator,
a template renderer and an LLDP/CDP parser. They live inside Electron IPC
handlers (`src/main/ipc/{normalize,compliance,templates,topology}.ts`), so
nothing outside the app can use them.

We want Claude, crew agents, Josh's shell, cron and CI to use them. We chose a
CLI over an MCP server (spec, Input): a CLI costs no context until it runs,
pipes into `jq`, and works the same for every caller. An MCP wrapper can come
later over the same core.

There is one implementation with two front ends (FR-001). The pure logic
moves to `src/core/` with no `electron` import. The app's IPC handlers and
`nsh` (`src/cli/nsh.ts`) both call those functions. This ADR fixes what `nsh`
accepts and what it prints. How it is built is in plan.md.

## Decision

### 1. Commands and flags (FR-003)

```
nsh normalize {interfaces|bgp|arp|device} --vendor V   [FILE | stdin]
nsh comply    --policy P [--config F | stdin]
nsh render    --template T --vars V
nsh topology  lldp                                      [FILE | stdin]
```

- `--vendor V` must be one of the `Vendor` union in `src/types.ts:5`:
  `ios`, `iosxe`, `iosxr`, `nxos`, `junos`, `eos`, `generic`. Any other value
  is a usage error (exit 2).
- `--policy P` is a path to a JSON file holding one `CompliancePolicy`
  (`src/types.ts:157`), whose `checks` are `ComplianceCheck`
  (`src/types.ts:166`).
- `--config F` is a path to a saved running-config (plain text).
- `--template T` is a path to a JSON file holding one `ConfigTemplate`
  (`src/types.ts:136`).
- `--vars V` is a path to a JSON object of variable name → string, number or
  boolean. This is the same shape as the `variables` parameter of the
  `TEMPLATES_RENDER` handler (`src/main/ipc/templates.ts:39`).
- Arguments are parsed with `node:util` `parseArgs` (plan.md). No new runtime
  dependency.

**File vs stdin.** The device text (show output or running-config) comes from
exactly one place. If a file is given (`--config F` for `comply`, one
positional path for `normalize` and `topology lldp`), `nsh` reads that file
and ignores stdin. If no file is given, `nsh` reads all of stdin until EOF.
`render` reads no device text: its inputs are the two JSON files.

Input may have CRLF line endings and trailing device prompts (spec, Edge
Cases). `nsh` accepts both, and the result must match what the app produces
for the same text.

### 2. Output envelope `nsh/1` (FR-004)

On success, and on exit 1, stdout holds exactly one JSON document followed by
a newline:

```text
{"schema":"nsh/1","command":"…","vendor":…,"data":…,"warnings":[]}
```

| Field | Type | Meaning |
|---|---|---|
| `schema` | string | Always `"nsh/1"` for this contract (see §5). |
| `command` | string | The command as typed, without flags: `"normalize interfaces"`, `"normalize bgp"`, `"normalize arp"`, `"normalize device"`, `"comply"`, `"render"`, `"topology lldp"`. |
| `vendor` | string or `null` | The `--vendor` value for `normalize`. **Always present**, and `null` for commands with no `--vendor` flag (`comply`, `render`, `topology lldp`). It is never omitted, so every envelope has the same five keys. |
| `data` | per command | The core function's result, unchanged. The types are in the table below. |
| `warnings` | string[] | Non-fatal notes for a human, such as skipped lines. It is `[]` when there are none and is never omitted. |

| Command | `data` type |
|---|---|
| `normalize interfaces` | `NormalizedInterface[]` (`src/types.ts:238`) |
| `normalize bgp` | `NormalizedBgpPeer[]` (`src/types.ts:250`) |
| `normalize arp` | `NormalizedArpEntry[]` (`src/types.ts:260`) |
| `normalize device` | `NormalizedDeviceInfo` (`src/types.ts:267`), one object |
| `comply` | `ComplianceResult[]` (`src/types.ts:176`), one per check in policy order |
| `render` | `{ "rendered": string }`, the success value of `TEMPLATES_RENDER` (`src/main/ipc/templates.ts:57`) |
| `topology lldp` | `{ "nodes": TopologyNode[], "links": TopologyLink[] }` (`src/types.ts:219`, `:228`), the value of `TOPOLOGY_LLDP_DISCOVER` (`src/main/ipc/topology.ts:106`) |

**Why `ComplianceResult[]` and not `ComplianceScanResult`** (`src/types.ts:185`):
the scan result carries `sessionId`, `sessionName` and `ts: Date.now()`. `nsh`
has no session, and a timestamp would break deterministic output. The
pass/fail counts are easy to derive with `jq`, and exit code 1 already says
whether anything failed.

**Determinism** (spec, Edge Cases). The same input always gives byte-identical
stdout. The envelope keys are in the order shown above. Keys inside `data`
follow the order the core function builds them, which is the same as the app
path (SC-001). Optional fields that are `undefined` are left out, as
`JSON.stringify` does.

#### Examples (one per command)

Field names are taken from the cited interfaces. Values are illustrative.

`nsh normalize interfaces --vendor ios < show-interfaces.txt`
```json
{"schema":"nsh/1","command":"normalize interfaces","vendor":"ios","data":[{"name":"GigabitEthernet0/1","status":"up","description":"uplink-core","mtu":1500,"ipv4":"10.0.0.1/30","errorIn":0,"errorOut":0,"speedMbps":1000}],"warnings":[]}
```

`nsh normalize bgp --vendor eos < show-bgp-summary.txt`
```json
{"schema":"nsh/1","command":"normalize bgp","vendor":"eos","data":[{"neighborAddress":"10.0.0.2","asn":65001,"state":"Established","prefixesReceived":100,"uptimeSeconds":5025}],"warnings":[]}
```

`nsh normalize arp --vendor nxos show-ip-arp.txt`
```json
{"schema":"nsh/1","command":"normalize arp","vendor":"nxos","data":[{"ip":"10.0.0.2","mac":"aa:bb:cc:dd:ee:ff","interface":"Ethernet1/1","age":12}],"warnings":[]}
```

`nsh normalize device --vendor ios < show-version.txt`
```json
{"schema":"nsh/1","command":"normalize device","vendor":"ios","data":{"vendor":"ios","hostname":"edge-rtr1","version":"15.9(3)M4","model":"ISR4331/K9","serialNumber":"FDO12345678","uptime":"3 weeks, 2 days, 4 hours"},"warnings":[]}
```

`nsh comply --policy cis-ios.json --config edge-rtr1.cfg` (exits 1: one check failed)
```json
{"schema":"nsh/1","command":"comply","vendor":null,"data":[{"checkId":"ios-8","description":"NTP configured","severity":"medium","status":"pass","output":"ntp server 10.0.0.10"},{"checkId":"ios-12","description":"HTTP server disabled","severity":"high","status":"fail","output":"ip http server","remediation":"no ip http server\nno ip http secure-server"}],"warnings":[]}
```

`nsh render --template loopback.json --vars vars.json`
```json
{"schema":"nsh/1","command":"render","vendor":null,"data":{"rendered":"interface Loopback0\n ip address 10.255.0.1 255.255.255.255\n"},"warnings":[]}
```

`nsh topology lldp < show-lldp-neighbors-detail.txt`
```json
{"schema":"nsh/1","command":"topology lldp","vendor":null,"data":{"nodes":[{"id":"n1","label":"core-sw1","host":"10.0.0.254","type":"switch"}],"links":[{"id":"l1","source":"local","target":"n1","label":"Gi0/1 — Ethernet1/1"}]},"warnings":[]}
```

In the topology example the `id`, `source` and `target` values are
placeholders. How to make them deterministic is open question 2.

### 3. Exit codes (FR-005)

| Code | Meaning | stdout | stderr |
|---|---|---|---|
| 0 | Ran and succeeded. For `comply`, every check passed. | The envelope | Empty |
| 1 | Ran, but found failures. Only `comply` uses it, when at least one `ComplianceResult.status` is `"fail"`. | The envelope, with all results | Empty |
| 2 | Usage error: unknown command or subcommand, unknown or missing flag, a `--vendor` outside the `Vendor` union, or an unreadable `--policy`/`--template`/`--vars`/`--config` file. | **Empty** | A one-line message and usage |
| 3 | The input could not be parsed. **Empty input is always 3**, never an empty success. It covers empty or whitespace-only input, text the parser cannot read (spec.md:32), and a policy, template or vars file that is not valid JSON. | **Empty** | A message saying what was expected (for example "expected IOS `show interfaces` output") |

Exit 0 is never used to mean "could not read this". How to tell unreadable
text from a legitimately empty table (for example, a device with no BGP
peers) is still open: see Open question 1.

### 4. No network, no credentials, no store (FR-006)

`nsh` is text in, JSON out. It MUST NOT:

- open any network connection (no socket, HTTP, SSH, Telnet, serial or DNS);
- read the credential vault or any secret;
- read or write the app's JSON store (`src/main/store.ts`). Policies and
  templates come only from the files named on the command line.

The only files it reads are the ones named on the command line, and it writes
only to stdout and stderr. SC-003 enforces part of this: zero `electron`
imports under `src/core/` and `src/cli/`, checked by `npm test`.

**Out of scope** (spec, Out of Scope), with its own spec, ADR and gate:
live device sessions (SSH/Telnet/serial/SSM), the credential vault and JIT
access, gNMI, TFTP, Meraki, k8s, an MCP server, and licence-gating changes in
the app.

### 5. Versioning the `schema` field

- **Stays `nsh/1`:** adding a new *optional* field to the envelope or to a
  `data` type, adding a new warning string, or adding a new vendor value to
  the `Vendor` union. Consumers must ignore fields they do not know.
- **Needs `nsh/2` and a new ADR:** removing or renaming any field, changing a
  field's type (including making an optional field required or changing
  `data` from an object to an array), changing the meaning of an exit code,
  or changing `command` strings.
- `nsh` prints one schema version per release. It never prints `nsh/1` and
  `nsh/2` side by side.

## Consequences

- Scripts and agents get a stable, `jq`-friendly contract. Exit codes can be
  used directly in CI (`nsh comply … || fail`).
- The app and CLI share the core, so a parser fix reaches both front ends.
  The golden tests (FR-002, SC-001) keep them byte-identical.
- The contract is only as rich as the current types. For example,
  `NormalizedBgpPeer.prefixesSent` is never filled by the current parser.
  Making the types richer later is an additive `nsh/1` change.
- Every `comply` result can repeat up to 500 characters of the config in
  `output` (`src/main/ipc/compliance.ts:194`), because the app does this.
  Output is noisy but identical to the app.

## Open questions

These are disagreements or gaps between the spec and the current code. This
ADR does not settle them; Josh decides at GATE 1.

1. **Exit 3 vs. current parsers.** `parseInterfaces`, `parseBgp` and
   `parseArp` return `[]`, and `parseDevice` returns `{vendor}`, for text they
   cannot read (`src/main/ipc/normalize.ts:53-199`). The spec requires exit 3.
   Where does that check go: in the CLI (empty result → 3) or in core? And is
   a legitimately empty table (for example, a device with no BGP peers)
   exit 3 or exit 0?
2. **Topology is not deterministic today.** `TOPOLOGY_LLDP_DISCOVER` gives
   every node and link a random `uuidv4()` id, and uses a caller-supplied
   `localNodeId` as each link's `source` (`src/main/ipc/topology.ts:33`,
   `:89-98`). This conflicts with the Edge Case on deterministic output and
   with SC-001. Options: derive ids from labels, add a `--local-node` flag
   (not in FR-003), or use a fixed `source`.
3. **CDP fallback.** The app falls back to parsing CDP when the LLDP output
   is shorter than 20 characters (`src/main/ipc/topology.ts:37`). FR-003 names
   only `topology lldp`. Should `nsh` accept CDP text under the same command
   or reject it?
4. **One config vs. per-check commands.** In the app, each `ComplianceCheck`
   runs its own `command` on the device (`src/main/ipc/compliance.ts:129`).
   `nsh comply` has one text (the running-config), so this ADR assumes every
   check's regex is evaluated against that whole text and `command` is
   ignored. Checks written for other commands (such as `show ntp status`)
   may then give different results than in the app.
5. **Built-in policies.** The app ships built-in CIS policies in
   `compliance.ts`. Should `--policy` also accept a built-in id (such as
   `builtin-ios-cis`), or only a file path as assumed here?
6. **Render errors.** `TEMPLATES_RENDER` returns `{ error }` for a nunjucks
   failure (`src/main/ipc/templates.ts:59`). This ADR assumes that is exit 3
   with the message on stderr. Confirm.
7. **Positional file argument.** FR-003 says "input from a file argument or
   stdin" but gives a flag only for `comply` (`--config`). This ADR assumes a
   single positional path for `normalize` and `topology lldp`.
