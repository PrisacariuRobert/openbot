# QA: Live computer view and takeover

Added in the working tree supersedes the "snapshot, not a live feed" preview.
Surfaces: studio conversation pane, studio Agent Computer dialog, iPhone
teammate computer screen.

## What was built

- `GET /api/bots/:id/computer/live` (server-sent events, under the existing
  authenticated `/api` middleware) sends `status`, `frame` and heartbeat `ping`
  events. Frames are JPEG captures from Chromium's DevTools screencast on the
  bot's already-running browser page.
- `BrowserManager.startFrameSource` attaches only to an existing browser
  context, follows the bot's first page across navigation and tab changes, and
  reports `stopped` when no browser is open. A watchdog re-attaches when a task
  later opens the browser, so a viewer can watch work start live.
- `LiveViewHub` (`src/server/live-view.ts`) fans one source per bot out to any
  number of subscribers and stops the source when the last viewer leaves.
- Studio: `LiveComputer` (live preview in the conversation context pane) and
  `ComputerTakeover` (the takeover dialog). Takeover reuses the existing
  reviewed endpoints: `takeover/click`, `takeover/type`, `takeover/key`, and
  `browser/open`. No new write capability was introduced.
- iPhone: `ComputerView` consumes the same stream with the existing SSE
  `bytes.lines` pattern, unlocks tap-to-act behind an explicit Take control
  switch, and falls back to snapshot refreshes when the stream is unavailable.

## Evidence

- Unit tests (`src/server/live-view.test.ts`): one shared source per bot,
  fan-out to all viewers, stop-on-last-leave and fresh restart, a throwing
  viewer cannot break others, failed start reports unavailable and cleans up,
  and a viewer leaving during source startup does not leak the source.
- Live smoke test on a local dev studio (this verification, not CI): opening a
  page in Nova's browser produced `status: ready` plus an initial ~18 KB frame;
  a takeover click produced a follow-up frame delivered to two concurrent
  viewers (2 frames each); type/keys returned the existing reviewed takeover
  results; the 15-second ping arrived on schedule.
- `npm run check` passes; `npm test` passes 437/438 (1 pre-existing
  environment failure: ripgrep missing). `npm run check:ios` passes and the
  new Swift file parses.

## Safety boundaries

- Watching never starts a browser, container or model work, and grants no
  access. Takeover requires an explicit arm step, and only reaches an
  already-running browser for that teammate. Approvals, review fingerprints,
  website deny lists and the sign-in handoff flow are unchanged.
- The streamed picture is the same screen the owner can already fetch through
  the snapshot endpoint; the model never receives live frames.

## Remaining limits

- JPEG frames at CDP quality 58, viewport 1280×820, first page only. No
  WebRTC/MJPEG yet: continuously animating pages produce continuous frames.
- The buffer guard drops frames above an 8 MB backlog rather than providing
  exact backpressure.
- Long-lived SSE delivery through the away-access relay is unproven (the
  public relay is not deployed); the iPhone falls back to snapshot refresh.
- The macOS native app does not yet include a computer screen; visual latency
  tuning on real networks and iPhone device testing remain open.
