# OpenBot development preview and beta downloads

The [first-public-release checklist](FIRST_PUBLIC_RELEASE.md) defines the supported release gate. No public desktop installer is approved by this document. Older unsigned-archive instructions described a development experiment and are not a current download promise.

## Continue without a paid developer account

Run the shared client from source using the [README setup](../README.md#start). On a Mac, the [Electron development shell](../desktop/README.md#develop) opens that same UI. You can build an unsigned local package with `npm run package:desktop -- --dir` and test it with disposable data. This path does not need Apple Developer Program membership or an OpenBot Google OAuth client.

The first useful path is a conversation with a teammate using a model connection you choose. For supported website tasks, grant that teammate browser access and sign in yourself when needed. Chrome or Chromium is separate from the package. A model provider or website may have its own usage terms or costs; OpenBot does not include model allowance. Direct API connectors are optional and may require developer credentials or service review.

## Limited unsigned Mac pilot

An unsigned package may be shared only as a clearly labeled development build with consenting testers after testing the exact artifact and its recovery on their machines. A checksum helps detect a changed download but cannot prove who published it. macOS can block an unknown or unnotarized app; a tester may have to use the Privacy & Security **Open Anyway** control. This is a poor first-run experience and does not meet the trusted public Mac installer gate. Never ask a tester to disable Gatekeeper. [Apple's guidance](https://support.apple.com/en-au/102445) describes the manual override and its limits.

The public Mac download remains a later milestone: Developer ID signing, notarization, Gatekeeper acceptance, and clean installation on two independent Macs. [Apple's Developer ID guidance](https://developer.apple.com/developer-id/) explains the publisher identity requirement. Windows and Linux installers also need their own clean-machine checks before they are advertised as supported. Phone access uses the shared web UI and an owner-operated, reachable host; it is not an included cloud service.

No tag, release, website upload, or distribution is authorized by this page.
