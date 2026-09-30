# `nsh` extraction inventory (T002)

Before T102 moves the pure logic into `src/core/*.ts`, this file lists every
symbol that logic touches, who calls it, and what coupling has to be cut. It
covers the four capabilities in the plan.md table: normalize, compliance,
templates, topology.

Everything here was read from branch `crew/nsh-096` at commit `aad099d`. Line
numbers are 1-based. Callers were found with
`grep -rn '<name>' src/`.

The "looks accidental" notes are **observations, not fixes**. T101's goldens
lock in current behaviour, quirks included. Whether any quirk gets changed is
a separate decision.

## How a call reaches the logic (all four capabilities)

```
src/components/<View>.tsx  window.api.<ns>.<fn>(p)
  → src/preload.ts          ipcRenderer.invoke(IPC.<CHANNEL>, p)
  → src/main/ipc/<file>.ts   ipcMain.handle(IPC.<CHANNEL>, …)   registered by
  → src/index.ts:75-79       register{Compliance,Template,Topology,Normalize}Handlers()
```

Channel names are the `IPC` const in `src/types.ts:484-505`.

Shared app-only helper: `runCommandGetOutput(connId, connType, command)` at
`src/main/ipc/compliance.ts:199-220`. It dynamically imports `./dataListeners`
and `electron` (l.200-201), fires `ipcMain.emit` on the SSH/serial/telnet write
channel (l.203-210), and resolves whatever output arrives in a fixed 3 s window
(l.213-219). It is live-device I/O and **stays in the app**. It is imported by
`normalize.ts:9` and `topology.ts:12`, and called in `compliance.ts:129`.
Nothing in `src/core/` may import it.

---

## 1. normalize — `src/main/ipc/normalize.ts`

File-level imports (l.6-9):

| Import | Line | Used by the pure parsers? |
|---|---|---|
| `ipcMain` from `electron` | 6 | No. Only `registerNormalizeHandlers` (l.12, 22, 31, 41) |
| `IPC` from `../../types` | 7 | No. Only the handler channel names |
| types `Vendor`, `NormalizedInterface`, `NormalizedBgpPeer`, `NormalizedArpEntry`, `NormalizedDeviceInfo` from `../../types` | 8 | **Yes**. Type-only import |
| `runCommandGetOutput` from `./compliance` | 9 | No. Only the handlers (l.18, 27, 37, 46) |

There is no module-level state. None of the four parsers calls another
function in the file. They use only `String`/`RegExp`/`parseInt`/`Math.round`
built-ins. All four are non-exported `function`s. T102 must export them.

The app-side wrapper `registerNormalizeHandlers` (l.11-49) picks the device
command per vendor and **stays in the app**:
- interfaces: `'show interfaces terse'` if `vendor === 'junos'`, otherwise `'show interfaces'` (l.17)
- bgp: always `'show bgp summary'` (l.27)
- arp: `'show arp'` if junos, otherwise `'show ip arp'` (l.36)
- device: always `'show version'` (l.46)

| Item | Location | Signature | Types used (`src/types.ts`) | Callers |
|---|---|---|---|---|
| `parseInterfaces` | `normalize.ts:53-105` | `(output: string, vendor: Vendor): NormalizedInterface[]` | `Vendor` (l.5), `NormalizedInterface` (l.238-248) | `normalize.ts:19` ← `IPC.NORMALIZE_INTERFACES` ← `preload.ts:196-197` ← `components/NormalizeView.tsx:38` |
| `parseBgp` | `normalize.ts:109-140` | `(output: string, _vendor: Vendor): NormalizedBgpPeer[]` | `Vendor`, `NormalizedBgpPeer` (l.250-258) | `normalize.ts:28` ← `IPC.NORMALIZE_BGP` ← `preload.ts:198-199` ← `NormalizeView.tsx:41` |
| `parseArp` | `normalize.ts:144-168` | `(output: string, vendor: Vendor): NormalizedArpEntry[]` | `Vendor`, `NormalizedArpEntry` (l.260-265) | `normalize.ts:38` ← `IPC.NORMALIZE_ARP` ← `preload.ts:200-201` ← `NormalizeView.tsx:44` |
| `parseDevice` | `normalize.ts:172-199` | `(output: string, vendor: Vendor): NormalizedDeviceInfo` | `Vendor`, `NormalizedDeviceInfo` (l.267-274) | `normalize.ts:47` ← `IPC.NORMALIZE_DEVICE` ← `preload.ts:202-203` ← `NormalizeView.tsx:47` |

Regexes each parser relies on, verbatim:

- `parseInterfaces`, junos: `/^(\S+)\s+(up|down)\s+(up|down)/i` (l.59). IOS/NXOS/EOS: block split `/^(?=\S)/m` (l.71), header `/^(\S+)\s+is\s+(up|down|administratively down),\s+line protocol is\s+(up|down)/i` (l.74), plus `Description:\s*(.+)` (l.83), `BW (\d+) Kbit|(\d+)Mb\/s|(\d+)Gb\/s` (l.84), `MTU (\d+)` (l.85), `Internet address is (\S+)` (l.86), `(\d+) input errors` (l.87), `(\d+) output errors` (l.88). All use `/i`.
- `parseBgp`: `/Neighbor\s+V\s+AS/i` (l.114), IPv4 test `/^\d+\.\d+\.\d+\.\d+$/` (l.122), `/^\d+$/` (l.126-127), `/^(\d+):(\d+):(\d+)$/` (l.132).
- `parseArp`, junos: `/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s+(\S+)/i` (l.150). Others: `/Internet\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+|-)\s+([0-9a-f.]{14})\s+\S+\s+(\S+)/i` (l.159).
- `parseDevice`, junos: `Hostname:\s*(\S+)`, `Model:\s*(.+)`, `Junos:\s*(\S+)` (l.176-178). Others: `(\S+)\s+uptime is`, `Version\s+(\S+[^\s,]+)`, `(?:cisco|arista)\s+(\S+)`, `Processor board ID\s+(\S+)` ?? `System serial number\s+:\s*(\S+)`, `uptime is\s+(.+)` (l.186-190).

**Coupling T102 must cut:** none inside the four parsers. Move them as they
are. `ipcMain`, `IPC` and `runCommandGetOutput` stay with
`registerNormalizeHandlers`.

### Looks accidental (normalize)

**N1. `admin-down` is tested against the interface *name*, not the status.**
`normalize.ts:78-80`:
```ts
      name: header[1],
      status: header[1].toLowerCase().includes('admin') ? 'admin-down'
        : header[2].toLowerCase() === 'up' ? 'up' : 'down',
```
`header[1]` is the interface name. The status text is `header[2]`. So
`Gi0/1 is administratively down, …` gives `'down'`, not `'admin-down'`. An
interface whose name contains "admin" always gives `'admin-down'`.

**N2. IOS status ignores line protocol.** In the same lines (l.79-80), the
header regex captures `line protocol is (up|down)` as `header[3]` (l.74), but
nothing reads it. `Gi0/1 is up, line protocol is down` gives `'up'`.

**N3. The JunOS column comment does not match the code's use of the columns.**
`normalize.ts:57-64`:
```ts
    // JunOS "show interfaces terse" — columns: Interface State Admin Link
    ...
      const m = line.match(/^(\S+)\s+(up|down)\s+(up|down)/i)
    ...
        status: m[2].toLowerCase() === 'up' && m[3].toLowerCase() === 'up' ? 'up'
          : m[2].toLowerCase() === 'down' ? 'admin-down' : 'down',
```
The comment names four columns. The regex reads only two status columns
(`m[2]`, `m[3]`) and treats `m[2]` as admin state.

**N4. The block split treats any unindented line as a new block** (l.71,
`/^(?=\S)/m`). Blocks whose first line doesn't match the header regex are
dropped (l.75), so unindented lines such as a prompt or command echo are
skipped silently.

**N5. Speed takes whichever alternative appears first in the block.**
`normalize.ts:84`:
```ts
    const speed = block.match(/BW (\d+) Kbit|(\d+)Mb\/s|(\d+)Gb\/s/i)
```
IOS prints `BW … Kbit` before the `…Mb/s` duplex line, so BW usually wins and
is converted with `Math.round(kbit / 1000)` (l.99). EOS/NXOS formats without
`BW` fall through to the other alternatives.

**N6. `parseBgp` ignores its vendor argument.** `normalize.ts:109`:
```ts
function parseBgp(output: string, _vendor: Vendor): NormalizedBgpPeer[] {
```
Only the `Neighbor  V  AS` table format is parsed (l.114). Any output without
that header (e.g. JunOS, where the handler still sends `show bgp summary`,
l.27) returns `[]` (l.115).

**N7. `parseBgp` skips the two lines after the table start, which includes the
first neighbor row.** `normalize.ts:114-117`:
```ts
  const tableStart = output.search(/Neighbor\s+V\s+AS/i)
  if (tableStart < 0) return results

  const tableLines = output.slice(tableStart).split('\n').slice(2)
```
Element 0 is the header line. Element 1 is the next line. The example in the
comment (l.112-113) puts a data row directly after the header, so under that
layout the first peer is dropped. Goldens should include a fixture that shows
which way this goes.

**N8. BGP state and uptime come from the last two columns**
(`cols[cols.length - 1]`, `cols[cols.length - 2]`, l.125, 130). A multi-word
state such as `Idle (Admin)` splits into two columns: `state` becomes
`'(Admin)'` and the uptime slot reads `'Idle'`. Any numeric last column is
reported as `'Established'` (l.126).

**N9. The uptime comment promises a format the code does not parse.**
`normalize.ts:129-135`:
```ts
    // Parse uptime "01:23:45" or "1d02h" → seconds (best-effort)
    const uptimeStr = cols[cols.length - 2]
    let uptimeSec: number | undefined
    const hhmmss = uptimeStr.match(/^(\d+):(\d+):(\d+)$/)
```
Only `hh:mm:ss` is handled. `1d02h`, `never` and `3w2d` leave `uptimeSeconds`
`undefined`.

**N10. The JunOS ARP regex requires the IP before the MAC.** `normalize.ts:148-150`:
```ts
    // "show arp": IP=10.0.0.1 MAC=aa:bb:cc:dd:ee:ff Interface=ge-0/0/0.0
    ...
      const m = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s+(\S+)/i)
```
The code matches the order in its own comment (IP, MAC, interface). This
inventory has not checked that order against real JunOS `show arp` output
(which, as far as the author knows, prints the MAC column first). A fixture
from a real device will settle it.

**N11. ARP MAC case is passed through.** The IOS branch strips dots and
re-joins pairs with `:` (l.162-163) but does not lowercase them. The JunOS
branch returns `m[2]` as matched (l.152). The `?? m[3]` fallback (l.163) can't
be reached, because the regex guarantees 12 hex chars after stripping dots.

**N12. `parseDevice` model picks the first word after "cisco"/"arista".**
`normalize.ts:188`:
```ts
  const model    = output.match(/(?:cisco|arista)\s+(\S+)/i)
```
IOS `show version` usually starts `Cisco IOS Software, …`, so on that output
`model` would be `'IOS'`. Likewise, `hostname` (l.186) is the token before the
first `uptime is`, and `version` (l.187) is the first `Version` token in the
text.

**N13. `parseDevice` always echoes the caller's vendor** (`{ vendor }`, l.173).
It never detects the vendor from the text.

**N14. Silent defaults.** All four parsers return `[]` or a bare
`{ vendor }` when nothing matches. They never throw. ADR-032 exit code 3
("input not parseable") will need a check in the CLI layer to detect this.

---

## 2. compliance — `src/main/ipc/compliance.ts`

File-level imports (l.6-10):

| Import | Line | Used by `evaluateCheck`? |
|---|---|---|
| `ipcMain` from `electron` | 6 | No. Handlers l.87-166 (and a second dynamic import in `runCommandGetOutput`, l.201) |
| `v4 as uuidv4` from `uuid` | 7 | No. Only `COMPLIANCE_POLICIES_SAVE` (l.94) |
| `IPC` from `../../types` | 8 | No |
| types `CompliancePolicy`, `ComplianceCheck`, `ComplianceResult` | 9 | `ComplianceCheck`, `ComplianceResult` **yes**. `CompliancePolicy` only for the BUILTIN consts and handlers |
| `load`, `save` from `../store` | 10 | No. Handlers l.88, 93-98, 103-105, 116 |

| Item | Location | Signature / value | Types used | Callers |
|---|---|---|---|---|
| `evaluateCheck` | `compliance.ts:169-197` | `(check: ComplianceCheck, output: string): ComplianceResult`. Not exported | `ComplianceCheck` (types.ts:166-174), `ComplianceResult` (types.ts:176-183) | only `compliance.ts:130`, inside `IPC.COMPLIANCE_RUN` (l.108) ← `preload.ts:168-169` ← `components/ComplianceScanner.tsx:79` |
| `BUILTIN_IOS` | `compliance.ts:14-34` | `CompliancePolicy`, id `builtin-ios-cis`, 12 checks | `CompliancePolicy` (types.ts:157-164) | via `BUILTIN_POLICIES` only |
| `BUILTIN_NXOS` | `compliance.ts:36-50` | id `builtin-nxos-cis`, 6 checks | same | same |
| `BUILTIN_JUNOS` | `compliance.ts:52-65` | id `builtin-junos-cis`, 5 checks | same | same |
| `BUILTIN_EOS` | `compliance.ts:67-80` | id `builtin-eos-cis`, 5 checks | same | same |
| `BUILTIN_POLICIES` | `compliance.ts:82` | exported array of the four above | — | `compliance.ts:89` (`POLICIES_GET_ALL`), `compliance.ts:116` (`COMPLIANCE_RUN`). No other file imports it |
| `runCommandGetOutput` | `compliance.ts:199-220` | `(connId, connType, command): Promise<string>`. Exported | — | `compliance.ts:129`, `normalize.ts:18/27/37/46`, `topology.ts:36/39`. **Stays in app** |

`evaluateCheck` uses only `RegExp` (l.174, 182) and `String.prototype.slice`
(l.194). It does not use module-level state, other helpers, or third-party
modules. It is a straight move.

**Does the CLI need the BUILTIN policies?** Not by the spec as written.
spec.md User Story 2 says the policy is "JSON, the app's own
`CompliancePolicy` shape". FR-003 says `comply --policy P`. ADR-032 l.38 says
`--policy P` is "a path to a JSON file holding one `CompliancePolicy`". The
BUILTIN consts are plain data with no app coupling, so T102 *can* move them to
core if a later decision wants `nsh` to ship them. Nothing in the current spec
requires that. If they stay in `compliance.ts`, `BUILTIN_POLICIES` keeps
working unchanged.

**Coupling T102 must cut:** none inside `evaluateCheck`. Export it from
`src/core/compliance.ts`. `COMPLIANCE_RUN` (l.108-166) keeps `ipcMain`,
`load()`, `event.sender.send` progress events (l.124, 144, 164), the
`Date.now()` timestamp (l.157) and `runCommandGetOutput`.

### Looks accidental (compliance)

**C1. An invalid regex is handled differently in the two fields.**
`compliance.ts:172-187`:
```ts
  if (check.expectMatch) {
    try {
      const re = new RegExp(check.expectMatch, 'i')
      if (!re.test(output)) status = 'fail'
    } catch {
      status = 'fail' // invalid regex = treat as no match
    }
  }
  if (check.expectNoMatch) {
    try {
      const re = new RegExp(check.expectNoMatch, 'i')
      if (re.test(output)) status = 'fail'
    } catch {
      // invalid regex = treat as no match, so no failure
    }
  }
```
A bad `expectMatch` fails the check. A bad `expectNoMatch` silently passes it.
The comments show this was intended, but neither case reports `'error'`.

**C2. Regexes are compiled with `'i'` only, not `'m'`.** So `$` means end of
the whole output. In `compliance.ts:32`:
```ts
    { id: 'ios-12', description: 'HTTP server disabled', command: 'show run | include ip http server', expectNoMatch: 'ip http server$', severity: 'high', ... },
```
`ip http server` only fails the check when it is the last thing in the
output. Captured terminal output usually ends with a prompt, and possibly
`\r`, so this check tends to pass even when the line is present.

**C3. A check with neither `expectMatch` nor `expectNoMatch` passes**
(`let status = 'pass'`, l.170).

**C4. `output` is truncated to 500 characters** (l.194:
`output: output.slice(0, 500)`), and `remediation` is set only on fail
(l.195). Goldens will record the truncated text.

**C5. `evaluateCheck` never returns `'error'` or `'skipped'`**, although the
type allows them (types.ts:180). `'error'` is produced only by the
`COMPLIANCE_RUN` catch (l.132-140) when the device command throws.

**C6. The app and the CLI give `evaluateCheck` different inputs.** In the app,
each check is evaluated against the output of *its own* `check.command`
(l.129-130), e.g. `show ip ssh` or `show ntp status`. The CLI
(`--config F | stdin`) will evaluate every check against one saved config
text. Same function, different input. Checks whose regex targets `show`
output rather than running-config (e.g. `ios-1` `SSH Enabled.*version 2`,
l.21) will likely fail under the CLI. This is recorded for the supervisor and
not decided here.

---

## 3. templates — `src/main/ipc/templates.ts`

File-level imports and module values (l.6-16):

| Symbol | Line | Used by the RENDER body? |
|---|---|---|
| `ipcMain` from `electron` | 6 | Registration only (l.39) |
| `v4 as uuidv4` from `uuid` | 7 | No. Only `TEMPLATES_SAVE` (l.25) |
| `IPC` | 8 | Channel name only |
| type `ConfigTemplate` | 9 | Indirectly: `data.templates` is `ConfigTemplate[]`, and the body reads `.id`, `.variables`, `.template` |
| `load`, `save` from `../store` | 10 | `load()` **yes** (l.43). `save` no |
| `nunjucks` = `require('nunjucks')` | 13 | Via `env` |
| `env` = `new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false })` | 16 | **Yes** (l.56) |

`env` options, exactly as written (these are behaviour and must move
unchanged):

```ts
// src/main/ipc/templates.ts:15-16
// Configure nunjucks with no filesystem loader (render strings only)
const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false })
```
- loader `null`: no filesystem or template loader.
- `autoescape: false`: `<`, `>`, `&` and quotes are emitted raw.
- `throwOnUndefined: false`: an undefined variable renders as empty text and
  does not throw.

`nunjucks` is loaded with `require` under an eslint disable (l.12-13), not
`import`. `@types/nunjucks` is in package.json l.38 and `nunjucks` in l.73.
Either works in core. The instance is built once, at module load.

| Item | Location | Inputs | Output | Types used | Callers |
|---|---|---|---|---|---|
| `TEMPLATES_RENDER` handler body | `templates.ts:39-61` (logic l.43-60) | `params.templateId: string`, `params.variables: Record<string, string \| number \| boolean>` (l.39-42) | `{ rendered: string }` (l.57), or `{ error: string }` when not found (l.45) or when nunjucks throws (l.59). It never throws | `ConfigTemplate` (types.ts:136-144), `TemplateVariable` (types.ts:146-153, via `tmpl.variables`: `.name`, `.default`) | `IPC.TEMPLATES_RENDER` ← `preload.ts:179-180` ← `components/TemplateEditor.tsx:81` |

The pure part is l.47-60: given a `ConfigTemplate` and variables, build the
context and render. The lookup at l.43-45 is store-bound.

**Coupling T102 must cut:** `load().templates.find(...)` (l.43-44). The core
function should take the `ConfigTemplate` itself, which is what the CLI's
`--template T` file supplies. The handler keeps the lookup and the not-found
`{ error }` (l.45).

### Looks accidental (templates)

**T1. The defaults loop is then overwritten wholesale by the caller's
values.** `templates.ts:47-53`:
```ts
    // Merge provided variables with defaults
    const context: Record<string, string | number | boolean> = {}
    for (const v of tmpl.variables) {
      context[v.name] = params.variables[v.name] ?? v.default ?? ''
    }
    // Caller-provided values override defaults
    Object.assign(context, params.variables)
```
Effects:
- A variable the caller sets to `null` or `undefined` takes the default at
  l.50, then gets overwritten back to `null`/`undefined` at l.53.
- Caller keys *not* declared in `tmpl.variables` still reach the template.
- A declared variable with no default and no caller value becomes `''`
  (l.50).

**T2. `required: true` (types.ts:152) is never checked.** A missing required
variable renders as `''`.

**T3. Errors are returned as values, not thrown** (l.45, 58-60). Because the
loader is `null`, `{% include %}`/`{% extends %}` fail at render time and
surface as `{ error }`.

---

## 4. topology — `src/main/ipc/topology.ts`

File-level imports (l.7-12):

| Import | Line | Used by LLDP/CDP parse? |
|---|---|---|
| `ipcMain` from `electron` | 7 | Registration (l.15, 20, 30) |
| `v4 as uuidv4` from `uuid` | 8 | **Yes**: node and link ids, l.60, 68 (CDP) and l.89, 97 (LLDP) |
| `IPC` | 9 | Channel names only |
| types `TopologyNode`, `TopologyLink` | 10 | **Yes** |
| `load`, `save` from `../store` | 11 | **Not in the discover handler.** Only `TOPOLOGY_GET` (l.16) and `TOPOLOGY_SAVE` (l.24-27). Discovery returns nodes and links and does not persist them |
| `runCommandGetOutput` from `./compliance` | 12 | Yes, in the handler: l.36 (`show lldp neighbors detail`), l.39 (`show cdp neighbors detail`) |

| Item | Location | Signature / inputs → outputs | Types used | Callers |
|---|---|---|---|---|
| `TOPOLOGY_LLDP_DISCOVER` handler | `topology.ts:30-107` | in: `{ connId, connType, localNodeId }` (l.30-34). out: `{ nodes: TopologyNode[], links: TopologyLink[] }` (l.106) | `TopologyNode` (types.ts:219-226), `TopologyLink` (types.ts:228-234) | `IPC.TOPOLOGY_LLDP_DISCOVER` ← `preload.ts:185-186` ← `components/TopologyMap.tsx:67` |
| — LLDP parse (pure part) | `topology.ts:75-104` | `output` text + `params.localNodeId` → push to `nodes`/`links` (declared l.42-43) | same | inside the handler only |
| — CDP parse (pure part) | `topology.ts:45-74` | same shape | same | inside the handler only. Used when LLDP output is short (l.37-40) |
| `guessTypeFromCap` | `topology.ts:110-118` | `(cap: string): TopologyNode['type']`. Not exported | `TopologyNode['type']` (types.ts:223) | `topology.ts:63` (CDP), `topology.ts:92` (LLDP) |

Regexes. The block split is `/^-{5,}/m` in both branches (l.48, 78), with
empty blocks filtered. LLDP: `System Name:\s*(.+)`,
`Management Address:\s*(\S+)`, `Local Intf:\s*(\S+)`, `Port id:\s*(\S+)`,
`System Capabilities:\s*(.+)` (l.80-84, all `/i`). CDP: `Device ID:\s*(\S+)`,
`IP address:\s*(\S+)`, `Interface:\s*(\S+),`, `Port ID \(outgoing port\):\s*(\S+)`,
`Capabilities:\s*(.+)` (l.50-54, all `/i`).

`guessTypeFromCap` uses only `String.toLowerCase` and `includes`. It has no
module state.

**Coupling T102 must cut:**
- `runCommandGetOutput` and the LLDP→CDP fallback decision (l.36-40) stay in
  the app. The core function takes text.
- `uuidv4` (l.60, 68, 89, 97) is inside the pure part. See P1.
- `params.localNodeId` (l.69, 98) is a caller value. Core needs it as an
  argument.
- Nothing here touches `load`/`save`.
- ADR-032 has `nsh topology lldp` only. Whether core also takes the CDP
  branch (l.45-74) is for T102 to decide. The handler needs it either way.

### Looks accidental (topology)

**P1. Ids are random: nondeterministic output (matters for T101 goldens).**
`topology.ts:88-101`:
```ts
        const node: TopologyNode = {
          id: uuidv4(),
          label: sysMatch[1].trim(),
          host: mgmtMatch?.[1],
          type: guessTypeFromCap(capMatch?.[1] ?? ''),
        }
        nodes.push(node)

        const link: TopologyLink = {
          id: uuidv4(),
          source: params.localNodeId,
          target: node.id,
```
The same code is at l.60 and 68 for CDP. The same input gives different
`id`/`target` values on every run, so a byte-for-byte golden cannot be taken
of the current output as-is. ADR-032 lists this as open question 2 and does
not settle it.

**P2. The LLDP→CDP fallback is a length heuristic.** `topology.ts:37`:
```ts
    const usedCdp = !output || output.length < 20
```
Any LLDP output of 20+ characters, including an error such as
`% LLDP is not enabled`, is parsed as LLDP and yields no nodes.

**P3. Capability codes never match.** `guessTypeFromCap` looks for whole words
(l.112-116):
```ts
  if (c.includes('router'))   return 'router'
  if (c.includes('switch') || c.includes('bridge')) return 'switch'
  if (c.includes('firewall')) return 'firewall'
  if (c.includes('station') || c.includes('host')) return 'server'
  if (c.includes('wlan') || c.includes('ap'))      return 'ap'
```
IOS LLDP prints `System Capabilities: B,R` (letter codes), which gives
`'unknown'`. Order matters: `Router Switch` gives `'router'`. `'ap'` is a
substring test, so any capability text containing "ap" that reaches l.116
gives `'ap'`.

**P4. Neighbors are not deduplicated.** A device seen on two local ports
gives two nodes with different uuids (l.78-103). There is no merge with nodes
already stored.

**P5. Only the first match per block is used.** For example, CDP
`IP address:` (l.51) takes the first entry address. LLDP `Port id:` (l.83) is
case-insensitive, so it also matches `Port ID:`.

**P6. The link label uses an em dash** (`' — '`, l.71, 100) and `'?'` for a
missing side. This is byte-relevant for goldens.

---

## Unrelated reference found while grepping

`src/components/ObservabilityPane.tsx:74` mentions `runCommandGetOutput` only
in a comment, and calls `window.api.normalize.rawCommand` (l.78). `preload.ts`
does not define that method (the `normalize` block, l.195-204, has
`interfaces/bgp/arp/device`), so the optional call yields `undefined` → `''`.
It does not reach any function above. It is noted here only so the grep
result is accounted for.
