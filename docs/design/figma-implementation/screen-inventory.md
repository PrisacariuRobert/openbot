# Figma inventory and implementation mapping

Read-only inspection: file `fZ7KpYRKLnsCJRKUKzJcyW`, 2026-09-19. All twelve pages inspected. Pages 09–11 are the refined authority; older product frames are historical context. The MCP top-level metadata list initially omitted unloaded pages; a read-only Plugin API query supplied the complete inventory.

## Runtime destinations

| Refined family | Live surface |
| --- | --- |
| J12 team, import, restore | `?panel=team`; real roster, profile preview, import and restore |
| J15 AI, account/key/local setup | `?panel=provider`; existing provider discovery, saved test receipts and model choice |
| J15C / A01–A03 apps | `?panel=connectors`; real connectors, account recovery, access and disconnect |
| J13/J14 automations | `?panel=routines`; existing schedule/trigger editor, history and pause |
| J16 permissions | `?panel=control`; actual per-teammate boundaries and workspace safety controls |
| J17 allowance and budgets | `?panel=usage`; host usage and teammate budgets; exact task allowance remains in RunControls |
| J18, S01/S02 memory/skills/MCP | `?panel=teach`; restored access to memory and MCP tabs; checks/version controls retained |
| J22 / C01/C02 code | `?panel=projects`; existing isolated workspaces, diffs, checks and reviewed publication |
| J19 results / S03 private files | `?panel=artifacts` / `?panel=files`; actual files and identity |
| J20 recovery | `?panel=live`; existing run/action receipts and uncertainty |
| J21 phone / M10 | `?panel=remote`; actual host connection setup, responsive shared workspace |
| S04 computer / J11 browser | `?panel=computer` and existing private-browser watch/takeover surfaces |
| P/J profile and create | Existing dialogs with refined surfaces; live teammate editor |
| J09 document/revisions | Stored attachment preview beside conversation; explicit ancestry, original download, draft revision request |
| J01 welcome | Empty-studio personality panel and existing creation/connection workflow |
| J06/J07/J08/J10, F01–F05 | Existing task, exact approval, receipts, send/attachment/draft recovery; shared refined status/error surfaces |

Prototype success text, connected accounts, timing and permissions are never seeded into production UI. Missing live records render existing empty/loading/error states. A design frame is a visual/state reference, not a second route or proof of a live account operation. Direct document editing is intentionally unavailable: the host stores immutable attachments; revisions are requested through the existing draft/send path.

## Refined source frames


### Page 69:37

- `69:38` — P01 · Conversation — personally made
- `74:341` — P · Add to message
- `74:382` — P · Conversation menu
- `74:420` — P · Pixel — a teammate, not a setting
- `74:477` — P · A second pair of eyes
- `75:414` — P02 · The draft, beside the conversation
- `75:729` — P · Edit Pixel / considered controls
- `80:690` — P03 · Browser — watch
- `80:1003` — P04 · Browser — you are in control
- `81:1096` — P · Monday check-in
- `81:1136` — P · AI connection
- `81:1148` — P · Pixel access
- `81:1189` — P · Pixel memory
- `81:1212` — P · Create a teammate
- `81:1272` — P · Search
- `81:1290` — P · A little Pixel
- `81:1328` — P05 · A small reaction
- `86:1506` — P06 · Add — at your fingertips
- `86:1607` — P07 · Pixel — close to the conversation
- `86:1720` — P08 · Conversation options

### Page 99:37

- `99:38` — Section · Start with a little personality
- `99:41` — J01 · Welcome · good work starts here
- `99:324` — J02 · Your AI · a deliberate choice
- `99:379` — J02T · Connection tested · ready for a name
- `99:439` — J03 · Create Finch · a useful little personality
- `100:224` — J04 · Finch is here · begin with something small
- `100:286` — J05 · Bring a familiar face · import preview
- `100:353` — J02E · Connection trouble · useful recovery
- `100:405` — J03A · Teammate details · power without clutter
- `101:287` — J06 · Working · one accountable teammate
- `101:741` — J07 · Review · the exact action, not a blanket grant
- `101:1109` — J07R · Reviewed · ready to decide
- `101:1354` — J08 · Sent · a result you can inspect
- `101:1734` — J10 · Uncertain outcome · never send twice blindly
- `101:2101` — J06S · Stopped · honest about what remains
- `103:1523` — J12 · Your team
- `103:2023` — J13 · Automations
- `103:2496` — J15 · Your AI
- `103:2965` — J15C · Apps & tools
- `103:3430` — J16 · Permissions
- `103:3897` — J17 · Usage & limits
- `103:4352` — J18 · Memory & skills
- `103:4817` — J22 · Projects
- `105:3238` — J19 · Files & results
- `105:3629` — J20 · Activity & recovery
- `105:4013` — J21 · Your phone
- `105:4391` — J09 · The draft stays beside the conversation
- `105:4668` — J11 · Browser · watch without granting control
- `105:4954` — J11T · Browser · your turn
- `105:5240` — Extension implementation notes
- `106:4481` — J02K · Connect with an API key
- `106:4507` — J02A · Use your supported account
- `106:4552` — J02L · Use a local model
- `106:4588` — J05P · Choose the profile to inspect
- `106:4620` — J06C · A second pair of eyes
- `106:4667` — J08D · The action and its receipt
- `106:4710` — J09R · Ask for a revision
- `106:4751` — J09R2 · Revision requested
- `106:4786` — J09V · Version history
- `106:4818` — J14 · A Monday check-in
- `106:4891` — J14P · This check-in is paused
- `106:4925` — J14E · Adjust the check-in
- `106:4961` — J16B · Review Pixel’s browser access
- `106:5003` — J17B · A little more allowance?
- `106:5048` — J17BR · Review the allowance change
- `106:5083` — J18E · What Pixel remembers
- `106:5112` — J22D · A change you can inspect
- `106:5162` — J21P · Connect your phone
- `106:5207` — J19S · Find something
- `106:5252` — J11S · Browser session details
- `108:4758` — M00 · Your conversations
- `108:4869` — M01 · Pixel · returned work
- `108:4961` — M02 · An exact action to review
- `108:5026` — M02R · Reviewed, ready to decide
- `108:5089` — M03 · Confirmed result
- `108:5158` — M04 · The whole page on your phone
- `110:4956` — JADD · Add to message
- `110:4993` — JMENU · Conversation
- `110:5037` — JARCHIVE · Archive this conversation?
- `110:5052` — JARCHIVED · Archived, not gone.
- `110:5066` — JREMOVE · Remove Pixel from your team?
- `110:5081` — JREMOVED · Pixel’s data is recoverable
- `110:5103` — JPIN · Keep Pixel close
- `110:5127` — JEDIT · Edit Pixel
- `110:5260` — JPROFILE · Pixel, your teammate
- `110:5322` — JSTICKER · A little Pixel
- `110:5360` — JSTICKERSENT · A little personality.
- `110:5381` — J17B100 · 100,000-token allowance
- `110:5426` — J17BR100 · 100,000-token allowance
- `110:5461` — J17B250 · 250,000-token allowance
- `110:5506` — J17BR250 · 250,000-token allowance
- `111:5207` — J00 · The approved conversation · start here
- `111:5529` — JREPLY · A reply keeps its context
- `111:5859` — JMESSAGE · Message actions
- `111:5877` — JDARK · Review · considered after dark
- `113:5865` — JSCOUT · Scout — a conversation of their own
- `113:6179` — JNOVA · Nova — a conversation of their own
- `113:6499` — JSAGE · Sage — a conversation of their own
- `113:6807` — JATLAS · Atlas — a conversation of their own
- `113:7118` — JFINCH · Finch — a conversation of their own
- `119:6851` — JPADD · Add, beside the composer
- `119:7203` — JPMENU · Options, beside the control
- `119:7552` — JPPROFILE · Pixel, close to the conversation
- `120:7605` — J09V1 · Earlier draft — read only
- `120:7883` — JCOPIED · Copy confirmation
- `122:7809` — J10D · Original action — outcome unconfirmed
- `122:7840` — JPR · Publish one new pull request
- `122:7864` — JPRR · Reviewed publication
- `122:7889` — JPRS · Publication requested — awaiting confirmation

### Page 130:7830

- `130:7831` — A01 · Connected app · account & access
- `130:7924` — A02 · Connected app · expired session
- `130:8017` — A03 · Connected app · disconnect review
- `130:8110` — S01 · Skill detail · checks & versions
- `130:8203` — S02 · MCP server · configuration
- `130:8296` — S03 · Private teammate files
- `130:8389` — S04 · Computer access · setup & boundary
- `130:8482` — C01 · Code change · inspect diff
- `130:8575` — C02 · Code change · checks & evidence
- `130:8668` — F01 · Message failed · retry without losing context
- `130:8722` — F02 · Attachment failed · draft preserved
- `130:8776` — F03 · Reconnect · draft still here
- `130:8830` — F04 · Restore teammate · recoverable data
- `130:8840` — M10 · Phone · settings & permissions
- `130:8886` — M11 · Phone · browser handoff
- `130:8909` — D10 · Dark · everyday conversation
- `130:8969` — Final pass · implementation coverage
- `133:2654` — F05 · Settings change failed · shared pattern
- `133:2676` — A11 · Accessibility & motion rules
