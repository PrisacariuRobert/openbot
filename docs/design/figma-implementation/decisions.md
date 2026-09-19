# D1 decisions

- Owner changed the primary client to Electron and selected shared desktop/phone web UI. Native source is recoverable in Git history. Backend APNs/native compatibility endpoints remain so source cleanup does not delete stored registrations or break previous clients.
- Inter Variable from the licensed fontsource package matches Figma typography; no font copied from an external runtime.
- Existing customizable vector mascots retained. Face mark downloaded through the Figma MCP asset route; no interactive surface flattened to an image.
- Returned documents use stored attachment text, file URL, source and revision. Label is "REVISION", not "DRAFT": the backend does not promise editorial draft status. Review disclosures remain truthful; no fabricated Scout approval. The comparison fixture omits a confirmed Monday routine because none was scheduled.
- Plus menu retains file upload, recipient and safety controls. Existing submission/draft/approval/recovery logic remains in use.
- Installer workflow now stages the runtime and consumes actual desktop/release outputs. Draft release workflow only. The first local builder attempt unexpectedly auto-selected an Apple Development identity and was interrupted. Explicit `mac.identity: null` and `CSC_IDENTITY_AUTO_DISCOVERY=false` now disable signing; the replacement package log confirms signing was skipped. No notarization or release was performed. Windows/Linux and Intel Mac acceptance require their CI hosts; this machine validates Apple silicon.
