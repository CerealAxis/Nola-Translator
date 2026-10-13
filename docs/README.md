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

The demo imports the actual desktop pages, routes, dictionaries, and stores. `media-src/demoBridge.ts` keeps interactions in memory, so there is no audio capture, engine, filesystem access, credential storage, or model transfer. Page navigation, transcript layout, appearance settings, notes, session controls, and simulated model actions work with demonstration data. Refresh resets the demo.

`media-src/Scene.tsx` composes original scenery with the real floating caption component or the extension's caption presentation and stylesheet. `docs:media` renders all six languages and records source provenance in `public/screenshots/manifest.json`. The homepage uses these rendered surfaces for its posters, rather than maintaining another imitation of the product UI.

Commit `public/screenshots/` and its manifest: the homepage directly references the five images per locale, and normal site builds do not regenerate them. Keep dependencies, `dist/`, `public/demo/`, media capture caches, and VitePress temporary files out of Git; the ignore rules cover these generated directories.

The homepage layout is reviewed at **1920 × 1080 (16:9)**. Download URLs and all localized website copy live in `.vitepress/theme/content.ts`. Windows links to the latest GitHub Release; macOS and CLI display the localized coming-soon label.

`siteLocale.ts` detects browser language preferences across the homepage and documentation, falling back to English. The homepage language menu includes automatic detection; manual choices persist locally. `Landing.vue` displays the logo and animated waveform during loading. The hero uses moving signal contours and a short-lived pointer trace, with reduced-motion support.
