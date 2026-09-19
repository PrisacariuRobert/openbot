# OpenBot desktop beta — unsigned candidate

One shared interface now serves Electron on macOS, Windows and Linux, and phone browsers through an authenticated HTTPS host. The SwiftUI clients have been retired from the source tree; historical native QA reports are not acceptance evidence for this candidate.

Installers embed the host runtime. Existing homes must retain their database and matching vault key; no automatic migration or native-to-Electron data import is performed. See desktop/README.md for explicit existing-host/data configuration.

These artifacts are unsigned and have not been notarized. There is no automatic updater, App Store phone package, or claim of physical-device acceptance. Review the exact candidate's test evidence before publishing. Model credentials and connected accounts are not bundled.
