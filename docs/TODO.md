# TODO

## Dependencies & Modernization

- [ ] Review `lib/cblib.*` — evaluate whether to keep, refactor, or discard in favor of native/modern solutions
- [ ] Audit all scripts for `jQuery`, `underscore`, `waitForKeyElements` usage — replace with native equivalents where feasible (ongoing; `copy-url-on-hover` already done)
- [ ] Standardize observer pattern usage across all scripts
- [ ] Standardize user settings/config approach across scripts (currently inconsistent: some use `GM_config`, some hardcode values)

## Build Toolchain

- [ ] Consider Violentmonkey's Rollup+Babel+TypeScript generator for scripts that grow complex enough to benefit from it — see [docs/DEV.md](DEV.md) and [violentmonkey.github.io/guide/using-modern-syntax](https://violentmonkey.github.io/guide/using-modern-syntax/)

## Code Quality Review

- [ ] Lint all scripts with ESLint (`npm run lint`) and address reported issues
- [ ] Review all scripts for modern JS adherence (ES2020+), potential performance or security issues, and unused/redundant code
- [ ] Review consistency across scripts: common patterns for observer setup, key binding, error handling

## Stale Script Review

Scripts that have not had functional updates in a long time — verify each still works; remove the README/`deprecated.md` warning if yes, fix or delete if no. Scripts marked _deprecated_ have been moved to [deprecated.md](deprecated.md).

- [ ] `gerrit-tweaks.user.js` (2018-12-02)
- [ ] `jenkins-tweaks.user.js` (2020-06-30)
- [ ] `imdb-tweaks.user.js` (2020-10-26) — _deprecated_; IMDB redesigned its pages a few years ago, almost certainly broken. Likely delete.
- [ ] `auto-show-forum-spoilers.user.js` (2021-02-23) — _deprecated_; presumably still works on older forums. Better options may exist; drop the unnecessary `@require` dependencies (overkill for such simple functionality).
- [ ] `amazon-links.user.js` (2022-01-11) — _deprecated_; unmaintained for years, then a partial fix/improvement attempt a few months ago that was likely never finished. Review → ok / update / delete.
- [ ] `search-hotkey.user.js` (2022-07-01) — _deprecated_; good idea originally but unused for a long time. Test whether it still works and is still useful; keep or delete accordingly.
- [ ] `streaming-tweaks.user.js` (2022-11-11) — _deprecated_; long unused. YouTube now handled by other scripts/extensions; the remaining services mostly used on TV in recent years. Sites have likely changed — review, may no longer work.
- [ ] `foswiki-tweaks.user.js` (2025-01-24) — unclear whether this was just WIP or actually useful. Evaluate the `GM_config` (`@require`) dependency — overkill for a single float value; replace with a native or minimal custom implementation.

> Deleted on review (recoverable from git history if needed): `finanzblick-tweaks.user.js`, `image-search-tweaks.user.js`, `tradingview-tweaks.user.js`, `invoke-ai-tweaks.user.js`.

## Script-Specific Ideas

- [ ] `universal-emoji-replacer.user.js`
  - [ ] Consider adding globale include/exclude list for hosts and or per sule/section conditions (e.g. apply mapping rule(s) only on specific social media websites)

- [ ] `universal-image-resizer.user.js`
  - [ ] Picker: add match-count range filter to candidate list — allow user to specify min/max number of matched images (e.g. 80–120) so candidates can be narrowed down when depth is high and many selectors are found. Useful when you know roughly how many images a page section should contain (e.g. a search result grid).

- [ ] `universal-content-blur.user.js`
  - [x] ~~Additional actions beyond `blur`: `hide` (display:none), `dim` (low opacity).~~ Done differently: actions are now arbitrary user-defined `.ucb-NAME` classes via a `[css]` section (`blur` is the built-in default, parameterizable as `blur:N`). `hide`/`dim`/`darken`/`grayscale`/`resize` etc. are plain CSS the user writes; `NAME:VALUE` exposes `--ucb-NAME` for per-rule tuning.
  - [ ] `pixelate` action — the one obscuring effect plain CSS can't do (needs a canvas/SVG filter). Add as a built-in if blur proves insufficient for images.
  - [ ] Opt-in `pointer-events:none` to block accidental clicks — now trivially a `[css]` class (`.ucb-noclick { pointer-events: none }`); document it as a recipe rather than building it in.
  - [ ] Cross-row / sibling-group scope: blur multiple related sibling rows when any triggers (e.g. old `<table>` based sites where username and text/image are in separate rows).
  - [ ] Consider an element-picker quick-add (like the image-resizer) for choosing scope selectors visually, in addition to the keyboard quick-add.
  - [ ] `freeze` option follow-ups: also freeze images lazily inserted into an already-frozen target (currently only those present/loading at blur time); optional "play on hover" (resume motion when the area is revealed); optional freeze-all-images (not just GIF/WebP/APNG) for sites whose animated images have non-obvious extensions.
