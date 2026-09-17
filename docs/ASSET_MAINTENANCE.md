# Asset maintenance

Keep an asset because it has an owner and a consumer—not simply because it has a familiar extension. A missing literal import does **not** prove that an asset is unused: public URLs, native catalogs, template strings, and film compositions resolve resources differently.

## Cleanup reviewed on 17 September 2026

Asset audit: `main` at `85dae05bc07c869e751ad3e532d72299f64f516b`. Publication base: `e62936c1e71a88d72ea7001078879b24595c0761`. The intervening Todoist and client-submission changes were reviewed and preserved unchanged; they add no references to the removed assets. This is repository housekeeping, not an application redesign or a release certification.

| Removed group | Reason | Preserved replacement/source |
| --- | --- | --- |
| Four PNGs under `public/mascots/` | No app, script, manifest, or documentation consumer. Web mascots use `src/studio/Character.tsx` and `mascot-catalog.ts`; the release guard explicitly rejects image-backed mascots. | Code-drawn, recolorable characters. |
| Four `Mascot*.imageset` catalogs under `ios/OpenBotMobile/Resources/Assets.xcassets/` (PNG + `Contents.json` each) | No Swift or project-file lookup of these resource names. The only filename references were inside the removed catalogs themselves. Native characters use `StudioCharacter`; the source guard rejects `Image("Mascot…")`. | Native code-drawn characters; AppIcon and shared Brand catalogs remain. |
| Nine WebP copies from the website's retired Settings tour | The live `app/page.tsx` selector uses only `team`, `day`, and `build`. The site QA notes record removal of the old Settings/provider preview tour. | All original PNG captures and their manifest remain in `marketing/intro-film/public/actual-ui/`. |

The removed website names are `accounts`, `accounts-mobile`, `api-form`, `api-form-mobile`, `models`, `models-mobile`, `permissions`, `settings`, and `settings-mobile` (all `.webp`).

Total: **21 files**, comprising 17 images and four catalog descriptors; **2,983,360 bytes** removed from the checked-out tree. This does not remove older blobs from Git history or promise the same reduction in clone transfer size. Historical versions remain recoverable from the parent commit.

## Resources deliberately kept

- PWA icons, Apple touch icon, manifest and service worker.
- Electron and native app icons, including the iOS AppIcon also consumed by Mac packaging.
- Shared native provider/service SVGs, resolved by `StudioBrandMark` at runtime.
- Film SVGs resolved through `staticFile`, `Brand` props, and provider tables.
- The active website screenshot trio, face mark, favicon, film, and captions.
- Original film screenshots, audio sources/premasters, fonts, licenses, registered compositions, and dated QA records. Being absent from the latest film cut alone does not make an older registered composition or its inputs disposable.

No font, logo, or media source is deleted merely because another file has identical bytes. Different deployment roots and platform catalogs can intentionally require copies.

## Before deleting another asset

1. Search the exact path, basename, asset-catalog name, and the expression that generates its URL. Check all clients, documentation, capture/generation scripts, marketing sources, and packaging declarations.
2. Distinguish runtime output from canonical editable source. Keep original captures needed to rebuild supported compositions.
3. Check retained `Contents.json` references, manifests, and public paths. Remove a retired native image set as a unit rather than leaving a descriptor pointing at a missing file.
4. Run `node scripts/check-static-assets.mjs`, then relevant build/render/package checks. The static check also runs in the Verify workflow before dependency installation; it checks a bounded set of known resource contracts and README links, not every possible runtime import or website request.
5. Review the deletion diff. Never delete ambiguous inputs automatically. Use an ordinary reviewed commit, not a history rewrite or force push.

The root README is now an introduction. `REFERENCE.md` preserves the prior full feature/setup notes and release history at the same path depth, keeping their relative links intact. Add concise highlights to the README; keep detailed operational notes and dated evidence in the linked documentation.
