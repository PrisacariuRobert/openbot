# Grok Bot: observed interface references

Visual review: 2026-09-05. These are third-party annotated app captures, not an authenticated product test. No competitor artwork is being incorporated into OpenBot.

## References actually inspected

Source: [Grok Bot Masterclass, Daily Dose of Data Science, August 19](https://www.dailydoseofds.com/p/grok-bot-masterclass/).

- [Bot profile screenshot](https://substack-post-media.s3.amazonaws.com/public/images/f7ec1185-0b88-40e7-bf60-0d81795e14c7_650x558.png): a single colorful avatar above Name, Title and Description in a restrained dark panel.
- [Chat and profile side by side](https://substack-post-media.s3.amazonaws.com/public/images/e67b96e9-51ae-4e80-82df-1ed714066a0e_680x386.png): a conversation shapes the bot's role while the profile remains alongside it. Green explanatory labels belong to the tutorial, not the product chrome.
- [Chat and computer side by side](https://substack-post-media.s3.amazonaws.com/public/images/649426c0-5977-4d64-a9c6-a4e13f7910fd_728x392.png): an inline Gmail connection choice sits in the conversation; a computer preview occupies the adjacent pane. The green arrow and highlight are tutorial annotations.

Cross-check: [official first-agent guide](https://cursor.com/help/grok-bot/getting-started) documents user creation of a first agent with name, shape, color and title, followed by a first task. [Official daily work guide](https://cursor.com/docs/grok-bot/work) recommends separate bots for distinct goals, tools, working styles, approval boundaries or schedules. These do not establish that every new account automatically generates a team.

Excluded references: generic Grok-chat/Telegram image-search results; explanatory drawings in the Japanese hands-on review; generic agent-skills diagrams. They are not evidence of Grok Bot's actual interface. The official marketing page was readable through search, but direct visual browsing was unavailable; do not claim to have operated or visually reviewed its interactive demo.

## Design inference for OpenBot

The familiar pattern is messaging a named person, with secondary context alongside the conversation. The emotional connection comes from a user-owned identity, not a preset cast presented on a promotional home screen.

1. A new studio starts with creating its first teammate, not a permanently prescribed Nova/Pixel/Scout team. Preserve existing users' bots and history.
2. Offer both direct customization and a task-led setup path. Clearly distinguish a suggested profile from a created/running bot. Keep provider choice explicit.
3. Make the conversation the everyday workspace. On desktop, profile, results and computer views should open in context alongside it; on phone, use a focused detail view with a clear return to the same conversation.
4. Ask to connect a service at the relevant moment, explaining why. Do not imply that a connected account grants every bot access or that saved credentials prove readiness.
5. Keep colorful, animated, user-customizable mascots attached to identity and meaningful status. Avoid a large permanent mascot showcase competing with actual work.
6. Grow the team deliberately when a reusable job needs a specialist; no silent creation, extra model usage or permission expansion.

Implemented in the opt-in Studio preview: the large preset-team introduction is replaced by conversation-first navigation, a first-teammate creation sheet with explicit provider/model choice and customizable animated characters. Production databases now start empty; existing teams remain intact. This is OpenBot's own monochrome visual system and vector-character implementation, not a reuse of competitor artwork. Automatic task-led profile suggestions, contextual connection prompts and native-client migration remain separate work; this does not claim those are finished.
