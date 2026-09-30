# Golden-test fixtures

All fixtures are hand-written. They copy the layout of the example output in
public vendor documentation and are not taken from any customer device.
Addresses use the RFC 5737 / RFC 3849 documentation ranges (192.0.2.0/24,
198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32). AS numbers use the RFC 5398
documentation range (64496-64511). Serial numbers and keys are made up.

`tests/capture.ts` runs each file through the current code in `src/main/ipc/`.
`npm run golden` writes the results to `tests/golden/`, and `npm test` checks
them. Each normalize parser also gets `ios.txt` with CRLF line endings. The
conversion happens in code, so there is no separate CRLF file for git to
normalise.

| Fixture | Imitates (command, doc source) | Quirk it pins (docs/nsh/INVENTORY.md) |
|---|---|---|
| `normalize/interfaces/ios.txt` | `show interfaces`, Cisco IOS Interface and Hardware Component Command Reference | N1 (`administratively down` gives `down`), N2 (`up`/`down` gives `up`), N4 (prompt line skipped), N5 (BW wins) |
| `normalize/interfaces/nxos.txt` | `show interface`, Cisco Nexus 9000 NX-OS Interfaces Configuration Guide | Physical ports have no `line protocol`, so they are dropped. Only SVIs parse |
| `normalize/interfaces/junos.txt` | `show interfaces terse`, Juniper Junos OS CLI Reference | N3 (column use) |
| `normalize/interfaces/eos.txt` | `show interfaces`, Arista EOS User Manual, Ethernet Ports chapter | N1, N5 (`BW … kbit`) |
| `normalize/bgp/ios.txt` | `show ip bgp summary`, Cisco IOS IP Routing: BGP Command Reference | N7 (first row after the header dropped), N8 (`Idle (Admin)`), N9 (`1d02h`, `never`) |
| `normalize/bgp/nxos.txt` | `show bgp ipv4 unicast summary`, Cisco Nexus 9000 NX-OS Unicast Routing Configuration Guide | N7, IPv6 neighbor, `3w2d` |
| `normalize/bgp/junos.txt` | `show bgp summary`, Juniper Junos OS BGP User Guide | N6 (no `Neighbor V AS` header, gives `[]`) |
| `normalize/bgp/eos.txt` | `show ip bgp summary`, Arista EOS User Manual, BGP chapter | N7, N8 (`Estab 12 12` layout) |
| `normalize/arp/ios.txt` | `show ip arp`, Cisco IOS IP Addressing Services Command Reference | N11 (MAC case passed through), `Incomplete` row skipped |
| `normalize/arp/nxos.txt` | `show ip arp`, Cisco Nexus 9000 NX-OS Unicast Routing Configuration Guide | No `Internet` column, gives `[]` |
| `normalize/arp/junos.txt` | `show arp`, Juniper Junos OS CLI Reference | N10 (the MAC column comes first in doc output, gives `[]`) |
| `normalize/arp/eos.txt` | `show ip arp`, Arista EOS User Manual, IPv4 chapter | No `Internet` column, gives `[]` |
| `normalize/device/ios.txt` | `show version`, Cisco IOS XE (ISR 4000) command reference | N12 (model `IOS`, version `Cisco`) |
| `normalize/device/nxos.txt` | `show version`, Cisco Nexus 9000 NX-OS Fundamentals Configuration Guide | N12 (hostname `Kernel`) |
| `normalize/device/junos.txt` | `show version`, Juniper Junos OS CLI Reference | — |
| `normalize/device/eos.txt` | `show version`, Arista EOS User Manual | N12, N13 |
| `compliance/<vendor>.txt` | `show running-config` / `show configuration`, same guides as above | C2 (`ip http server` not last, so ios-12 passes), C6 (show-command checks fail on config text). Several checks fail |
| `templates/templates.json` | Jinja2 interface stanza in the style of the Ansible network examples | T1 (defaults, then override, then undeclared key), T3 (syntax error, `include` with a null loader) |
| `topology/lldp-ios.txt` | `show lldp neighbors detail`, Cisco IOS LAN Switching / LLDP Configuration Guide | P3 (`B,R` gives `unknown`), P5, P6 (em dash label) |
| `topology/cdp-ios.txt` | `show cdp neighbors detail`, Cisco IOS CDP Configuration Guide | CDP fallback (empty LLDP output), P2 (21-character LLDP error text parsed as LLDP, gives no nodes) |
