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

Scripts that have not had functional updates in 3+ years — verify each still works; remove README warning if yes, fix or delete if no.

- [ ] `gerrit-tweaks.user.js` (2018-12-02)
- [ ] `tradingview-tweaks.user.js` (2019-10-31)
- [ ] `image-search-tweaks.user.js` (2019-12-07)
- [ ] `jenkins-tweaks.user.js` (2020-06-30)
- [ ] `imdb-tweaks.user.js` (2020-10-26)
- [ ] `auto-show-forum-spoilers.user.js` (2021-02-23)
- [ ] `finanzblick-tweaks.user.js` (2021-05-27)
- [ ] `amazon-links.user.js` (2022-01-11)
- [ ] `search-hotkey.user.js` (2022-07-01)
- [ ] `streaming-tweaks.user.js` (2022-11-11)

## Script-Specific Ideas

- [ ] `emoji-replacer.user.js`
  - [ ] Consider adding globale include/exclude list for hosts and or per sule/section conditions (e.g. apply mapping rule(s) only on specific social media websites)

- [ ] `universal-image-resizer.user.js`
  - [ ] Picker: add match-count range filter to candidate list — allow user to specify min/max number of matched images (e.g. 80–120) so candidates can be narrowed down when depth is high and many selectors are found. Useful when you know roughly how many images a page section should contain (e.g. a search result grid).

- [ ] `universal-content-blur.user.js` (v1 = blur action only)
  - [ ] Additional actions beyond `blur`: `hide` (display:none), `dim` (low opacity), `pixelate` (stronger image obscuring). Add if blur proves insufficient.
  - [ ] Opt-in `pointer-events:none` on blurred content to block accidental clicks (kept off by default — it contributed to breakage in the script this replaces).
  - [ ] Cross-row / sibling-group scope: blur multiple related sibling rows when any triggers (e.g. old `<table>` based sites where username and text/image are in separate rows).
  - [ ] Consider an element-picker quick-add (like the image-resizer) for choosing scope selectors visually, in addition to the keyboard quick-add.
  - [ ] `freeze` option follow-ups: also freeze images lazily inserted into an already-frozen target (currently only those present/loading at blur time); optional "play on hover" (resume motion when the area is revealed); optional freeze-all-images (not just GIF/WebP/APNG) for sites whose animated images have non-obvious extensions.
  - [ ] Evaluate whether this should eventually supersede `cb-detrigger.user.js`.
