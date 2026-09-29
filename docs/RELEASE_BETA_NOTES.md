**OpenBot's first public beta.** OpenBot gives you a small team of AI teammates on your Mac. They research, write and get things done, and ask before anything important. It's free, open source, and works with the AI you already use.

## Install (macOS 13+, Apple silicon or Intel)

```sh
curl -fsSL https://openbots.foundation/install.sh | sh
```

No administrator password is needed. The installer checks the download's SHA-256 and runs OpenBot in the background as **OpenBot.app**. It opens your studio in the browser. To uninstall, run `~/Library/Application Support/OpenBot/uninstall.sh`.

## Highlights

- **Make your own teammates.** Pick a name, a face, a color and a job. Each teammate gets its own workspace and its own browser.
- **Research in seconds.** Built-in web search and reading, with links to sources.
- **Group chats that work in order.** Write "Nova, find three restaurants. Scout, check their hours." Scout waits for Nova's list.
- **Real files.** Word documents and spreadsheets you can open and share.
- **Asks before it acts.** Sending, buying, signing in or submitting always shows the website and the exact button first.
- **Reach your team anywhere:**
  - Telegram, Discord and iMessage
  - "Hey Siri, Ask OpenBot"
  - Pair your iPhone with one scan
  - Hands-free voice
- **Routines.** "Every Monday at 9, plan my week." Your Mac can wake up for them.
- **Your AI, your choice:**
  - A free Google Gemini key
  - The ChatGPT, Claude, Grok or Copilot (Pro/Business) subscription you already have
  - OpenCode Go
  - Any OpenAI-compatible API
  - Local models with Ollama
- **Bring your setup.** One-click import from Hermes Agent and OpenClaw.
- **Updates in one tap** from the sidebar.

## Good to know

- This is a beta. The Mac app is ad-hoc signed, not notarized; the one-line installer is the supported way to install it.
- Free AI keys have tight limits. With Google's free tier, Flash-Lite is used by default, and OpenBot tells you when the free allowance is used up.
- Known gaps: [product gap audit](https://github.com/PrisacariuRobert/openbot/blob/main/docs/PRODUCT_GAP_AUDIT.md). Found a bug? Use **Send feedback** in the app or [open an issue](https://github.com/PrisacariuRobert/openbot/issues/new/choose).

Full details are in the [changelog](https://github.com/PrisacariuRobert/openbot/blob/main/CHANGELOG.md).
