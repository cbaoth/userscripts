# My Userscripts & Co.

## Table of Contents

- [User Scripts](#user-scripts)
  - [Universal Content Blur](#universal-content-blur)
  - [Universal Emoji Replacer](#universal-emoji-replacer)
  - [Universal Image Resizer](#universal-image-resizer)
  - [Universal Redirector](#universal-redirector)
  - [Copy URL on Hover](#copy-url-on-hover)
  - [Gerrit Tweaks](#gerrit-tweaks)
  - [Jenkins Tweaks](#jenkins-tweaks)
  - [OpenProject Tweaks](#openproject-tweaks)
- [Deprecated & Legacy Scripts](#deprecated--legacy-scripts)
- [Libs & Resources](#libs--resources)
- [Q & A](#q--a)

---

## User Scripts

My personal browser user scripts.

To run them first install a user script plugin in your browser:

- Chrome / Chromium-based (Vivaldi, Edge, Brave, ...): [Violentmonkey](https://violentmonkey.github.io/) _(recommended, open-source)_ or [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  - Note: Violentmonkey is no longer listed on the Chrome Web Store due to MV3 restrictions, but works fine in other Chromium-based browsers.
- Firefox: [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) _(recommended)_, [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/), or [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)

Then just click on the desired `*.user.js` file above and click on the `RAW` button on the top right of the code. The code should then be automatically caught by the plugin, asking you to install it or not. If auto-update is enabled in your plugin, you should always have the most recent script version (link to the repo provided in all scripts).

Note that not all of them are regularly updated or heavily used _(some might be outdated)_, and that I kept things simple _(for myself)_ meaning most scripts import a few libs that I regularly use. The latter shouldn't be much traffic overhead due to Tampermonkey's internal lib cache, but it might not be ideal performance wise _(works for me, no plans to change this soon)_.

See [Deprecated & Legacy Scripts](#deprecated--legacy-scripts) for older scripts that are kept around but no longer maintained.

---

### Copy URL on Hover

[copy-url-on-hover.user.js](copy-url-on-hover.user.js) copies link/media URIs to the clipboard on mouse hover.

- Copies link URI into clipboard when hovering over a link while holding `Alt-C`.
- Tries to copy media (image/video) URI into clipboard when hovering over an image while holding `Alt-B`.
- Shows a brief tooltip indicating that the clipboard was updated:

![](adoc_assets/copy-on-hover-link1.png)

![](adoc_assets/copy-on-hover-media1.png)

---

### Gerrit Tweaks

> **Note:** Last updated 2018-12-02. This script may no longer work correctly with the current version of the site.

[gerrit-tweaks.user.js](gerrit-tweaks.user.js) improves [gerrit code review](https://www.gerritcodereview.com/):

- Adds additional syntax highlighting for:
  - Exit keywords `return` and `throw`
  - Static method calls of Google Guava [Preconditions](https://github.com/google/guava/wiki/PreconditionsExplained) (potential exits)

  ![](adoc_assets/gerrit-tweaks-code1.png)

---

### Jenkins Tweaks

> **Note:** Last updated 2020-06-30. This script may no longer work correctly with the current version of the site.

[jenkins-tweaks.user.js](jenkins-tweaks.user.js) improves [Jenkins](https://jenkins.io/):

- Highlights errors, exceptions, warnings, success, test issues etc. in:
  - Job console output
  - Blue Ocean pipeline and test output

  ![](adoc_assets/jenkins-console1.png)

---

### OpenProject Tweaks

[openproject-tweaks.user.js](openproject-tweaks.user.js) improves OpenProject by adding things like:

- Highlights the user's own name (automatically detected).
- Highlights issue priority, status, and type (tracker).
- Highlights _[tags]_ and **bold** in issue subjects.
- Allows adding of additional custom styles _(substitute text fragments via generic regex search mechanism)_.
- **Markdown Source Editor Improvements**:
  - Increases editor height significantly (default: 65vh, configurable) for better overview
  - Automatically detects and enhances editors when switching between WYSIWYG ↔ Markdown modes
  - Reduces font size (default: 12px) to display more content
  - Configurable via constants at the top of the script:
    - `MARKDOWN_EDITOR_HEIGHT` — default height (e.g., `"65vh"`, `"800px"`)
    - `MARKDOWN_EDITOR_FONT_SIZE` — font size in source mode

---

### Universal Content Blur

[universal-content-blur.user.js](universal-content-blur.user.js) blurs disturbing or unwanted content on any site by configurable rules, with reveal-on-hover so you can decide whether to peek. A general, config-file-driven approach to filtering unwanted content.

- A single plain-text config (one rule per line, edited in one textarea — no fiddly multi-tab GUI, no JSON export/import):

  ```
[list:words_violent]
  gore
  /blood(y)?/
  /murder|kill(ed|ing)?/

  [rules]
  # url-pattern | source | patterns | action | scope | options
  *://*/*        | text | @words_* | blur | self | hover
  *://site.com/* | user | @users   | blur | row  | hover
  ```

- **Per-rule URL patterns** (glob `*://host/*` or `/regex/flags`) — rules only run where you configure them, not globally.
- **Sources:** visible `text`, image `alt`/`title`, link/image `url`, or `user` (username extracted from profile-style URLs).
- **Pattern syntax:** bare words match **whole-word and literally** (`test` ≠ `tested`), with simple `*`/`?` wildcards (`\*`/`\?` for literals). Wrap in `/…/` for full regex — note `/…/` matches as a **substring** (also inside words), so add `\b…\b` for whole-word or `^…$` for an exact full-value match.
- **Reusable pattern lists** (`[list:NAME]`, referenced as `@NAME` or `@glob*`) shared across rules. Lists can **reference other lists** by name or by glob wildcard (`@text_*` expands to every list whose name matches), and wildcards also work directly in a rule's patterns field. Duplicate fragments across overlapping lists are deduplicated automatically. Nesting up to 5 levels deep; self-references and cycles are silently skipped. Lists are the place for complex regex with alternation (e.g. `/kill(ed|ing)?/`) — inside a rule line `|` is the field separator, so inline `/regex/` tokens use commas for alternatives instead.
- **Scope:** blur the matched element (`self`), an ancestor (`up:N`), a `closest:SELECTOR`, or the whole table `row` — handy for old table-based layouts.
- **Actions:** the built-in `blur` (strength tweakable as `blur:20`), plus your own effects — add a `[css]` section, define `.ucb-NAME` classes (darken, grayscale, hide, resize, … anything CSS can do) and use `NAME` as the action. Combine several (`blur, dim:0.1`); a `NAME:VALUE` action exposes `--ucb-NAME` so a rule can parameterize your CSS. For reveal-on-hover on custom actions, add a `.ucb-NAME.ucb-hover:hover` rule (the script adds `.ucb-hover` when the rule uses the `hover` option).
- **Stop motion** (`freeze` option): pauses videos + CSS animations and snapshots animated images (GIF/WebP/APNG) to a still frame, so a blurred animation can't leak context through movement. With hover-reveal, motion resumes while you peek and re-freezes when you leave.
- **Keyboard quick-add:** select text or hover a link, then _(shortcuts are configurable constants at the top of the script)_:

  | Keys          | Action |
  |---------------|--------|
  | Alt-R         | Quick-add a blur rule from the selection/hovered link (applies immediately) |
  | Alt-Shift-R   | Quick-add via a small panel: create a **new rule** (choose source, scope, hover), or add the value to an **existing rule** or **existing list** — the chosen destination is remembered across reloads for adding several in a row |
  | Alt-A         | Quick-block: fold the selection/username into the first matching rule's list (or create a new rule if none matches) — one-keypress user blocking. Usernames are anchored as `/^name$/` so similar names aren't caught |
  | Alt-Shift-S   | Open the rules settings (edit/validate/bulk-edit) |
  | Hold Shift / Alt | **Peek:** temporarily suspend all effects to see the page as-is (reveal blurred content, drop highlights); restores on release. Configurable as hold-to-peek or tap-to-toggle, with a hold delay so it ignores Shift-for-capitals; ignored while typing in a field |

- **Cloudflare-safe:** runs at `document-idle`, stays completely inert on pages with no matching rule, and bails on Cloudflare challenge pages (unlike some similar scripts that break the "are you human" check).

---

### Universal Emoji Replacer

[universal-emoji-replacer.user.js](universal-emoji-replacer.user.js) replaces emojis based on configurable mappings to personalize your browsing experience, or to reduce emotional friction by replacing potentially triggering emojis with more neutral alternatives.

- Supports simple emoji replacement rules (`🙁 <- 💩 🤮 🤬 😡 👿 😠`) based on configurable mappings.
- Mappings are edited via a userscript extension (\*monkey menu command); export/import is done by copy-pasting the textarea.

---

### Universal Image Resizer

[universal-image-resizer.user.js](universal-image-resizer.user.js) resizes images on configured sites by CSS selector — handy for sites that serve needlessly small (or large) images.

- **Per-URL rules** (glob `*://host/*` or `/regex/flags`) mapping a CSS selector to a target size, edited in a single plain-text textarea (one rule per line: `url-pattern | css-selector | size | options | hover-size`).
- **Hover zoom:** optional per-rule hover size, including hover-only rules (use `-` as the static size).
- **Container-fix** option for layouts that clip or constrain the resized image.
- **Element picker:** pick an image on the page to generate a matching selector/rule visually, with an adjustable ancestor depth and live match count, instead of writing selectors by hand.
- Configured via the userscript extension (\*monkey menu command).

---

### Universal Redirector

[universal-redirector.user.js](universal-redirector.user.js) redirects domains based on configurable mappings — a single script covering all redirect use cases instead of one script per site.

- Supports simple hostname rules (`reddit.com -> old.reddit.com`) and regex patterns on the full URL.
- Redirects fire at `document-start` before any content loads.
- Mappings are edited via a userscript extension (\*monkey menu command); export/import is done by copy-pasting the textarea.

---

## Deprecated & Legacy Scripts

The following scripts are kept around but **no longer maintained** and may not work
with the current versions of their target sites. They are documented separately and
tracked for review (verify / update / remove) in [docs/TODO.md](docs/TODO.md):

- **Amazon Tweaks** (`amazon-links.user.js`)
- **Auto Show Forum Spoilers** (`auto-show-forum-spoilers.user.js`)
- **IMDB Tweaks** (`imdb-tweaks.user.js`)
- **Search Hotkey** (`search-hotkey.user.js`)
- **Streaming Tweaks** (`streaming-tweaks.user.js`)

See [docs/deprecated.md](docs/deprecated.md) for details on each.

---

## Libs & Resources

Common libs and resources used in some of my scripts.

| File | Description |
|------|-------------|
| [lib/cblib.js](lib/cblib.js)   | Some common JS used in my user scripts. |
| [lib/cblib.css](lib/cblib.css) | Some common CSS used in my user scripts. |
| [dev/](dev/)                   | Just some code snippets, notes, etc. that can be helpful while developing user scripts. |

---

## Q & A

- **Q: Why are the hotkeys (sometimes) not working as expected?**
  - A: Most of these scripts disable hotkeys while an input field is in focus _(e.g. cursor in YouTube search field while playing video)_ to prevent accidental hotkey execution while typing. Check if this is the case _(e.g. click onto the player first to focus it)_.
