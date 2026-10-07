# First-run timings

Task A2 is done when a fresh install reaches a first useful answer in a median of three minutes or less over five runs. Only the owner can run these, on a real Mac, so this folder holds the results. Until five runs are recorded here, nothing in the product or on the site claims a setup time.

## One run

1. Start on a Mac that has never run Sidemates, or remove it first with `"$HOME/Library/Application Support/Sidemates/uninstall.sh" --delete-data`. That deletes the studio too, so use a test Mac or account.
2. Reset the macOS permissions Sidemates may have been given, so the prompts appear as they would for someone new:
   `tccutil reset AppleEvents`, `tccutil reset SystemPolicyAllFiles` and `tccutil reset Accessibility` (these reset the setting for every app; run them only on a test Mac or account).
3. Start a stopwatch when you paste the install command into Terminal.
4. Follow the guided setup the way a new person would: choose an AI, keep the suggested model, create the teammate, pick the first suggestion and press Send.
5. Stop the stopwatch when the first useful answer appears.
6. Open **Settings → Your setup**, press **Copy**, and paste the text into a new file in this folder.

## What to record

Name the file `YYYY-MM-DD-run-N.md` and include:

- the date and the macOS version (`sw_vers -productVersion`), and whether the Mac is Apple silicon or Intel;
- the AI you chose and the model;
- the stopwatch time from paste to first answer;
- the Copy text from Settings → Your setup;
- anything that slowed you down or confused you, in a sentence each.

## The result

After five runs, add the median to the A2 entry in `docs/DEVELOPER_PLAN.md` and tick A2 if it is three minutes or less.
