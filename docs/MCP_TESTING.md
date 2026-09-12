# Testing OpenBot through MCP — the direction check

`mcp/openbot.ts` exposes the owner's local studio as MCP tools so an AI
assistant can drive the whole app end to end and judge whether it is going
in the right direction (~100 tools). Standard profile: state, messaging
(with attachment binding + idempotency keys), approvals (+preview, run
approve, recall, resolve, token allowance), runs, receipts, evidence
exports, bots (+update), groups, routines (+activity), skills (+list,
import, templates, assign), browser views/snapshots/sites, connectors,
providers, auto-review listing, memory, search, artifacts (+reads),
work sources/reports, projects (+reviews), computer status, app
screenshots. Full profile (`OPENBOT_MCP_FULL=1`) adds: private browser
input, own-browser bridge, deletes, retires, settings, skill switches,
group/routine/project management, computer start, provider choice, staged
fixtures, real file-input uploads, download capture, multi-session tester
browser (desktop + emulated viewports), rich actions (refs, chords, drag,
select), bounded waits, dialog control, and the event journal. This is the
harness behind "test absolutely everything".

## Setup (2 minutes)

The OpenBot server must be running (`http://127.0.0.1:4311` by default).
No new accounts, no new keys — the MCP server reads the studio's own
`access.token` next to it, exactly like the benchmark harness does.

**opencode** (`opencode.json` in the project, or `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "openbot": {
      "type": "local",
      "command": ["node", "--import", "tsx", "/Users/robert/Documents/openbot/mcp/openbot.ts"],
      "environment": { "OPENBOT_URL": "http://127.0.0.1:4311" },
      "enabled": true
    }
  }
}
```

**Claude Code** (`.mcp.json` in the project):

```json
{
  "mcpServers": {
    "openbot": {
      "command": "node",
      "args": ["--import", "tsx", "/Users/robert/Documents/openbot/mcp/openbot.ts"],
      "env": { "OPENBOT_URL": "http://127.0.0.1:4311" }
    }
  }
}
```

Restart the assistant so it picks the server up, then ask it to run the
sequence below.

> After any harness update: ChatGPT freezes the tool list when the app is
> created. Open the app → **Refresh** to pull the new tools before testing.

## Safety boundary

The base 15 tools observe everything and act through reversible owner
paths (send, decide, create, schedule). The remaining 13 tools are
**full access** — private browser input (`browser_takeover`,
`signin_control`), the own-browser bridge (`own_browser_open`,
`own_browser_import`), navigation and window opening, retires, deletes,
skill switches, settings, and browser sign-outs. They register only with
`OPENBOT_MCP_FULL=1` in the MCP client config:

```json
{
  "mcp": {
    "openbot": {
      "type": "local",
      "command": ["node", "--import", "tsx", "/Users/robert/Documents/openbot/mcp/openbot.ts"],
      "environment": {
        "OPENBOT_URL": "http://127.0.0.1:4311",
        "OPENBOT_MCP_FULL": "1"
      },
      "enabled": true
    }
  }
}
```

That flag is the owner's explicit consent — keep it in your own config,
never in a shared file. Even in full mode, cookie values and secrets are
never returned to the model (the bridge reports counts, not values), and
there is no tool that reads API keys. If an evaluation step needs a real
sign-in, the assistant must still stop and ask the owner.

## The evaluation sequence

Run in order. Each step states what "good" looks like.

1. **Boot & roster** — `studio_state`. Expect: the owner's real teammates
   with statuses, the team room, no errors. If the roster is empty, the app
   is in first-run state — note it, don't create noise.
2. **Simple task, full loop** — `send_message` to the team room ("In one
   sentence, what is 17 + 25? Reply with the number only."). Take the run
   id, `wait_for_run`, then `run_receipt`. Good: one answer, receipt with
   checks, tokens and cost recorded, no uncertainty left unexplained.
3. **Approval loop** — ask for something that needs approval (e.g. "Draft
   a short post and wait for my review before anything else."). When the
   run pauses, `studio_state` must show the pending approval with a clear
   reason; `decide_approval` with `denied` must stop it cleanly. Good:
   nothing executed while paused.
4. **Group discipline** — in the team room: "@nova and @pixel: Nova, give
   one tip for deep work; Pixel, reply to Nova's tip with one addition."
   Then watch: follow-ups must thread, caps must hold (≤3 rounds,
   ≤10 replies), silence must settle. `studio_state` on the thread shows
   the chain. Good: a short discussion, then quiet — no loops, one cap
   note at most if limits hit.
5. **Escalation** — have a teammate reply with "@user" (prompt: "Ask me
   a judgment call with @user and stop."). The thread must gain
   `needsYou: true` in `studio_state`. Reply as owner; it must clear.
6. **Receipt → skill** — `propose_skill` on the finished run from step 2.
   Good: a draft citing its evidence ("N/M checks verified on this
   host"); proposing twice returns the same draft, no duplicate.
7. **Routine draft** — `create_routine` with `enabled: false` (a draft
   that never fires). Good: it appears in `studio_state`, paused, with a
   next run computed. Do not enable live routines during evaluation.
8. **Team template** — `list_team_templates`, then `install_team_template`.
   Good: ordinary teammates arrive with no models and no access. (Clean
   up afterwards through the app UI if they pollute the roster — say so
   in the report.)
9. **Import preview** — `preview_profile_import` on `~/.hermes` or
   `~/.openclaw` if present, else skip with a note. Good: persona,
   memory and skill counts plus an explicit skipped list (keys, history).
   Never apply during evaluation.
10. **Sign-in review function** — `review_sign_in_url` on
    `https://accounts.google.com/` (expect ok) and
    `https://goog1e.com/login` (expect a look-alike warning).
11. **Skill parser** — `validate_skill_markdown` on a valid SKILL.md and
    on one with no frontmatter (expect a usable error, not a crash).
12. **Live browser view** — `browser_live_frame` for a teammate with a
    running browser. Good: a real JPEG of their page. If no browser is
    running, that is itself the honest answer ("not running"), not an
    error to fix by starting work unasked.
13. **Tester browser (full mode)** — `tester_session` for isolated
    desktop and emulated-narrow sessions; `tester_open_app` opens the
    studio with no teammate and no task. `tester_snapshot` gives refs,
    subtree and depth scoping; `tester_action` takes refs, selectors or
    coordinates (dblclick, hover, drag, chords, check, select — obscured
    targets fail, never force-click); `tester_upload` drives the real
    file input from staged fixtures; `tester_download` retrieves what
    the Download button actually produced; `tester_wait`,
    `tester_dialog` (explicit accept/dismiss only) and `tester_events`
    complete the loop. Ambiguous selectors, timeouts and dialogs return
    typed evidence, never assumed success.
14. **Independent evidence** — `messages_list`, `run_get`, `run_events`,
    `approval_get` for full records; `fixture_upload` a small known CSV
    to team-room, have a teammate total it, then `artifact_read` the
    produced file and check the numbers yourself. Never trust the bot's
    description of a file — read the bytes.

## Writing the verdict

Score 1–5 each, with one line of evidence per score:

- **Task completion** — did asked work finish correctly?
- **Attention honesty** — did pauses, badges and approvals say true things?
- **Bounds** — did caps, refusals and denials hold?
- **Evidence** — do receipts let a stranger verify what happened?
- **Direction** — does this feel like a team you own, or a demo?

Finish with: keep / fix / cut — one concrete item per bucket, referencing
the tool outputs. File notable findings in `docs/PRODUCT_GAP_AUDIT.md`
as a same-day follow-up so they become roadmap items instead of chat.
