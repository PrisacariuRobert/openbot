# Conversation and setup review

- `new-conversation-1154x768.png` and `needs-you-1154x768.png`: actual Electron renderer, production build, isolated local backend and synthetic teammates. The new-conversation capture shows the direct-chat picker after removing shared-chat creation.
- `connect-ai-desktop.png` and `connect-ai-mobile.png`: production shared UI in desktop and 390 px browser emulation, using a fresh local backend without model credentials. They show the first-teammate AI setup path.
- `connect-gmail-desktop.png` and `connect-gmail-mobile.png`: production shared UI in desktop and 390 px browser emulation, using an isolated local backend without Google credentials. They show the honest self-hosted Google setup path; no external account was connected.

The Electron test checks persistence, pin/unpin, archive/restore, search, drafts, and recovery. All UI data in these captures is disposable; no model or external service was called.
