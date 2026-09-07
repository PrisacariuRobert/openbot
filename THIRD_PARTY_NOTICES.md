# Third-party notices

OpenBot's original source is licensed under [MIT](LICENSE). Third-party code, methods, packages and service marks retain their own notices; the root license does not relicense them.

## Included skill adaptations

The bounded Markdown methods in `skills/bundled/` include adaptations from NousResearch's Hermes Agent, pinned to commit `622883bad7f55f56a6393cd994e36c65fbdff253`. Exact source files are recorded in [catalog.json](skills/bundled/catalog.json). Preserve the [bundled MIT notice](skills/bundled/LICENSE), including the upstream contributor attributions for productivity methods and the systematic-debugging method originating with Jesse Vincent's superpowers project.

These are OpenBot-specific adaptations. They do not bundle Hermes's Python runtime, import its entire plugin catalog or imply that every Hermes plugin is compatible.

## Security-guidance adaptation

`src/server/code-security-guidance.ts` includes selected security-guidance patterns with Apache-2.0 provenance. Preserve both the [adaptation notice](skills/bundled/licenses/SECURITY-GUIDANCE-NOTICE.txt) and [Apache License 2.0 text](skills/bundled/licenses/SECURITY-GUIDANCE-APACHE-2.0.txt), including their recorded upstream references and OpenBot modifications.

## Dependencies and distribution

`package-lock.json` pins JavaScript dependency resolutions. Each dependency retains the license and notice files distributed with it; a source checkout does not include `node_modules`. Native bundles and Docker images that include dependencies must also retain the applicable notices. Before each downloadable release, review the resolved production dependency license inventory and ship that inventory/notices with the artifact. This document is not a claim that all transitive dependency licenses have been independently audited.

OpenCode, Claude Code, Chrome/Chromium, Docker, Xcode and provider services have their own licenses or terms. Some are installed separately; private-runner images may include additional tools. Review the exact artifact, not just this repository's root license. Choosing a model does not grant a subscription, API balance or third-party trademark rights.

## Identity and references

The native `ios/Shared/BrandAssets.xcassets` catalog bundles monochrome service artwork from [Simple Icons 15.15.0](https://github.com/simple-icons/simple-icons/tree/15.15.0/icons), distributed under [CC0-1.0](https://github.com/simple-icons/simple-icons/blob/15.15.0/LICENSE.md). Files are preserved as vector assets and render offline; this does not grant trademark rights. The OpenCode app mark is supplied separately by [OpenCode's official identity package](https://github.com/anomalyco/opencode/blob/dev/packages/identity/mark.svg), linked from its [brand resources](https://opencode.ai/brand); its original artwork is retained rather than replaced by a generic processor symbol. These marks identify user-selectable services, never OpenBot's own branding or an endorsement.

Gmail, Google Drive, Google Calendar, Slack, Notion, GitHub and other service marks identify compatible services and remain the property of their respective owners. OpenBot is independent and is not endorsed by those providers, Grok Bot, Cursor, Apple, NousResearch or Hermes Agent. Competitor research is reference material, not an asset license; do not redistribute competitor screenshots, mascots or product graphics in release branding without permission.
