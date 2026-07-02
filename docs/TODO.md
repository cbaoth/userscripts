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
  - [ ] Quick-add token anchoring (idea / to be considered): when a captured value is added to an **existing rule**, the token is currently anchored based on the *captured* source (`user` → `/^name$/`, others → substring `/…/`). Consider instead anchoring based on the *destination rule's* source, so e.g. adding into a `user` rule always produces an exact-match token regardless of what was hovered. Revisit together with the regex-vs-plain-text quick-add question (see issues.md issue 3).
  - [ ] Make currently hard-coded settings user-configurable (keys, `PEEK`, `BLUR_STRENGTH_PX`, debounce, etc.). Three UI approaches to weigh: (1) add to the current rules dialog (easiest but clutters/mixes concerns); (2) tabs or foldable sections — likely simplest if each tab behaves like its own dialog with its own validation + save (unsaved-changes prompt on tab switch), avoiding whole-dialog save complexity when another tab has errors; (3) separate dialogs with their own open-hotkeys — effectively the same UX as tabs if all dialogs share size + top switch-buttons and only one is open at a time (switching = close+reopen, or prompt on unsaved changes). Hotkeys to jump straight to a tab/section apply to (2) and (3) alike.
  - [ ] Optional header "X" close button in the settings dialog (and maybe the bottom bar) for mouse-first users — behaves exactly like Cancel/Escape. Only if it stays trivial; Cancel + Escape already cover it.
  - [ ] Richer rules editor instead of the plain `<textarea>`: at minimum syntax highlighting (comments gray; section headers `[…]` colored, possibly per type or just list-vs-other; `@list` refs; a visual distinction between url/regex tokens and plain-text tokens), line numbers, and maybe next/prev-section jump hotkeys. Likely needs a third-party dependency — if so, gate it behind a user setting that falls back to the current plain textarea when disabled (keep the no-dependency path working).
  - [ ] Quick key-driven option chooser after the hotkey (idea / to evaluate): instead of (or alongside) multiple hotkeys + the bottom bar, press one hotkey then pick what to do via a short key sequence. Minimal version: on open, focus the **"add to" combobox first** and let `1`/`2`/`3` pick the destination, then auto-focus the token field; a timeout (~500 ms) or any non-`1/2/3` key falls through to focusing the token field (current behavior). Add a left-hand **commit key** so the right hand can stay on the mouse for the next capture. Alternative: a small floating widget/tooltip near the cursor listing options + keys (mouse-clickable, possibly multi-level context-menu style), capturing keys while open and dismissing on any non-option key — likely simpler and eyes are already at the pointer. The number range scales with the option count / multi-step prompts. Depends on configurable hotkeys/constants (see the "make hard-coded settings configurable" item) for left-handed accessibility.
