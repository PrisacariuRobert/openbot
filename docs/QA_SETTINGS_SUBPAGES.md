# Settings subpages — UI verification

September 8, 2026. This covers the shared Studio interface used by the web app
and Electron desktop shell. It is not a sign-off on the separate SwiftUI app or
real-account integrations.

## Changes

- One Settings drawer, stable width, full-screen phone layout, and a return path.
- Direct access to AI, apps, teammates, routines, phone access, permissions,
  projects, skills, workspace files, finished work, and Activity.
- Explicit layouts for expanded permission rows, teammate preferences, Activity
  computers, trigger forms, project access, teaching and connection details.
- Skills and calendar controls inherit the active light/dark theme. Hidden skill
  upload inputs no longer acquire full-width input styling and cause overflow.
- One Skills owner selector controls both included skill access and teaching.
- Character customization and conversation organization remain available as
  disclosures; no permissions or underlying capabilities were removed.

## Reproduce

```sh
npm run check
npm run check:acceptance
npm run build
OPENBOT_EXPANDED_SETTINGS=1 npm run test:unified-studio
npm run test:studio-polish
```

The expanded suite uses 1440px desktop and 390px phone widths in light and dark
themes. It opens all Settings routes and available disclosures, checks horizontal
containment, and captures the top, middle and end of the actual scrolling dialog.
It also opens API/custom-model forms, both project connection forms, nine routine
trigger types, four schedule variants, local MCP setup, extension Memory/Skills
tabs, and a sample file preview. Regression assertions cover hidden uploads,
readable project-owner names, skill-owner consistency, direct navigation,
browser back/forward and conversation draft preservation.

Screenshots and expanded-page text are saved to
`/tmp/openbot-unified-studio-qa`. The separate component suite covers keyboard
menus, modal focus, character customization and narrow layouts.

## Boundaries

Tests use disposable studio data and fixture project/file responses. They block
account, permission and task mutations; only a disposable conversation draft and
non-mutating schedule previews are allowed. They do not sign in, install a tool,
enable remote access, run a model, send a message or operate a personal account.
Connection-success, populated execution/recovery states and native SwiftUI/iOS
parity require separate end-to-end tests. Screenshots are visual evidence for
the tested states, not proof that every integration is connected or release-ready.
