# OpenBot product introduction

Private, independently deployable product website. This does not publish an OpenBot application release.

## Included

- Real Studio screenshots, captured with disposable sample data; no separately invented app layout.
- Accessible individual/team/coding example tabs.
- Six-shape, six-color custom teammate appearance preview with a custom name.
- Music-only, 60-second animated introduction with a keyboard-accessible dialog and a synchronized text track. A visible cursor selects conversations, opens panels and menus, reviews files, saves a routine and creates a teammate. The sidebar and app state respond throughout the same continuous window.
- Prominent bring-your-own-AI section: supported subscriptions, API keys and compatible local models; provider and plan limits remain explicit.
- One concise bring-your-own-AI message instead of a Settings tour. Technical setup screens remain in the app, not the landing-page story.
- Source and developer-setup links; no invented binary download.
- Reduced-motion support, responsive layouts, locally served assets, and no analytics or account collection.

Run `npm install`, then `npm run dev`. `npm run build` creates the deployable website; `npm run lint` checks authored site code. Unmodified generated shadcn component files are excluded from lint because the supplied starter reports baseline lint findings in unused primitives; TypeScript still checks them.

The current website is configured as an owner-private Sites preview. Public indexing is disabled. Do not make it public or replace the pending-download notice until the owner has approved the app release and a working download asset has been verified.

## Source and assets

`components/product/Product.tsx` is a synchronized copy of `../intro-film/src/launch/Product.tsx`; copy that canonical file here after artwork edits. Mascot geometry is derived from OpenBot’s original vector family. GitHub’s mark is the existing project brand asset. Inter is the existing bundled typeface. The soundtrack is the project’s original instrumental composition. No Apple assets, personal chats, cookies, account screenshots or third-party commercial music are included.

`public/media/openbot-introduction.mp4` is the current exported film; the VTT track describes its on-screen story. Run `npx tsx scripts/capture-marketing-ui.ts` from the OpenBot root to recapture the shipping React UI with disposable sample data. It does not call the user's host, sign in or execute a task. `../intro-film/public/actual-ui/manifest.json` records the captures. These are real layouts, not proof of real-account task completion.

## When the app is ready

1. Verify the signed/notarized Mac release on a clean machine.
2. Verify the exact immutable asset URL, supported architecture, version and checksum.
3. Replace the pending notice with that download and a source alternative.
4. Recheck every claim against that release, including provider and remote-access limits.
5. Obtain the owner’s approval for public website access and announcement.
