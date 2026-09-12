# Saved files — implementation and verification

Each bot has an explicit saved-file library under Files. It associates an original
upload from that bot's direct thread with the bot. Library changes invalidate the
reused model session fingerprint. Later tasks receive private working copies and
an untrusted-data manifest, not write access to attachment originals.

Limits: 20 files per bot, 100 MiB aggregate; the existing upload limit also applies.
Same-name uploads retain separate IDs and SHA-256 identities. Removing a library
entry retains its original upload and prior messages. It cannot erase information
already read by a model. Unsafe workspace paths are not followed during cleanup.

## Verified locally on 12 September 2026

- TypeScript and production web build passed.
- Five saved-file tests passed: identity/isolation/fingerprint, extraction-name
  collision, persistence, same-name versions, source tampering, source/ancestor
  symlink protections and safe revocation.
- Eleven existing attachment/workspace/draft tests passed.
- Uploaded synthetic `openbot-saved-file-CV-TEST.txt` through Pixel's Files UI.
- Reload retained the entry; downloaded bytes and stored SHA-256 matched original.
- Later message run `378cc05e-913e-44fa-a0ae-951726d65d38` completed. Pixel correctly
  read `Demo Candidate` and `SAVED-CV-0926` without those values in the request.
- Narrow web layout inspected. No physical iPhone library UI validation yet.

## Browser upload implemented; live Pixel confirmation pending

Normal OpenCode and Claude browser tools now accept a saved-file ID through
`browser_upload_saved_file`. Mandatory review freezes original identity, hash,
size, MIME, destination and control fingerprint. Execution revalidates the
association and exact bytes, then selects an in-memory buffer on a captured DOM
file input. Changed origins/targets, non-unique or directory inputs are rejected.
Auto-approve does not bypass file selection review. Post-selection failures are
recorded as uncertain and require checking the website before retrying.

- Real BrowserManager fixture received exact bytes/name; changed fingerprint,
  origin and ambiguous selector were rejected. Simulated lost-page error after
  selection produced an uncertain outcome.
- Saved-file, browser-upload, review and tool availability checks: 10 passed.
- Existing approval preview/journal/route regression checks: 29 passed.
- Live Pixel attempts `56ce4362-a692-4d87-93af-7a85b29ba6c5` and
  `17b965d2-40f1-4234-a668-581bee73eebc` failed BEFORE model execution: runtime
  version probe returned unknown under heavy host load. Direct runtime command
  returned the supported 1.18.30. No upload reached the synthetic fixture.
- Improved unknown-probe wording in source; no runtime guard was bypassed.

Next: repeat normal Pixel -> review -> synthetic website acknowledgement once the
host responds reliably, then test an explicitly approved real destination.
Do not advertise completed job applications from a file-selection result alone.
Outgoing email/connector attachments and the native iPhone library remain gaps.
