**Sidemates 0.42.0 — OpenBot is now Sidemates.** The same app, with a new name and a new home.

## Install or update (macOS 13+, Apple silicon or Intel)

```sh
curl -fsSL https://sidemates.app/install.sh | sh
```

Already on OpenBot? Tap **Update** in the sidebar, or run the same line (the old openbots.foundation link still works). Your teammates, chats and files stay. The first start moves your data folder from `~/Library/Application Support/OpenBot` to `~/Library/Application Support/Sidemates`, swaps the OpenBot app in Applications and the Dock for Sidemates, and stops the old background job. Nothing is deleted.

## What changed

- **A new name.** OpenBot was too close to other products' names, so we changed it early, while few people know it. The website is now sidemates.app and the project lives at github.com/PrisacariuRobert/sidemates.
- **macOS asks for permissions again.** Mail, Calendar and Full Disk Access are tied to the app's name and identity, so each one needs your OK once more. Nothing else about the app changes.
- **Old links and files still work.** Teammate links on openbots.foundation and `.openbot.json` files import as before; new exports are named `.sidemates.json`.
- **Under the hood.** Names such as the `OPENBOT_*` settings and the database file are unchanged, so nothing you saved can break. They will be renamed later, with a safe migration.

## Still true

- **Autopilot** (off by default, per teammate) lets a teammate act like a person without asking first. It still stops for sign-ins, CAPTCHAs, more AI spending and saving new instructions.
- **Mail and Messages need Full Disk Access** for Sidemates. The app explains this and opens the right page.
- **This is still a beta.** The Mac app is ad-hoc signed, not notarized; the one-line installer is the supported way to install it.

Full details are in the [changelog](https://github.com/PrisacariuRobert/sidemates/blob/main/CHANGELOG.md).
