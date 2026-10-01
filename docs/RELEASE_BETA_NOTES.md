**OpenBot 0.41.1 — tidier screens, easier install.** A small update after Autopilot.

## Install or update (macOS 13+, Apple silicon or Intel)

```sh
curl -fsSL https://openbots.foundation/install.sh | sh
```

Already on 0.41? Tap **Update** in OpenBot's sidebar, or run the same line. Your teammates, chats and files stay.

## What changed

- **The morning brief card is fixed.** Its fields lined up badly, a label wrapped and the notice broke across lines. It is now a clean two-column form in light and dark, and on a phone.
- **Tidier new screens.** "What they know", the preview you get when someone shares a teammate with you, and "Add from a link" got the same cleanup.
- **An easier install.** The installer shows a progress bar and how long to expect, and downloads through openbots.foundation (about five times faster in our testing), falling back to GitHub if needed. The fingerprint check is unchanged.

## Still true from 0.41

- **Autopilot** (off by default, per teammate) lets a teammate act like a person without asking first. It still stops for sign-ins, CAPTCHAs, more AI spending and saving new instructions.
- **Mail and Messages need Full Disk Access** for OpenBot. The app explains this and opens the right page.
- **This is still a beta.** The Mac app is ad-hoc signed, not notarized; the one-line installer is the supported way to install it.

Full details are in the [changelog](https://github.com/PrisacariuRobert/openbot/blob/main/CHANGELOG.md).
