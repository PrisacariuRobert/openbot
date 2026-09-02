# Changelog

## 0.10.0 — 2026-09-02

- Added one-step GitHub repository cloning into a clearly managed local projects folder
- Added separate-branch creation, bounded diff review, and exact-file commits for OpenCode and Claude Code teammates
- Added GitHub pull-request publishing through the official GitHub CLI, gated by passing task checks and a durable owner approval
- Added automatic restore points for every agent file edit; restore refuses to overwrite a file that changed afterward
- Upgraded Code projects with real GitHub marks, source links, branch/change review, expandable diffs, and a responsive safety-net activity trail
- Fixed approval intent so phrases such as “do not publish” and “never delete” no longer create a misleading approval; the dedicated action remains approval-gated
- Expanded the automated suite to 50 tests covering clone-link validation, branch isolation, unrelated-file protection, diffs, commits, and conflict-safe restore


## 0.9.0 — 2026-09-02

- Added an owner-approved coding harness for existing projects inside the user's home directory
- Added one-click project suggestions plus manual folder connection in a polished responsive Code projects panel
- Added independent **Code + test**, **Read only**, and **No access** settings for every teammate and project
- Added bounded project listing, fixed-string search, text reading, exact replacement, atomic file writing, Git status, and local edit history tools for OpenCode and Claude Code teammates
- Added disposable network-isolated project checks with a read-only container system, unprivileged host identity, dropped capabilities, resource limits, and hidden-secret/Git masks
- Added project-root, traversal, hidden-path, symbolic-link, binary, size, and capability enforcement; access changes also invalidate stale model sessions
- Added an honest marketing capability catalog that separates launch-ready features, setup-dependent features, and roadmap claims
- Expanded the automated suite to 47 tests covering per-teammate grants, safe edits, disconnect-without-delete, alias escape prevention, protected command views, and runtime tool exposure

## 0.8.0 — 2026-09-02

- Added a persistent completion contract to every substantial run: outcome, deliverable, required apps, approval boundary, three-to-eight meaningful steps, and a final verification record
- Added model tools for planning, milestone updates, and evidence-based verification in both OpenCode and Claude Code
- Added a compact live-job card with real checklist progress and a collapsible “Finished and checked” result receipt
- Preserved the existing job plan across approvals and resumed the same model session without resetting completed steps
- Kept greetings and casual conversation lightweight; a run becomes visibly tracked only when it is a real job or the model creates a plan
- Upgraded morning brief, meeting preparation, and follow-up starters with explicit deliverables, source checks, and no-send boundaries
- Replaced raw Google service errors in recent activity with clear recovery wording and contained the connections illustration at phone sizes
- Expanded the automated suite to 44 tests and verified the entire plan → work → reopen → check → receipt loop with a real model run

## 0.7.0 — 2026-09-02

- Added a per-teammate **Files on this Mac** permission for visible home folders
- Added bounded Mac folder listing and text reading for both OpenCode and Claude Code teammates
- Added approval-only batch organization that moves regular files into folders without deleting, overwriting, following aliases, or exposing hidden/system folders
- Replaced plain chat text with safe GitHub-flavored Markdown rendering for headings, lists, links, code, quotes, and tables
- Rebuilt connector card layout so long names, descriptions, status labels, and capability pills remain inside their borders
- Refined Google Calendar and Slack vector brand marks
- Organized 30 loose Desktop files into reversible Screenshots, Videos, Screen Recordings, Documents, and Archives folders
- Expanded the automated suite to 27 tests and verified a real Muse run could inspect the Desktop naturally

## 0.6.0 — 2026-09-01

- Added release-managed Google OAuth: packaged builds can expose a single Connect Google button through environment configuration
- Added a self-hosted JSON credentials-file flow that saves the client privately and opens Google sign-in without manual copying
- Expanded the Google connection to Gmail, Google Drive, and Google Calendar in one consent flow
- Added Drive search and supported document reading plus upcoming Calendar agenda tools for OpenCode and Claude Code teammates
- Added separate Inbox, sending, Drive, and Calendar access controls for every teammate
- Added real connection smoke buttons and previews for mail, recent Drive files, and upcoming Calendar events
- Added natural `@gmail`, `@drive`, and `@calendar` composer suggestions
- Added useful one-click starter workflows for morning briefs, meeting preparation, and follow-up drafts
- Expanded the automated suite to cover Workspace scopes, Drive search/read, Calendar events, tool exposure, and friendly progress

## 0.5.0 — 2026-09-01

- Added a real local Google OAuth connection using state, PKCE, offline refresh, and encrypted credentials
- Added Gmail inbox search, message reading, and plain-text sending for both OpenCode and Claude Code teammates
- Added per-teammate Gmail read/send permissions and server enforcement for browser/computer capability switches
- Made Gmail sending approval-only, with recipient, subject, and message preview visible before allowing once
- Fixed the task-card approval path so saved terminal, browser, and Gmail actions execute exactly once before the bot continues
- Added a premium responsive Apps & Tools surface with recognizable service marks, guided setup, inbox preview, honest availability, and private activity history
- Added connector persistence, audit records, mocked Google/Gmail coverage, and expanded launch documentation
- Kept Drive, Calendar, Slack, Notion, and GitHub clearly labeled as upcoming rather than presenting placeholders as working integrations

## 0.4.0 — 2026-09-01

- Added server-enforced `@name`, multi-bot, and `@everyone` routing
- Added automatic role-based owner selection for untagged studio messages
- Added six-file/25 MB attachments with private bot inbox materialization and hardened downloads
- Added browser voice typing and a guided installable phone-remote experience
- Added live/reconnecting/offline connection state
- Added independent mascot timing and laugh expressions
- Hardened dynamic mobile viewport, safe-area, touch-target, and overflow behavior
- Made message ordering deterministic for identical timestamps
- Added constant-time remote access-key checks
- Expanded the automated suite to 21 tests and added launch-readiness reporting
- Replaced provider placeholders with recognizable brand marks and changed AI/tool receipts into natural user-facing language
