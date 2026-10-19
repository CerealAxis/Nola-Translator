# Nola website

VitePress reads Markdown pages and the six regional routes from `nola-docs/` (`srcDir`). The homepage is React + HeroUI v3, mounted by `Landing.vue`. Its colors, spacing scale, and regional fonts come from the desktop theme.

Run commands from the repository root after installing the root and `docs` dependencies:

```sh
npm run docs:dev
npm run docs:build
npm run docs:media
npm --prefix docs run typecheck
```

`docs:dev` and `docs:build` first build the real desktop UI demo into `docs/public/demo/`. That directory is generated and ignored. Homepage edits support hot reload; after changing demo source, run `npm --prefix docs run demo:build` and reload the browser.

The demo imports the actual desktop pages, routes, dictionaries, and stores. `src/renderer/application.tsx` registers pages and navigation for the desktop, website and Toy together. `media-src/demoBridge.ts` keeps interactions in memory, so there is no audio capture, engine, filesystem access, credential storage, or model transfer. `demoRuntime.ts` reads the real component catalogs with fictional installation state. Page navigation, transcript layout, appearance settings, notes, session controls, manual onboarding, and simulated model actions work with demonstration data. Interactive demos start idle; screenshot mode explicitly seeds a running session. Refresh resets the demo.

`media-src/Scene.tsx` places the real floating caption component and the extension's caption presentation in a video-player scene. Its video frame is from Blender Foundation's *Tears of Steel*, credited to Blender Foundation and reused under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); the source frame is [documented on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_frame_05_6a.jpg). The frame is resized and cropped to fit the scene. The English caption is aligned with the film subtitle at 00:00:23, and its translation is illustrative. `docs:media` renders all six languages and records screenshot and scene-image provenance in `public/screenshots/manifest.json`. The homepage uses these rendered surfaces for its posters, rather than maintaining another imitation of the product UI.

The root README and localized product introductions use the same current screenshot assets. Refresh all locale and theme captures with `npm run docs:media`, the `zh-CN` README examples with `node docs/scripts/generate-screenshots.mjs --readme`, and the Chinese tutorial captures with `node docs/scripts/generate-screenshots.mjs --guide`.

Commit `public/screenshots/` and its manifest: the homepage directly references the five images per locale, and normal site builds do not regenerate them. Keep dependencies, `dist/`, `public/demo/`, media capture caches, and VitePress temporary files out of Git; the ignore rules cover these generated directories.

The homepage layout is reviewed at **1920 × 1080 (16:9)**. Download URLs and all localized website copy live in `.vitepress/theme/content.ts`. Windows links to the latest GitHub Release; macOS and CLI display the localized coming-soon label.

`siteLocale.ts` detects browser language preferences across the homepage and documentation, falling back to English. The homepage language menu includes automatic detection; manual choices persist locally. `Landing.vue` displays the logo and animated waveform during loading. The hero uses moving signal contours and a short-lived pointer trace, with reduced-motion support.

## Bilibili Toy

```sh
npm run build:toy
npm run test:demo
node docs/scripts/check-demo.mjs --serve
```

Upload only `artifacts/toy/` (its root contains `index.html`). It uses the same `media-src/main.tsx`, desktop page registry, dictionaries and theme as the documentation demo, with a localized demo-data badge. All seven main destinations, record details and ten release settings tabs are available. Assets use relative paths and navigation uses hash routes for Toy's `/toy/<slug>/` hosting. The application bundles its regional fonts, so the upload includes these font files. `test:demo` creates `artifacts/toy-release/poster.png`, a 1200 × 900 real-UI capture prepared separately from the public package.

The Toy skill's `toy_doctor.py` checks the built directory before upload. The official CLI's `create` / `update` with `--json` and without `--yes` uploads a preview. Inspect it and explicitly confirm submission before repeating the command with `--yes`; that last step submits for review. Do not put OAuth state, local publishing records or configuration files into the package.
