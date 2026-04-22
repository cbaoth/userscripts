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
