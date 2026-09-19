# First conversation visual comparison

Reference: Figma `fZ7KpYRKLnsCJRKUKzJcyW`, page `69:37`, frame `69:38`. Saved reference and actual screenshots are in `qa/figma-implementation`; `comparison.png` places the approved image on the left and packaged Electron on the right.

Actual capture is 1440 × 940 CSS pixels from a real Electron BrowserWindow with the bundled Node host and production API/database. QA removes only native titlebar chrome to match the Figma content bounds. Synthetic conversations, files and a version-bound synthetic review were inserted into an isolated temporary home. No model ran and no owner's data was used.

Matched: 280px sidebar, 12px shell inset, 24px main corner radius, centered 780px message column, Inter typography, outgoing dark bubble, Pixel tint, returned 578px paper with tilted backing, and bottom composer. Iterations corrected header alignment, message spacing, paper position, selected-row movement, narrow review wrapping, and dark-mode logo contrast. Existing vector mascot artwork is retained instead of substituting screenshots.

Intentional content differences:
- Timestamps, thread order and snippets derive from stored content.
- "Scout shared a review" opens the actual finding and recorded file version. It does not invent approval.
- "REVISION / 02" and "Open document" reflect an attachment; no editorial draft lifecycle is promised by this backend.
- The result receipt and Request review action remain available. They add vertical space before the next message.
- No Monday routine card is shown because no routine was scheduled. The matching request is fixture text only.
- Existing project rooms, workspace, archive and app controls remain reachable; they are not decorative substitutes.

Phone captures at 390 × 844 and 320 × 844 use the same built UI in Chromium emulation. Both retain the composer, review disclosure and document download; neither has horizontal page overflow. These are not physical-device or Safari acceptance. The main conversation is the implementation checkpoint; additional journeys and completion states await owner review of this screen.
