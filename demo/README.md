# Memory Room browser demo: source

Builds `memory-room-demo.html`, one offline file (about 8.5 MB) with the plugin's real room and UI
(`src/ui.ts`, `src/scene.ts`, three.js), styles.css, the DJ Whiskers cat model and a made-up sample vault.

1. Run `npm ci` in the repo root.
2. `node demo/build.mjs path/to/cat.glb docs/index.html` writes the live demo that GitHub Pages serves
   (https://aceattacker77.github.io/obsidian-memory-room/), plus `docs/index.artifact.html` (same page
   without the html/head/body wrapper, for publishing as a claude.ai Artifact; don't commit it).
   With no output path it writes `demo/memory-room-demo.html`.

- `vault.ts`: the sample notes (all fictional; `age` = days since last touched, so some fade).
- `demo.ts`: the fake Obsidian host. Open note shows an in-page reader; Find uses the panel search; the
  music player plays three lo-fi loops synthesised in the browser (`tunes.ts`).
- URL options: `?mood=morning|afternoon|sunset|night` (default follows your clock), `?spot=desk` opens a spot.
