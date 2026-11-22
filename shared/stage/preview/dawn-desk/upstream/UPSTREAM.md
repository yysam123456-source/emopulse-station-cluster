# room-at-dawn · preview subset

This folder is a **preview-only** subset of `6:51 — a room at dawn` by Leon Lin.

- Upstream: `room-at-dawn` source snapshot used in `_third_party/2026-11-20/room-at-dawn`
- Snapshot commit: `aab8be218aa051bbb2e22b82916962619c951747`
- License: MIT (see `LICENSE` in this folder)
- Copied files: `core/{geo,rng,tex,gi}.js`, `scene/{layout,materials,room,sky}.js`,
  `scene/parts/{desk,fixtures,plants,exterior}.js`
- Not copied: audio, bake data, render pipeline, bed/clutter/decor, UI, film camera score

The files are unmodified upstream source. The preview wrapper is
`../index.ts`; it decides which modules are mounted and supplies a simplified
lighting/glass/paper layer. This folder must not be imported by
`shared/parts`, `shared/sites`, or any production build.

If this preview is promoted, replace this subset with the upstream package and
re-check the MIT notice plus the audio CC-BY-4.0 terms (audio is not used here).
