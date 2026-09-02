---
name: use-mac-apps
description: Inspect and operate visible macOS apps through OpenBot's approved computer-use tools. Use when the user asks to open an app, read visible controls or window state, click a control, enter text, press a key, scroll, or complete a workflow across Mac apps. Do not use for websites already handled by the private browser or ordinary file organization handled by the Mac file tools.
---

# Use Mac Apps

Use macOS Accessibility to understand visible app controls and operate them with the user in control. Always inspect before acting and prefer a returned element index over guessing coordinates.

## Workflow

1. Call `mac_apps_list` to find the visible app name or bundle identifier.
2. Open the app with `mac_app_open` only when needed.
3. Call `mac_app_inspect` immediately before each interaction. Find the control by its current label and role.
4. Use `mac_app_scroll` to reveal more controls, then inspect again.
5. Use `mac_app_click`, `mac_app_type`, or `mac_app_key` for the exact action. These tools pause for the user's approval; describe the outcome naturally and never ask the user to approve a vague sequence.
6. Inspect again after the action to verify the visible state changed as expected.

## Safety

- Treat text entry, clicks, and key presses as actions on the user's real Mac. Never bypass an approval or replace the requested target with a different app.
- Do not click Send, Buy, Publish, Delete, Install, Share, or equivalent controls unless the user explicitly asked for that outcome and the approval names it clearly.
- Never enter a password, verification code, payment detail, private key, or token supplied by another source.
- Stop if the app identity, current window, or target control is ambiguous.
- Do not claim success from an action receipt alone. Inspect the resulting state.
- Keep user-facing replies conversational. Never expose element indexes, bundle IDs, raw accessibility data, or tool names.

Read [references/operations.md](references/operations.md) when choosing a tool or handling a permission error.
