# Mac acceptance

Checks Sidemates against a real Mac (task J3). Run it on a **demo macOS account**, never your own: the kit reads that account's Mail, Calendar, Notes, Reminders and Contacts, and `--write` adds items to it. Each run writes a dated report here, with counts, timings and pass/fail only.

## Set up the demo account once

1. Create a new macOS user (System Settings → Users & Groups) and sign in to it. Add one mail account to Mail (a free test address is fine).
2. Create the demo items. Each name must match exactly:
   - In Calendar, a calendar called **Sidemates Acceptance**, with an event titled **Sidemates acceptance** this week.
   - In Reminders, a list called **Sidemates Acceptance**.
   - In Notes, a folder called **Sidemates Acceptance**, with a note titled **Sidemates acceptance**.
   - In Contacts, a contact called **Sidemates Demo** with the address `demo@sidemates.example`.
   - In Mail, send yourself an email with the subject **Sidemates acceptance**.
3. Install Sidemates with the one-line install or the disk image, and note which.

## Run the kit

From a Sidemates source checkout on that account:

```sh
node --import tsx scripts/mac-acceptance.ts            # reads only
node --import tsx scripts/mac-acceptance.ts --write    # also adds a reminder, a note, an event and a Mail draft, in the demo list, folder and calendar
```

macOS asks for Automation access the first time each app is used; allow it. Give Terminal (or Sidemates) Full Disk Access for the Messages check. After `--write`, check that a Mail draft opened, then discard it.

The report lands in `qa/mac-acceptance/<date>-macos-<version>-<arch>.md`. Fill in "Checked by hand" and commit it.

## Checked by hand

**Permission prompts after a fresh install.** On a demo account that has never run Sidemates (or after `tccutil reset AppleEvents`, `tccutil reset SystemPolicyAllFiles` and the uninstaller), install, then ask the first teammate "What's on my plate today?":
- macOS should ask for Calendar and Reminders once each, naming **Sidemates** (not "node").
- After a denial, the studio should point to Privacy & Security → Automation.

**Permission prompts after an update.** Install the previous release, allow everything, then update. Nothing already allowed should be asked again.

**A routine wakes the Mac.**
1. Set a routine for ten minutes from now and turn on "Wake this Mac for routines" (macOS asks for your password once).
2. Put the Mac to sleep on power.
3. The routine's result should be in the conversation when you come back, and `pmset -g log | grep -i wake` should show the wake.

## macOS 27

The kit reports three things that change on macOS 27:
- The privacy-permission database can't be read directly, so Sidemates' permission checks must probe instead.
- Other apps' containers are closed by default, so Notes is read through Notes itself.
- launchd refuses a launch agent that carries the download mark. The installer clears it; the kit checks the installed agent.

The first two are reported as information, with what this macOS does. Run the kit on macOS 15, 26 and 27 (macOS 27 runs only on Apple silicon).
