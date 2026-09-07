# OpenBot design language

**Intent:** a quiet place to work with a teammate, with personality in the characters—not a dashboard decorated with AI feature cards.

This contract describes the new `/studio.html` interface and the corresponding native source direction. The older `/` interface is not fully migrated. Native source changes and successful compilation do **not** mean the owner’s installed app has been updated. Keep release claims separate from this design contract.

## 1. Conversation is the product

The primary hierarchy is **conversations → the current task → optional context**. Keep the composer easy to find. Show files, decisions and useful results near the conversation that produced them. Computer controls, schedules, connections and teammate settings belong in contextual panels or familiar menus, not competing permanent hero sections.

A fresh studio invites the user to create a useful teammate; it does not invent an established team or fabricate a first reply. Preserve existing people’s teammates, messages and drafts. Personality must not delay the first useful action.

Apple’s principles favor familiar behavior, clear feedback and recovery that does not cost people their work. Those are interaction references, not a requirement to copy Apple’s visuals. [Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles).

## 2. Neutral surfaces, semantic meaning

- Use semantic tokens for canvas, sidebar, surface, text, separator, selection and focus. Do not scatter new hex colors through components.
- Light mode uses white and soft gray; dark mode uses layered dark grays and light foregrounds. Dark mode is not a blanket CSS inversion.
- Primary actions and outgoing messages use a contrasting neutral surface. Secondary text stays legible; separators are not text colors.
- State is communicated with words and symbols: “Working,” “Needs your approval,” “Not connected,” or “Try again.” Never depend on a green/red dot alone.
- Saturated identity color belongs to characters. A custom color picker may show the selected color; that is a control, not an interface accent. User attachments and live computer content are not recolored to enforce the theme.

Web authority: [`design-tokens.css`](../src/studio/design-tokens.css). Native authority: [`StudioPalette.swift`](../ios/OpenBotMobile/Models/StudioPalette.swift), shared by Mac and iPhone. Legacy names such as `purple` and `green` can resolve to neutral semantic colors; they are not permission to reintroduce purple buttons or green status panels.

Apple recommends appearance-aware semantic colors and testing contrast across appearances. Our monochrome palette is an OpenBot choice, not an Apple rule. [Apple color](https://developer.apple.com/design/human-interface-guidelines/color), [Apple Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

## 3. Type and spacing

Use the system font: SF on Apple platforms and the web’s system-font stack elsewhere. Native views use the default system design; monospaced type is reserved for code, file content and genuinely technical values. Do not embed Apple font files or use rounded display type for every label.

Hierarchy comes from restrained differences in size, weight and spacing. Use regular, medium and semibold for ordinary interface text. Prefer a readable label and one short explanation over uppercase microcopy, multiple badges and a paragraph of implementation detail. Leave breathing room inside controls, not just between cards.

Apple’s typography guidance treats legibility and hierarchy as primary. Its platform recommendations remain reference points for the release audit; some existing native advanced screens still contain small fixed-size text. [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography).

## 4. Menus should behave like menus

Use native SwiftUI `Menu`, `Picker` and context menus where appropriate. Web selections use [`ChoiceMenu`](../src/studio/ChoiceMenu.tsx), a browser top-layer popover—not an HTML imitation of a macOS window.

Preserve these behaviors:

- Enter/click opens; arrows move among enabled options. Home/End reach the first/last enabled option.
- Typeahead starts fresh when reopening. Enter selects. Selected and disabled states are explicit.
- Escape closes the menu and restores trigger focus without also closing its containing modal. Outside dismissal leaves focus with the user’s clicked destination.
- Position above or below as space permits; clamp width and scrolling to the viewport. A menu must work inside a modal and at narrow phone widths.
- Disable unavailable selection controls; provide a useful empty explanation where an empty list is intentionally inspectable.

Keep frequent commands easy to find and avoid deeply nested feature catalogs. [Apple menus](https://developer.apple.com/design/human-interface-guidelines/menus).

## 5. One original character family

Characters are editable vectors: SVG on web and SwiftUI Canvas on native, not decorative bitmap portraits. Their saved color belongs to their identity and must survive navigation and appearance changes.

| Saved ID | Identity |
| --- | --- |
| `nova` | Robot with antenna and side details |
| `blob` | Bubble |
| `sprout` | Sprout with leaves |
| `orbit` | Orbit with a ring |
| `pebble` | Asymmetric pebble |
| `sunny` | Sunny with rays |

Keep six genuinely distinct silhouettes. Web definitions live in [`mascot-catalog.ts`](../src/studio/mascot-catalog.ts) and [`Character.tsx`](../src/studio/Character.tsx); native definitions live in `StudioCharacter` in `StudioPalette.swift`. Mac and iPhone share the native renderer. Web and native share the **identity family and saved IDs**, not exact geometry, expression timing or pixel parity.

Use gentle independent blinks and movement. A character can acknowledge work, but must not obscure a message or pretend to prove that a task succeeded. Appearance editing changes only `mascot` and `color`, retains choices on failure, and prevents duplicate saves.

## 6. Accessibility is part of polish

Provide meaningful accessible names for icon actions, expose selected/expanded states, retain visible keyboard focus, and preserve natural reading order. Respect reduced motion; neither task status nor essential information may depend on animation.

Aim for comfortable 44-point primary iPhone touch targets and readable text enlargement. Current web form triggers are at least 44 CSS pixels; some compact mobile controls are 40 pixels. Do not claim every control meets a 44-point target or that all native screens support Dynamic Type fully. Screen-reader use, large text, increased contrast, keyboard-only use and both appearances remain release checks, not assumptions based on a passing screenshot test. [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

## 7. Honest access and recovery

“Browser enabled” is not “Gmail connected.” A connector and a website sign-in are separate ways to do work. Prefer supported, authorized structured tools; offer a permitted browser path when setup is missing. Never conceal an explicit access denial behind a fallback or advertise an unverified login as ready. See [Browser sign-ins and app connections](BROWSER_AND_CONNECTORS.md).

Errors should explain what happened, what was preserved, and the next useful action. Keep unsent work, do not silently change providers, and do not label a request “finished” before its outcome is known.

### 7.1 The app boots into the conversation (working-tree pass)

People feel a messaging app from its first second: it opens where the team talks, not on a setup screen. Choosing an AI connection is a deliberate follow-up, not a boot gate:

- Web, Mac and iPhone open straight into the conversation.
- When no provider is chosen, the composer stays usable. Trying to send opens the AI chooser immediately with the draft kept — a calm one-line affordance (web link above the composer, iOS pill, macOS hint), never a modal wall at boot.
- The owner always chooses the provider explicitly; nothing is pre-assigned or silently switched.

Premium feel comes from rhythm, not decoration: messages group like iMessage (tight spacing within a speaker's group, breath at group boundaries, sender identity at the head), bubbles carry hairline separation, and the mascots keep their playful blinks and work moods without ever blocking reading or status.

## 8. Change checklist

Before calling a design change complete: inspect 320/390-pixel and desktop layouts, light/dark appearances, keyboard and modal behavior, unsent-state recovery, and actual action payloads. Use [`StudioPolish.browser.ts`](../src/studio/StudioPolish.browser.ts) for the focused character/menu/appearance contract and the wider Studio/native checks for integration. A component fixture is not proof that every legacy screen, native installation or connected account has been verified.
