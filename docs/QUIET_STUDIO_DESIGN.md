# Quiet Studio · 0.37 working-tree design

## Product direction

Robert's brief: a useful, premium application for ordinary people, not a power-user dashboard or a generated landing page. Black, white and neutral grays throughout the application; playful mascots stay colorful, animated and recolorable. Real user content (such as photos and browser pages) must not be desaturated.

The design uses Apple's guidance on [layout and grouping](https://developer.apple.com/design/human-interface-guidelines/layout), [limiting prominent buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [system typography](https://developer.apple.com/design/human-interface-guidelines/typography), and [not relying on color alone](https://developer.apple.com/design/human-interface-guidelines/color). These are design references, not an Apple endorsement or a claim of full HIG/accessibility compliance.

## Each area has a purpose

| Area | Interaction |
| --- | --- |
| Conversations | The conversation is the main surface. Welcome artwork leaves when real conversation begins. User messages are soft gray; replies are readable text with real Markdown. |
| Settings | A small set of grouped destinations. Advanced controls are disclosed, not removed. |
| Automations | A month calendar, time and repeat choice replace the schedule-button wall. Recurring dots indicate weekdays, not proof of a completed run. The host confirms upcoming occurrences. |
| Apps & tools | Search by app or description, then open its actual setup/access section with focus moved to it. Known Google/OAuth errors expand the affected section. Daily-work tools and custom extensions have distinct disclosure groups. |
| Activity | Current work and approval requests lead; idle computers are available on demand. No fabricated completion percentages. |
| Skills | Search included methods. Teaching is reachable before the catalog and explains Show, Review, Check. A recording remains a draft until reviewed and checked. |

## Shared visual rules

- Ink `#1d1d1d`, paper `#ffffff`, sidebar `#f5f5f5`, separators `#e5e5e5`.
- System fonts, restrained weights, text-first status indicators, visible focus rings.
- No promotional gradient banners or huge ambient shadows. One clear primary action per task area.
- Native shared tokens: `StudioPalette.swift`; web composition: `studio-design.css` plus focused component styles.
- Mascot drawings remain code-native. Do not replace them with flattened image assets or grayscale their ancestors. Respect Reduce Motion.
- Current native candidates explicitly use the light monochrome theme. A complete adaptive dark appearance remains separate work.

## Calendar behavior

The web uses date-only Temporal arithmetic for the Monday-first month grid, including leap days and year boundaries. Arrow keys, Home/End, Page Up/Down and Enter support date selection. One-time wall times use the saved zone; missing/repeated daylight-saving times are rejected, and a stale server preview cannot re-enable an invalid edit.

Mac and iPhone share a recurrence-pattern calendar and native graphical date selection for one-time jobs. Actual future runs on all clients come from the existing host preview endpoint. Native date controls select an instant; web rejects ambiguous manually entered wall times. No new monthly recurrence, start/end date or holiday-exclusion support is implied. The execution host still needs to be awake.

## Verification

- `npm run verify`: release/source checks, 325 unit tests, TypeScript, acceptance TypeScript and production build.
- `npm run test:studio-design`: isolated desktop 1440px, phone 390px and narrow phone 320px screenshots; panel navigation, app/skill search, setup focus, advanced disclosure, Escape, overflow, monochrome pixels outside mascots, colorful animated mascots and reduced motion.
- `npm run test:calendar-routines`: actual isolated API + browser creation, recurrence preview/save agreement, one-time keyboard date selection, empty-time invalidation, saved Brussels date/time, persistence and no model dispatch.
- Recipe/memory, work-source/follow-up and skill-check browser regressions exercise actual isolated owner APIs. No live account or model is used.
- Native Xcode tests: 20 Mac and 12 iPhone model tests; native views also compile. These are not native visual or VoiceOver tests.

## Honest handoff boundaries

The changes are in the working tree, not a merged or distributed release. The native candidates are built/tested, not installed over the owner's preview app. Actual native-window review, larger accessibility text, VoiceOver, full native interaction parity and clean-install distribution remain to verify. Browser visual fixtures are not proof of competitor parity. The existing production bundle-size warning remains.

Screenshots from the isolated browser fixture are written to `/tmp/openbot-quiet-studio-qa`; the tests can reproduce them. They contain synthetic conversations, not the owner's private chats.
