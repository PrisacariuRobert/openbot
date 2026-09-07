# OpenBot — In motion

The latest review cut is **OpenBot-In-Motion**: **64 seconds**, 1920 × 1080 at 60 fps, with no narration. Product shots now follow the native Mac conversation layout: a quiet conversation list, compact header, outlined composer, file rows and contextual inspector. The mascot silhouettes follow `StudioCharacter` in the shared native source, with frame-driven blinks, gaze and movement. All content is fictional; no owner conversations were captured for the film.

This cut keeps the client-review story, with close-ups, a mascot-to-header match move, teammate handoffs, deliverable previews and a desktop-to-phone pullback. The original 120 BPM score is recut around those beats, including a quieter approval passage. No narration, paid generation, copied Apple/OpenAI footage or commercial soundtrack. [Direction](STUDIO_DIRECTION.md) · [Checks](QA_STUDIO.md).

```sh
npm run score:studio
npm run lint
npm run test:demo
npm run render:studio
npm run check:studio
```

Watch `out/openbot-in-motion.mp4`, or choose **OpenBot-In-Motion** at `http://localhost:3333/OpenBot-In-Motion`. Editable source is `src/StudioFilm.tsx` and `src/studio-film/`. This is a staged marketing review asset, not a recording or certification of production execution. The previous cuts and their commands are preserved below.

## Previous 82-second walkthrough

The previous **OpenBot-See-It-Work** cut is **82 seconds**, 1920 × 1080 at 60 fps, with **no narration**. It stays inside one persistent application window and follows one useful request: prepare Friday’s client review. The viewer sees teammate creation and AI choice, sign-in, source gathering, private consultation, a missing-tool proposal, owner approval, build/test/repair, the finished budget and deck, email review, a repeat routine and phone continuity. [Direction and timeline](DEMO_DIRECTION.md) · [Checks](QA_DEMO.md).

Run `npm run score:demo`, then `npm run render:demo`; the output is `out/openbot-see-it-work.mp4`. Its only audio source is `public/audio/openbot-workflow-demo.wav`, synthesized locally with no paid service, downloaded track or speech. `src/DemoFilm.tsx` holds the continuous app/camera; `src/demo/` contains the ten workflow scenes. [Apple film study](APPLE_FILM_STUDY.md) records the earlier research and direction changes.

The missing-capability loop now has a visible consequence: **propose → approve → build → test → improve → re-test → use → reuse**. A local fictional parsing fixture reproduces two failed checks, then four passing checks and a €1,749.50 total. It grounds the displayed numbers; it is not proof of an autonomous agent creating, repairing and installing a production tool. The fully automatic loop shown remains a staged product-direction illustration subject to the publication gates below.

The rejected **OpenBot-Pulse-No-Voice** remains a separate 54-second motion cut, with its [QA record](QA_PULSE.md) and `score:pulse` / `render:pulse` / `check:pulse` commands intact. No earlier cut was deleted or silently relabeled as the new walkthrough.

The rejected **OpenBot-Full-Introduction** remains a separate 103-second narrated cut with its assets, timing and [QA record](QA_FULL_INTRODUCTION.md) intact. `prepare:full` / `render:full` regenerate that earlier cut, not the current version. `episode.json` belongs to its voice workflow. The 22-second **OpenBot-Voice-Direction** is also retained as an earlier audition.

The previous cut is **From an idea to taken care of**, a 47-second, 60-fps introduction, 1920 × 1080. One launch request is the through-line: competing work collapses into a message, teammates collaborate, the camera travels through full-size deliverables, work pauses for human approval, and the conversation carries on across devices. The original picture-specific score leaves space at the approval and resolves into a quiet final signature. Both the 52-second motion cut and the 80.4-second first cut are retained. These earlier cuts were not accepted as the final creative direction.

The film has no “unfinished” badges. It is a **pre-launch creative asset**, not a recording of a production session or evidence of release readiness. All conversations, accounts, files, send approvals and device handoffs are fictional staged demonstrations. Review [CAPABILITY_REVIEW.md](CAPABILITY_REVIEW.md) and the release checklist before using it in a launch. Nothing has been uploaded or published by this work.

## Watch and edit

After rendering, open `out/openbot-in-motion.mp4`. Previous cuts remain `out/openbot-see-it-work.mp4`, `out/openbot-pulse-no-voice.mp4`, `out/openbot-full-introduction.mp4`, `out/openbot-from-idea.mp4`, `out/openbot-introduction-dynamic.mp4` and `out/openbot-introduction.mp4`. Rendered files and build caches are ignored by Git; the editable source, original score generators, bundled narration/scores, font and vector marks are retained.

```sh
cd marketing/intro-film
npm ci
npm run dev
```

Open the URL reported by Remotion Studio and choose **OpenBot-In-Motion** (currently `http://localhost:3333/OpenBot-In-Motion`). See It Work, Pulse and Full Introduction are earlier cuts. Major camera/artwork layers are named in Studio. Motion is deterministic and frame-driven; no CSS animations or voice-derived timing are used. All earlier compositions remain editable.

```sh
npm run lint
npm run score:studio
npm run test:demo
npm run render:studio  # H.264 1080p60, CRF 17, stereo AAC
npm run check:studio
# score:demo / render:demo / check:demo preserve the earlier walkthrough
# score:pulse / render:pulse / check:pulse preserve the previous motion cut
# prepare:full / render:full preserve the earlier narrated cut
# score:story / render:story preserve the previous full-cut workflow
# score:dynamic / render:dynamic preserve the second-cut workflow
# score / render preserve the first-cut workflow
```

The first render downloads Remotion's headless Chromium if it is not cached. There is no provider/API call, paid AI generation, external font request, or owner-account access during rendering. Dependencies require network access on first install.

## Previous See It Work timeline

| Time | Visible action |
| --- | --- |
| 0–7 s | What OpenBot is; create Nova and choose its AI. |
| 7–15 s | Type and send the client-review request. |
| 15–23 s | Sign-in request, owner continuation and source gathering. |
| 23–29 s | Teammates consult; a missing importer is identified. |
| 29–37 s | Review the capability, plan, file effect and coding model; approve. |
| 37–49 s | Build, test, fix the failure, re-test and use the tool. |
| 49–59 s | Open the checked budget and review deck. |
| 59–67 s | Review the exact email and approve sending. |
| 67–74 s | Schedule the routine; next Friday reuses the saved tool. |
| 74–82 s | Continue the same conversation on desktop and phone. |

4920 frames. The owner’s initial request and Nova’s responsibility are retained across the demo. The fixture checks use native Node TypeScript support and were tested on Node 26.8.1. All account, execution, scheduling and device states in the film are staged.

## Previous Pulse timeline (retained)

| Start | Product experience |
| --- | --- |
| 00:00 | One launch request becomes a conversation. |
| 00:04 | A team researches, makes and checks; one answer returns. |
| 00:08 | Your team and your AI connection. |
| 00:11 | Manual private-browser sign-in; working sites and files. |
| 00:16 | Four 2-second shots: deck, workbook, website, code/tests. |
| 00:24 | A routine moves through the working week. |
| 00:28 | Memory, teaching and saved skills. |
| 00:31 | Propose, approve and build a missing tool. |
| 00:35 | Musical break; the owner reviews the destination and draft. |
| 00:39 | Pull back from the conversation to Mac and iPhone. |
| 00:44 | Open source, local first, skills/community/MCP. |
| 00:48 | Mascot movement and the OpenBot signature. |

3240 frames at 60 fps. Self-extension occupies four seconds (7.4%). All monetary values, test counts, artifacts, messages and device states are fictional demonstration content. No recording of real executed work is implied.

## Previous narrated timeline (retained)

| Start | Product experience |
| --- | --- |
| 00:00 | Meet the team. |
| 00:09.5 | Create a teammate; choose its role, look and AI. |
| 00:20.2 | Launch request; signed-in sites and allowed Mac apps/files. |
| 00:30.7 | Teammates research, build, check and return one answer. |
| 00:41.3 | Presentation, spreadsheet, website and reviewable code/tests. |
| 00:52.7 | Routines, memory, teaching, saved skills and MCP. |
| 01:06.1 | Propose and approve a missing tool; keep control of its file. |
| 01:16.5 | Exact sensitive-action review and work evidence. |
| 01:25.5 | Mac/iPhone conversation continuity. |
| 01:32.7 | Open-source/local-first identity and signature. |

3100 frames at 30 fps. Self-extension occupies 313 frames, approximately 10.1% of the film. The film is a product overview, not a tour of every advanced setting.

## Previous story-led timeline (retained)

| Start | Story beat |
| --- | --- |
| 00:00 | An idea, not a hundred little jobs. Fragments collapse into one ask. |
| 00:06 | Context and responsibility travel through the team; one response returns. |
| 00:14 | Track through a launch deck, a website project and a delivery plan. |
| 00:23 | A useful routine moves through the week, then work stops for the owner. |
| 00:30 | Pull back from the Mac conversation; a message travels to iPhone. |
| 00:38 | Choose the model, open the platform, and land on the OpenBot signature. |

2820 frames at 60 fps. Task collapse, paper travel, horizontal tracking, a vertical interruption and device/message choreography serve the narrative. Illustrations use fictional accounts and deliverables; these are not real task recordings.

## Second-cut timeline (retained)

| Start | Motion beat |
| --- | --- |
| 00:00 | Macro mascot pull-back, character arrivals and masked type. |
| 00:05 | Camera dives into chat; the ask moves from composer to bubble; consultation assembles one answer. |
| 00:12 | Provider marks orbit the teammate; subscription, API and local choice. |
| 00:19 | Signed-in apps converge, then fan outward as usable files and tested code. |
| 00:27 | Track through a working week; mascot follows the routine across days. |
| 00:33 | A deliberate pause for human approval. |
| 00:38 | Pull back from an iPhone conversation to reveal the Mac; a reply continues on the phone. |
| 00:45 | Moving capability ribbon; characters assemble the OpenBot signature. |

3120 frames at 60 fps. Scene changes use object-led scale/mask match cuts, not dissolves between static layouts. Letter masks, camera travel, artifact perspective and character motion are timed independently. The images are staged product illustrations, not recordings of real tasks.

## First-cut timeline (retained)

| Start | Scene | Purpose |
| --- | --- | --- |
| 00:00.0 | A little help | One character wakes; establish warmth. |
| 00:05.6 | Work that matters | Introduce the wider character family. |
| 00:11.2 | One conversation | Consult teammates privately; return one coordinated result. |
| 00:20.8 | Your AI | User-selected provider, supported subscription, API or local model. |
| 00:28.4 | Where you work | Private sign-in handoff, browser sessions, apps and tools. |
| 00:38.0 | Delivered work | Plans, decks, spreadsheets and tested project changes. |
| 00:45.6 | Routines | Turn useful work into a recurring responsibility. |
| 00:53.2 | You stay in control | Review destination and content before sensitive actions. |
| 01:00.8 | Within reach | Intended Mac/iPhone continuity and review experience. |
| 01:10.4 | Open possibilities | Skills/MCP, teaching, memory, code, research and voice; brand signature. |

Nine 12-frame overlaps keep the final duration at 2412 frames. The final frame and audio tail fade out. This is music-led and contains no narration; the story remains understandable muted.

## Creative and asset provenance

- Copy, layout, procedural music, motion timing, fictional product scenes and mascot SVG drawing are created for this project. The editable scene work follows the OpenBot repository license. It takes high-level inspiration from restrained product introductions, not an Apple advertisement, script, soundtrack or trademark.
- Characters are code-drawn shapes with frame-driven blinking/gaze/motion. They are not generated bitmap replacements for the app's mascots. Shapes/colors can be edited in `src/components.tsx`.
- Inter Variable is bundled from [the official Inter project](https://rsms.me/inter/), with its [SIL Open Font License](public/fonts/LICENSE.txt). No Apple system font is redistributed.
- Provider/app marks are copied from OpenBot's existing `ios/Shared/BrandAssets.xcassets` SVGs. Preserve the repository [third-party notices](../../THIRD_PARTY_NOTICES.md): Simple Icons CC0 artwork and the separate official OpenCode mark. The GitHub mark identifies the provider company; it is not a custom Copilot mark. Marks identify services, not affiliation or endorsement.
- Lucide icons retain their upstream ISC license in the installed dependency. Remotion and its dependencies retain their own licenses; consult [Remotion's license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) for your usage. The repository license does not relicense third-party packages or trademarks.
- No stock audio, participant-cloned voice, commercial song, generated photography, competitor UI screenshot, or personal account content is used. Aiden is a built-in synthetic Voice Studio voice, generated locally with Qwen3-TTS; the local model card declares Apache-2.0. No Apple narrator was cloned. The model/engine are not redistributed with this film; retain applicable notices and review the publication context.

## Checks

TypeScript/ESLint, intermediate motion frames, final file metadata and full-file decode should be checked after an edit. Key-frame checks and technical audio measurements are not a substitute for a human watching the film with sound before publication. See [QA_DEMO.md](QA_DEMO.md) for this cut, and [QA_PULSE.md](QA_PULSE.md), [QA_FULL_INTRODUCTION.md](QA_FULL_INTRODUCTION.md), [QA_DYNAMIC.md](QA_DYNAMIC.md) and [QA.md](QA.md) for the previous cuts.
