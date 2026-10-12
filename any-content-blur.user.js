// ==UserScript==
// @name         Any Content Blur
// @namespace    https://github.com/cbaoth/userscripts
// @version      2026-10-12T165403
// @description  Blur disturbing/unwanted content (text, alt/title, URLs, usernames) by configurable regex rules per URL pattern, with reveal-on-hover and keyboard quick-add.
// @author       cbaoth235
// @license      MIT
//
// @match        *://*/*
//
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
//
// @run-at       document-idle
//
// @downloadURL  https://github.com/cbaoth/userscripts/raw/master/any-content-blur.user.js
// ==/UserScript==

(async function () {
    'use strict';
    /* eslint-disable no-console */

    // -----------------------------------------------------------------------
    //  CONFIG (constants — tweak to taste)
    // -----------------------------------------------------------------------

    // DEPRECATED (2026-10-12): legacy single config, only read by the one-time
    // migration in getFiles(). Remove together with that migration (docs/TODO.md).
    const STORAGE_KEY = 'contentBlurRules';
    const FILES_KEY = 'contentBlurFiles'; // [{ id, name, enabled, text }]; run order = name order (sortFiles)
    const REFERENCE_NAME = 'reference'; // built-in read-only file (DEFAULT_RULES), never stored
    const FILE_NAME_RE = /^[a-z0-9][a-z0-9_.-]*$/; // used in [use] and @file/list, so no / or spaces
    const PANEL_STATE_KEY = 'contentBlurPanelState'; // remembered quick-add destination
    const BLUR_CLASS = 'ucb-blur';
    const HOVER_CLASS = 'ucb-hover';
    const FREEZE_CLASS = 'ucb-freeze'; // pauses CSS animations inside a frozen target
    const FROZEN_CLASS = 'ucb-frozen'; // marks a canvas snapshot that replaced a GIF
    const BLUR_STRENGTH_PX = 9; // .ucb-blur { filter: blur(Npx) }
    const SCAN_DEBOUNCE_MS = 250;
    const LOG_PREFIX = '[content-blur]';

    // Keyboard shortcuts. Each is { alt, shift, ctrl, meta, key } (key compared
    // lowercase).
    const KEYS = {
        quickAddSilent: { alt: true, shift: false, ctrl: false, meta: false, key: 'r' },
        quickAddPanel: { alt: true, shift: true, ctrl: false, meta: false, key: 'r' },
        quickBlock: { alt: true, shift: false, ctrl: false, meta: false, key: 'a' },
        openSettings: { alt: true, shift: true, ctrl: false, meta: false, key: 's' },
        toggleStyles: { alt: true, shift: false, ctrl: false, meta: false, key: 'z' }, // ALL effects on/off (persistent until re-toggled or reload)
        toggleDebug: { alt: true, shift: true, ctrl: false, meta: false, key: 'd' }, // reveal effects + label each affected area with its rule (page-local, resets on reload)
    };

    // Quick-add bar placement. Desktop browsers draw the link-target status bubble
    // in the viewport's bottom-left corner, exactly where a flush bottom bar sits —
    // the offset floats the bar above the bubble so hovering links while the bar is
    // open never hides its fields. Set position 'top' to avoid the corner entirely.
    // The bar is shrink-to-fit; controls have fixed/min widths, so fields and
    // buttons keep stable on-screen positions within a given destination mode.
    const QUICK_BAR = {
        position: 'bottom', // 'top' | 'bottom' — viewport edge the bar docks to
        align: 'center', // 'left' | 'center' | 'right' — horizontal placement
        offset: 40, // px distance from the docked edge (at 'bottom': clears the status bubble)
        margin: 12, // px minimum gap to the side edges
    };

    // Commit-tap: rapidly tap a bare modifier (default: double-tap Alt) while the
    // quick-add bar is open to trigger "Add & apply" without moving either hand —
    // the left hand is already on Alt from the open-hotkey and the right hand can
    // stay on the mouse. Layout-independent (modifiers sit in the same place on
    // QWERTY/Colemak/…). Coexists with PEEK: hold-peek needs a ≥holdDelayMs press
    // (taps are far shorter), and in toggle mode peek ignores taps of this key
    // while the bar is open.
    const COMMIT_TAP = {
        enabled: true,
        key: 'Alt', // bare key (KeyboardEvent.key) to tap
        taps: 2, // rapid taps needed to commit
        tapMaxMs: 250, // max press duration of a single tap
        windowMs: 400, // max pause between consecutive taps (release → release)
    };

    // "Peek": hold (or tap) a bare modifier to temporarily suspend effects so you
    // can see the page as-is — reveal blurred content, drop highlights, etc.
    // Peek deliberately SKIPS effects that change layout (display/size/position —
    // e.g. a [css] hide or resize): revealing those makes content jump/scroll
    // under the cursor, which is disorienting mid-hold. Layout effects are
    // detected best-effort from the [css] section; override per class with
    // --ucb-peek: on|off inside it. To reveal those too, use the persistent
    // all-effects toggle (KEYS.toggleStyles, Alt+Z).
    // Non-destructive (classes are removed then restored). Set enabled:false to
    // disable. The keys are bare modifiers (KeyboardEvent.key); any one triggers.
    const PEEK = {
        enabled: true,
        mode: 'hold', // 'hold' = active only while held; 'toggle' = tap to flip on/off
        keys: ['Shift', 'Alt'], // bare modifier keys that trigger (either one, not combined)
        holdDelayMs: 1000, // hold mode: ignore presses shorter than this — long enough that pressing a hotkey combo (Alt+R/…) never trips a peek; also ignores Shift-for-capitals
        tapMaxMs: 300, // toggle mode: max press duration still counted as a deliberate tap
    };

    // Unload images inside HIDDEN content: when a rule's action hides its target
    // (a [css] class with display:none / visibility:hidden, e.g. the .ucb-hide
    // recipe), the src/srcset of contained <img>/<source> elements are stripped.
    // Measured best-effort behavior (headless Chrome):
    //   - lazy images inserted into the live DOM: never requested at all
    //   - eager images / detached-fragment inserts: the request dispatches at
    //     node creation (unavoidable; may still count against rate limits) but
    //     the strip ABORTS the download at ~0 bytes — bandwidth and cache saved
    //   - images in the initial HTML: fetched by the browser's preload scanner
    //     before any userscript runs; cannot be stopped from here
    // While a hide rule is active the observer scans undebounced to act inside
    // the insertion microtask, and nodes inserted into an already-hidden target
    // are unloaded via an ancestor check. Sources are restored (and only then
    // fetched) on a deliberate reveal — the Alt+Z toggle or a group hover — but
    // NOT by peek (hide is peek-exempt anyway). Note: a stripped src can confuse
    // site scripts that re-read it; disable if a site misbehaves.
    const UNLOAD = {
        enabled: true,
    };

    // -----------------------------------------------------------------------
    //  DEFERRED IDEAS (revisit if the built-in blur + [css] actions fall short)
    // -----------------------------------------------------------------------
    //  Most "extra actions" (hide, dim, grayscale, darken, resize, …) are now
    //  user-definable via the [css] section: write a .ucb-NAME class and use NAME
    //  in a rule's action field. The only obscuring effect plain CSS can't do:
    //    pixelate    — true pixelation needs a canvas/SVG filter, not CSS
    //  Other ideas:
    //    Match commented-out HTML (e.g. <!-- ... alt="..." -->) — niche; skipped.

    // -----------------------------------------------------------------------
    //  DEFAULT CONFIG (also serves as inline documentation)
    // -----------------------------------------------------------------------

    const DEFAULT_RULES = `\
# Any Content Blur — reference (read-only; always matches the installed version)
#
# ── Settings files ────────────────────────────────────────────────────────
#
# Config is split into settings files, each behaving like its own userscript.
# Use "Copy to new file" to start from this text, or "New" for an empty file.
#
#   [match]       URL patterns (one per line, glob or /regex/, like @match) the
#                 file runs on. All enabled files that match a page run, in
#                 NAME order (character order: - before 0-9 before a-z); an
#                 element already taken by an earlier rule is skipped by later
#                 ones, also across files — prefix names (10-…, 50-…) to set
#                 the order.
#                 *://*/* = everywhere. Several lines = any of them, e.g. one
#                 regex covering every Jenkins/Gerrit/MediaWiki host.
#   [exclude]     URL patterns the file must NOT run on (wins over [match]).
#                 To keep a global file off a site, exclude the site here.
#   [use]         library file names (one per line) whose lists this file uses.
#
# Lists and CSS are private to their file. A file WITHOUT [match] is a library:
# it never runs by itself; files that [use] it reference its lists as
# @LIB/NAME (also @LIB/glob*) and get its [css] injected while they run. A
# library's own [use] and [rules] are ignored. The Enabled flag only applies to
# running files — an imported library is used even when disabled.
#
# A rule's url-pattern narrows further within the file's [match]: write * for
# "wherever the file runs".
#
# Example:
#   [match]
#   *://www.example.com/*
#   [use]
#   common                           (a library file named "common")
#   [rules]
#   * | text | @common/words_violent | blur | self | hover
#
# ── Sections ──────────────────────────────────────────────────────────────
#
# Besides [match] / [exclude] / [use], three kinds of sections:
#
#   [list:NAME]   reusable pattern list — one regex per line (case-insensitive).
#                 Reference it from a rule as @NAME. A list line may itself be
#                 @OTHER to include another list (nesting up to 5 levels deep;
#                 reference loops and self-references are silently dropped).
#                 Wildcards (* / ?) are supported in list names: @text_* expands
#                 to every list whose name matches that glob. This works both in
#                 rule patterns and in list entries. Imported library lists
#                 are named LIB/NAME, so @* matches them too.
#                 A line starting with @ is always a list reference — to match a
#                 literal "@foo" use a regex, e.g. /^@foo$/ or /@foo/.
#
#   [css]         raw CSS, injected verbatim into the page. Define your own effect
#                 classes named .ucb-NAME and use NAME as a rule action (see
#                 "action" below) to get effects beyond the built-in blur —
#                 darken, grayscale, hide, resize, etc. — with plain CSS. For
#                 reveal-on-hover add your own .ucb-NAME.ucb-hover:hover rule (the
#                 script adds .ucb-hover to elements whose rule has the hover
#                 option). Inside [css], # and // are NOT comments (so #id
#                 selectors work); use /* … */ for CSS comments.
#                 Peek (hold Shift/Alt) skips classes that change LAYOUT
#                 (display, size, margins, position, … — detected best-effort)
#                 so revealing them can't make the page jump/scroll mid-peek;
#                 the all-effects toggle (Alt+Z) reveals those too. Override the
#                 detection per class by declaring --ucb-peek: off (never peek)
#                 or --ucb-peek: on (always peek) inside the class body.
#                 Classes that HIDE their target (display:none or
#                 visibility:hidden) also get its images unloaded — src/srcset
#                 stripped so hidden images aren't fetched (best effort) and
#                 restored on Alt+Z / group hover. See the UNLOAD constant.
#
#   [rules]       one rule per line, pipe-separated:
#                     url-pattern | source | patterns | action | scope | options
#
# Outside [css], lines starting with # or // and blank lines are ignored
# (no /* */ block comments there — a line starting with /* is an error).
#
# ── Fields ────────────────────────────────────────────────────────────────
#
# url-pattern   Glob  *://host/path/*   (* matches anything, incl. /)
#               Regex /pattern/flags    (matched against the full URL)
#
# source        Comma list of what text to match against:
#                 text    visible text (innerText of text nodes)
#                 alt     image alt attributes
#                 title   title attributes (tooltips)
#                 url     link href + image src attributes
#                 user    username extracted from profile-style URLs, e.g.
#                         /profile/<name>, /user/<name>, /u/<name>, ?user=<name>
#                 class   CSS class names — patterns are tested against EACH
#                         class on an element individually, so "exact" matches
#                         one whole class name (e.g. "icon-interest-x") and a
#                         bare word matches inside hyphenated names too. Handy
#                         when a marker class (interest/genre/status icon) says
#                         more than the visible content does.
#                 *       all of the above EXCEPT class — class matching scans
#                         every classed element, so it stays explicit opt-in
#
# patterns      Comma list of:
#                 @NAME       reference a [list:NAME] block
#                 word        literal, WHOLE-WORD match (auto-escaped): test
#                             matches the word "test" but not "tested". Spaces are
#                             literal (foo bar). Wildcards: * = any run, ? = one
#                             char; write \\* \\? for a literal * or ?.
#                 "text"      EXACT full-value match (^...$): "mike" matches only
#                             the whole value "mike", not "mike2". Wildcards still
#                             work inside; \\" is a literal quote.
#                 /regex/i    raw regex (flags optional); matches as a SUBSTRING.
#                             Add \\b...\\b for whole-word or ^...$ for full value.
#                 !TOKEN      EXCLUDE: any of the above prefixed with ! (!word,
#                             !"text", !/regex/, !@NAME). A value matches the rule
#                             only if a plain pattern matches it AND no ! pattern
#                             does — each text/attribute value is checked on its
#                             own. Needs at least one plain pattern. Write \\! for
#                             a literal leading !. Rule patterns only (not in lists).
#               A , or | inside "..." is literal (not a separator). A , or | inside
#               a /regex/ is also literal, as long as the regex starts the field or
#               the token (a leading /) — so alternation like /(a|b)/ works in the
#               url-pattern and in a pattern token. (A [list:NAME] line still works
#               too — list entries are one per line, so | and , are always literal
#               there.)
#
# action        Comma list of effects applied to the scoped element. Each effect
#               is a CSS class — the script adds class .ucb-NAME:
#                 blur            built-in filter blur (reveals on hover). Tune
#                                 strength as blur:N px, e.g. blur:20 — bare
#                                 "blur" uses the default BLUR_STRENGTH_PX.
#                 NAME            any .ucb-NAME class you defined in a [css] block,
#                                 e.g. "dark" applies your .ucb-dark rule. Writing
#                                 the full "ucb-dark" works too (the prefix is
#                                 added for you and a leading one is stripped).
#                 NAME:VALUE      also sets CSS var --ucb-NAME to VALUE on the
#                                 element, so [css] can read it: dim:0.1 pairs with
#                                 .ucb-dim { opacity: var(--ucb-dim, 0.3) }
#               Empty defaults to blur. Combine freely: "blur:6, dark".
#
# scope         Which element gets blurred, relative to the match:
#                 self            the matched element (text → its parent element)
#                 up:N            climb N ancestor elements (e.g. up:2)
#                 closest:SEL     nearest ancestor matching CSS selector SEL
#                 row             alias for closest:tr (old table layouts)
#               Optional modifiers, space-separated after the base scope:
#                 prev:N next:N   also apply the effect to the N sibling elements
#                                 before/after the scoped target — for layouts where
#                                 one logical item spans several siblings, e.g. old
#                                 <table> galleries with the image and the username
#                                 in separate rows. With hover, pointing at ANY
#                                 member reveals the whole group at once.
#                                 Example: row prev:1 next:1
#
# options       Comma list (optional):
#                 hover           reveal on mouse-over (default: ON)
#                 no-hover        do not reveal on hover
#                 freeze          stop motion inside the blurred area — pause
#                                 videos + CSS animations and snapshot animated
#                                 images (GIF/WebP/APNG) to a still frame, so a
#                                 blurred animation can't leak context via motion.
#                                 With hover, motion resumes while the area is
#                                 revealed and re-freezes when you leave it.
#                 if-none         INVERT: apply the action to every scope container
#                                 whose text has NO match (instead of to the
#                                 matches). Needs a closest:SELECTOR (or row) scope,
#                                 which defines the containers; text source only.
#                                 Only the texts inside in:SEL (if set) count; a
#                                 container without any counted text is skipped.
#                                 Runs after the normal rules, and like any rule
#                                 skips an element an earlier rule already took.
#                 in:SELECTOR     only match inside elements matching this CSS
#                                 selector (the matched text / attribute element
#                                 must have such an ancestor, or be one). Limits
#                                 WHERE a match may be, not the scope: in:.mod with
#                                 closest:.card still marks the whole card. Must be
#                                 the LAST option — it takes the rest of the
#                                 field, so commas in the selector are fine:
#                                 no-hover, in:.results, aside .comments
#
# ── Examples (remove the leading # to enable) ───────────────────────────────
#
# [list:words_violent]
# gore                     (literal, whole word)
# murder*                  (literal + wildcard: words starting with "murder")
# /blood(y)?/              (regex, substring — also matches inside words)
# /\bblood\b/              (regex, whole word)
# /^blood$/                (regex, whole text)
# /kill(ed|ing)?/          (regex alternation, substring)
#
# [list:users]
# /^some_user_name$/       (regex, exact username)
# /^another_user$/         (regex, exact username)
# *troll*                  (literal + wildcard: any text containing "troll", incl. "controller")
#
# [list:all-bad]           (compose lists explicitly)
# @words_*                 (wildcard: includes every list whose name starts with "words_")
# @users
# spoiler                  (lists may mix @refs and plain patterns)
#
# [list:everything]        (wildcard: every defined list — self-ref text_everything ignored)
# @*
#
# [list:friends]           (people to EMPHASIZE, not hide — see the .ucb-hl rule)
# /^my_user_name$/
# /^a_friend$/
# John Doe                 (your real name in article text, whole-word)
#
# [css]                    (custom effect classes — used via their NAME as an action)
# /* darken instead of blur; reveal on hover */
# .ucb-dark { filter: brightness(0.12) !important; transition: filter 0.2s ease; }
# .ucb-dark.ucb-hover:hover { filter: none !important; }
# /* opacity dim whose strength a rule can override via dim:N */
# .ucb-dim { opacity: var(--ucb-dim, 0.25) !important; transition: opacity 0.2s ease; }
# .ucb-dim.ucb-hover:hover { opacity: 1 !important; }
# /* hard hide — no hover reveal once removed from layout. display:none changes
#    layout, so peek auto-skips it (no page jump); Alt+Z still reveals it. Images
#    inside hidden targets are not fetched (best effort — UNLOAD constant). */
# .ucb-hide { display: none !important; }
# /* recipe: block accidental clicks on blurred content. NOTE pointer-events:none
#    also disables the element's own :hover reveal — pair it with no-hover, or
#    reveal via peek (hold Shift/Alt) or a prev/next group hover instead. */
# .ucb-noclick { pointer-events: none !important; }
# /* HIGHLIGHT (emphasize instead of hide): a theme-proof ring that pops on any
#    background — black + white + colored layers, no layout shift. Actions aren't
#    only for obfuscating; any CSS works. Use the no-hover option so it stays. */
# .ucb-hl { outline: 2px solid #ff8c00 !important; outline-offset: -1px !important;
#           box-shadow: 0 0 0 1px #000, 0 0 0 3px #fff, 0 0 6px 3px rgba(255,140,0,.7) !important; }
# /* parent wins: no second ring on nested matches inside an already-highlighted
#    element (e.g. a matched row AND a matched link within it). The same one-line
#    pattern works for any effect: .ucb-dim .ucb-dim { opacity: 1 !important; } */
# .ucb-hl .ucb-hl { outline: none !important; box-shadow: none !important; }
#
# [rules]
# # blur the whole table row of a flagged username on one site:
# *://site.com/*   | user          | @users             | blur       | row   | hover
# # one gallery item spans two <tr> rows (image row above the username row):
# # blur BOTH rows when the username matches; hovering either reveals the pair:
# *://site.com/*   | user          | @users             | blur       | row prev:1 | hover
# # blur any visible text containing a @words_violent word, anywhere, reveal on hover:
# *://*/*          | text          | @words_violent     | blur       | self  | hover
# # blur image + caption when alt/title or filename matches, on all sites,
# # using a wildcard directly in the rule's patterns field:
# *://*/*          | alt,title,url | @words_*           | blur       | up:1  | hover
# # stronger blur (20px) on flagged text:
# *://*/*          | text          | @words_violent     | blur:20    | self  | hover
# # darken (custom [css] action) image + caption instead of blurring:
# *://*/*          | alt,title,url | @words_*           | dark       | up:1  | hover
# # blur AND dim together, overriding the dim level for this rule:
# *://*/*          | text          | @words_violent     | blur, dim:0.1 | self | hover
# # HIGHLIGHT your own name + friends' usernames (the opposite of blurring):
# *://*/*          | text,user     | @friends           | hl         | up:1  | no-hover
# # highlight a card when any line mentions a wanted term — but not when that same
# # line also contains an unwanted one ("Minions deal 10% increased Damage"):
# *://*/*          | text          | @wanted, !@unwanted, !minion* | hl | up:3 | no-hover
# # only inside the comment section of a site (rest of the page untouched):
# *://site.com/*   | text          | @words_violent     | blur       | self  | hover, in:#comments
# # dim every result card that has NOT a single wanted line (if-none inverts):
# *://site.com/*   | text          | @wanted, !@unwanted | dim | closest:.card | if-none
# # hide gallery items whose interest/genre icon carries a marker class — the
# # class says what the content is even when text/alt/url don't; scope climbs
# # from the icon div to the whole item:
# *://site.com/*   | class         | "icon-interest-x"  | hide       | up:2  | no-hover

[rules]
`;

    // -----------------------------------------------------------------------
    //  SHARED HELPERS
    // -----------------------------------------------------------------------

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Split on a top-level single-char delimiter, protecting delimiters inside two
    // kinds of spans:
    //   "…"      a double-quoted literal (\" = literal quote)
    //   /…/flags a regex literal — but ONLY when it begins a field or a ,/|-separated
    //            token (leading whitespace aside), the only place the grammar allows
    //            one. So a | (alternation) or , inside such a regex is part of the
    //            pattern, not a separator — e.g. a URL pattern /host\/(a|b)/ or a
    //            /a|b/ pattern token stay intact. (A regex NOT at a token start is not
    //            protected, but the grammar never puts one there.)
    // Whitespace is not trimmed.
    function splitTopLevel(str, delim) {
        const out = [];
        let cur = '';
        let inQuote = false;
        let inRegex = false;
        // True at the string start and just after a , or | (through leading
        // whitespace) — i.e. wherever a new token begins and a leading / is a regex.
        let atTokenStart = true;
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            if (inQuote) {
                if (c === '\\' && str[i + 1] === '"') {
                    cur += '\\"';
                    i++;
                } else {
                    cur += c;
                    if (c === '"') inQuote = false;
                }
            } else if (inRegex) {
                if (c === '\\' && i + 1 < str.length) {
                    cur += c + str[i + 1]; // \/ etc. — an escaped char can't close the regex
                    i++;
                } else {
                    cur += c;
                    if (c === '/') inRegex = false; // closing delimiter; any flags copy as normal chars
                }
            } else if (c === '"') {
                inQuote = true;
                cur += c;
                atTokenStart = false;
            } else if (c === '/' && atTokenStart) {
                inRegex = true;
                cur += c;
                atTokenStart = false;
            } else if (c === '|' || c === ',') {
                // Both are grammar separators (| between fields, , between tokens);
                // whichever is NOT the active delimiter is copied literally, but either
                // way a new token starts after it, so a following /…/ is a regex.
                if (c === delim) {
                    out.push(cur);
                    cur = '';
                } else {
                    cur += c;
                }
                atTokenStart = true;
            } else {
                cur += c;
                if (c !== ' ' && c !== '\t') atTokenStart = false;
            }
        }
        out.push(cur);
        return out;
    }

    // Report a config problem: always log it, and push a structured record when an
    // `issues` collector is provided (used by the settings dialog to gate saving).
    // severity: 'error' (blocks save) | 'warning' (shown, allowed).
    function reportIssue(issues, lineNum, severity, message) {
        console.warn(LOG_PREFIX, lineNum ? `Line ${lineNum}: ${message}` : message);
        if (issues) issues.push({ line: lineNum, severity, message });
    }

    // Convert a list-name glob (with * and ?) into a RegExp anchored to the full name.
    function listNameGlobToRegex(glob) {
        const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp('^' + escaped + '$', 'i');
    }

    // Glob (with *) or /regex/flags → { regex }. Mirrors any-image-resizer.
    function parseUrlPattern(src, issues, lineNum) {
        if (src.startsWith('/')) {
            const lastSlash = src.lastIndexOf('/');
            if (lastSlash > 0) {
                try {
                    return { regex: new RegExp(src.slice(1, lastSlash), src.slice(lastSlash + 1) || 'i') };
                } catch (e) {
                    reportIssue(issues, lineNum, 'error', `invalid regex URL pattern "${src}": ${e.message}`);
                    return null;
                }
            }
        }
        try {
            const escaped = src.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            return { regex: new RegExp('^' + escaped + '$', 'i') };
        } catch (e) {
            reportIssue(issues, lineNum, 'error', `invalid glob URL pattern "${src}": ${e.message}`);
            return null;
        }
    }

    // -----------------------------------------------------------------------
    //  CONFIG PARSING
    // -----------------------------------------------------------------------

    function isWordChar(c) {
        return /\w/.test(c);
    }

    // Body of a literal pattern (no anchors/boundaries): escape regex specials,
    // expand the simplified wildcards (* = any run, ? = one char), and honor
    // \* \? \\ \" \/ \! as the literal characters. The caller decides anchoring.
    function literalBody(text) {
        let body = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '\\' && '*?\\"/!'.includes(text[i + 1])) {
                body += escapeRegExp(text[i + 1]); // literal *, ?, \, ", /, or !
                i++;
            } else if (c === '*') {
                body += '.*';
            } else if (c === '?') {
                body += '.';
            } else {
                body += escapeRegExp(c);
            }
        }
        return body;
    }

    // A bare literal token → whole-word match: \b…\b where the matched edge is a
    // literal word char (not a wildcard). So "test" matches only the whole word.
    function literalToFragment(text) {
        const body = literalBody(text);
        const first = text[0];
        const last = text[text.length - 1];
        const lead = first !== '*' && first !== '?' && first !== '\\' && isWordChar(first) ? '\\b' : '';
        const tail = last !== '*' && last !== '?' && isWordChar(last) ? '\\b' : '';
        return lead + body + tail;
    }

    // A single regex *fragment* from one pattern token (@ref expanded by the caller):
    //   "exact"   → ^…$ full-value match (wildcards active inside; \" is a literal ")
    //   /regex/   → used verbatim (delimiters + flags dropped)
    //   bare word → whole-word literal (see literalToFragment)
    function patternTokenToFragment(token) {
        const t = token.trim();
        if (!t) return null;
        if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
            return '^' + literalBody(t.slice(1, -1)) + '$';
        }
        if (t.startsWith('/')) {
            const lastSlash = t.lastIndexOf('/');
            if (lastSlash > 0) return t.slice(1, lastSlash); // raw regex (drop delimiters + flags)
        }
        return literalToFragment(t);
    }

    // Combine regex fragments into one case-insensitive RegExp. Each fragment
    // already carries its own boundaries (literal terms are whole-word).
    function buildCombinedRegex(fragments, issues, lineNum) {
        const valid = [];
        for (const frag of fragments) {
            if (!frag) continue;
            try {
                new RegExp(frag); // validate in isolation
                valid.push(frag);
            } catch (e) {
                reportIssue(issues, lineNum, 'warning', `skipping invalid pattern "${frag}": ${e.message}`);
            }
        }
        if (!valid.length) return null;
        try {
            return new RegExp('(?:' + valid.join('|') + ')', 'i');
        } catch (e) {
            reportIssue(
                issues,
                lineNum,
                'error',
                `could not build combined regex from "${valid.join('|')}": ${e.message}`
            );
            return null;
        }
    }

    const VALID_SOURCES = ['text', 'alt', 'title', 'url', 'user', 'class'];
    const MAX_LIST_DEPTH = 5; // max nested [list:…] reference levels before giving up

    function parseSource(field, issues, lineNum) {
        const parts = field
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const out = [];
        const add = (s) => out.includes(s) || out.push(s);
        for (const p of parts) {
            // '*' excludes class: class rules scan every [class] element, so that
            // cost (and the surprise of text words matching class names) stays
            // explicit opt-in — write "*, class" to really mean everything.
            if (p === '*') VALID_SOURCES.filter((s) => s !== 'class').forEach(add);
            else if (VALID_SOURCES.includes(p)) add(p);
            else reportIssue(issues, lineNum, 'warning', `unknown source "${p}"`);
        }
        return out;
    }

    // Scope = base (self | up:N | closest:SEL | row) plus optional space-separated
    // sibling modifiers prev:N / next:N. Modifiers are pulled off the tail so a
    // closest:SEL selector containing spaces stays intact (a valid CSS selector
    // can never end in prev:N / next:N).
    function parseScope(field, issues, lineNum) {
        let t = (field || 'self').trim();
        const mods = { prev: 0, next: 0 };
        let m;
        while ((m = t.match(/(?:^|\s+)(prev|next):(\d+)$/i))) {
            mods[m[1].toLowerCase()] = parseInt(m[2], 10);
            t = t.slice(0, m.index).trim();
        }
        let base = null;
        if (!t || t === 'self') base = { kind: 'self' };
        else if (t === 'row') base = { kind: 'closest', selector: 'tr' };
        else if (/^up:\d+$/i.test(t)) base = { kind: 'up', n: parseInt(t.slice(3), 10) };
        else if (/^closest:/i.test(t)) {
            const selector = t.slice(8).trim();
            if (selector) base = { kind: 'closest', selector };
        }
        if (!base) {
            reportIssue(issues, lineNum, 'warning', `unknown scope "${t}", using self`);
            base = { kind: 'self' };
        }
        return { ...base, ...mods };
    }

    // Class names the script uses internally — a custom action may not reuse them.
    // 'peek' is reserved because --ucb-peek is the per-class peek override in [css].
    const RESERVED_ACTIONS = new Set(['hover', 'freeze', 'frozen', 'peek']);

    // Parse the action field into a list of { name, value } effects. Each becomes a
    // CSS class .ucb-<name> on the scoped element; an optional :value is exposed as
    // the CSS custom property --ucb-<name> so [css] rules can read it via var().
    // "blur" is the only built-in (styled by the script); any other name refers to
    // a class the user defines in a [css] block. Empty field defaults to blur.
    function parseAction(field, issues, lineNum) {
        const out = [];
        const seen = new Set();
        for (const raw of (field || 'blur').split(',')) {
            const t = raw.trim();
            if (!t) continue;
            const ci = t.indexOf(':');
            // Accept both the bare name (hide) and the full class (ucb-hide) — the
            // script adds the ucb- prefix itself, so strip a leading one if present.
            const name = (ci === -1 ? t : t.slice(0, ci)).trim().toLowerCase().replace(/^ucb-/, '');
            const value = ci === -1 ? '' : t.slice(ci + 1).trim();
            if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
                reportIssue(issues, lineNum, 'warning', `invalid action name "${name}", skipping`);
                continue;
            }
            if (RESERVED_ACTIONS.has(name)) {
                reportIssue(issues, lineNum, 'warning', `action "${name}" is reserved, skipping`);
                continue;
            }
            if (ci !== -1 && !value) {
                reportIssue(issues, lineNum, 'warning', `action "${name}" has an empty value, ignoring it`);
            }
            if (seen.has(name)) continue;
            seen.add(name);
            out.push({ name, value: value || null });
        }
        if (!out.length) {
            reportIssue(issues, lineNum, 'error', `no valid action: ${field}`);
            return null;
        }
        return out;
    }

    // in:SEL takes the rest of the field (like closest:SEL in scope), so the
    // selector may contain commas and keeps its case.
    function parseOptions(field, issues, lineNum) {
        const opts = { hover: true, freeze: false, within: null, ifNone: false };
        if (!field) return opts;
        const inAt = field.search(/(?:^|,)\s*in:/i);
        if (inAt !== -1) {
            const selector = field.slice(field.indexOf(':', inAt) + 1).trim();
            field = field.slice(0, inAt);
            try {
                document.createDocumentFragment().querySelector(selector); // throws on invalid syntax
                opts.within = selector;
            } catch {
                reportIssue(issues, lineNum, 'warning', `invalid in: selector "${selector}", ignoring it`);
            }
        }
        for (const raw of field.split(',')) {
            const t = raw.trim().toLowerCase();
            if (!t) continue;
            if (t === 'hover') opts.hover = true;
            else if (t === 'no-hover') opts.hover = false;
            else if (t === 'freeze') opts.freeze = true;
            else if (t === 'if-none') opts.ifNone = true;
            else reportIssue(issues, lineNum, 'warning', `unknown option "${t}"`);
        }
        return opts;
    }

    // Flatten a [list:NAME] into regex fragments, following nested @refs (including
    // wildcards such as @text_* or @*). seenFragments deduplicates pattern strings
    // across all lists; visited guards against reference loops; depth caps nesting.
    function expandListFragments(name, lists, out, seenFragments, visited, depth, issues, lineNum) {
        // Wildcard: resolve horizontally to all matching list names at the same depth.
        // This means @text_* inside a rule and @text_* inside a list both expand each
        // match at the caller's depth — the wildcard itself is not a nesting level.
        if (name.includes('*') || name.includes('?')) {
            const re = listNameGlobToRegex(name);
            let anyMatch = false;
            for (const listName of lists.keys()) {
                if (re.test(listName)) {
                    anyMatch = true;
                    expandListFragments(listName, lists, out, seenFragments, visited, depth, issues, lineNum);
                }
            }
            if (!anyMatch) reportIssue(issues, lineNum, 'warning', `wildcard @${name} matched no lists`);
            return;
        }
        if (!lists.has(name)) {
            reportIssue(issues, lineNum, 'error', `unknown list @${name}`);
            return;
        }
        // Self-ref and cycles are silently dropped (warnings only — rules remain valid,
        // those refs are just skipped). This is especially expected with wildcards: e.g.
        // @text_* inside [list:text_all] naturally matches text_all itself.
        if (visited.has(name)) {
            reportIssue(issues, lineNum, 'warning', `skipping already-visited list @${name} (self-reference or cycle)`);
            return;
        }
        if (depth > MAX_LIST_DEPTH) {
            reportIssue(issues, lineNum, 'warning', `list nesting too deep (>${MAX_LIST_DEPTH}) at @${name}, stopping`);
            return;
        }
        visited.add(name);
        for (const listLine of lists.get(name)) {
            const t = listLine.trim();
            if (t.startsWith('!')) {
                // Negation is a rule-level operator (!@NAME excludes a whole list);
                // inside a list it would be ambiguous once lists nest.
                reportIssue(
                    issues,
                    lineNum,
                    'warning',
                    `skipping "${t}" in list @${name}: ! (exclude) only works in rule patterns — write \\! for a literal !`
                );
                continue;
            }
            if (t.startsWith('@')) {
                expandListFragments(
                    t.slice(1).toLowerCase(),
                    lists,
                    out,
                    seenFragments,
                    visited,
                    depth + 1,
                    issues,
                    lineNum
                );
            } else {
                const frag = patternTokenToFragment(t);
                if (frag !== null && !seenFragments.has(frag)) {
                    seenFragments.add(frag);
                    out.push(frag);
                }
            }
        }
    }

    // Section header → { type, name? }, or null when the line is not a header.
    // Shared by parseConfig(), fileHeader() and indexConfigRaw() so they agree.
    function sectionHeader(trimmed) {
        const listHeader = trimmed.match(/^\[list:([^\]]+)\]$/i);
        if (listHeader) return { type: 'list', name: listHeader[1].trim().toLowerCase() };
        const m = trimmed.match(/^\[(rules|css|match|exclude|use)\]$/i);
        return m ? { type: m[1].toLowerCase() } : null;
    }

    // Parse one settings file into
    //   { lists, rules, css, issues, match, exclude, use, isLibrary, libs }.
    // `issues` collects structured problems (errors block save; warnings are
    // advisory). `css` is the raw text of the [css] section, injected verbatim.
    // getLib(name) → the parsed library file, or null if there is no such file.
    // Imported lists are added as LIB/NAME. Lists are collected before rules are
    // parsed, so a rule may reference a list defined further down.
    function parseConfig(text, getLib = null, fileName = '') {
        const lists = new Map();
        const rules = [];
        const cssLines = [];
        const cssEntries = []; // { text, line } for balance checking
        const issues = [];
        const match = [];
        const exclude = [];
        const use = []; // { name, line }
        const ruleLines = []; // { line, lineNum }
        let section = null; // see sectionHeader()
        let lineNum = 0;

        for (const rawLine of text.split('\n')) {
            lineNum++;
            const trimmed = rawLine.trim();

            // Section headers are detected before comment filtering so we can switch
            // into/out of [css] — where # is a CSS id selector, not a comment.
            const header = sectionHeader(trimmed);
            if (header) {
                section = header;
                if (header.type === 'list') {
                    if (header.name.includes('/')) {
                        reportIssue(
                            issues,
                            lineNum,
                            'error',
                            `list name "${header.name}" may not contain / (used by @LIB/NAME)`
                        );
                    }
                    if (!lists.has(header.name)) lists.set(header.name, []);
                }
                continue;
            }

            // Inside [css]: capture verbatim (skip only blank lines). # and // stay
            // literal so #id selectors and CSS work; use /* … */ for CSS comments.
            if (section && section.type === 'css') {
                if (trimmed) {
                    cssLines.push(rawLine);
                    cssEntries.push({ text: rawLine, line: lineNum });
                }
                continue;
            }

            // Everywhere else: # and // are comments, blank lines are ignored.
            const line = trimmed;
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            // Block comments only exist inside [css]; elsewhere a line opening with /*
            // would silently become a list entry / rule, so flag it (best effort: only
            // line starts, since patterns and regexes may legitimately contain /*).
            if (line.startsWith('/*')) {
                reportIssue(
                    issues,
                    lineNum,
                    'error',
                    "'/*' block comments are only supported in [css]; use # or // per line here"
                );
                continue;
            }

            if (section && section.type === 'list') {
                lists.get(section.name).push(line);
                continue;
            }
            if (section && (section.type === 'match' || section.type === 'exclude')) {
                const up = parseUrlPattern(line, issues, lineNum);
                if (up) (section.type === 'match' ? match : exclude).push(up);
                continue;
            }
            if (section && section.type === 'use') {
                use.push({ name: line.toLowerCase(), line: lineNum });
                continue;
            }

            // Anything with pipes is a rule (allow rules even before a [rules] header).
            if (line.includes('|') || (section && section.type === 'rules')) {
                ruleLines.push({ line, lineNum });
                continue;
            }

            reportIssue(issues, lineNum, 'warning', `ignored (not in a section, no pipes): ${line}`);
        }

        checkCssBalance(cssEntries, issues);

        // No [match] = library: never runs by itself, so its own imports and rules
        // would have no effect (rules are still parsed below, for validation).
        const isLibrary = !match.length;
        const libs = []; // { name, css } of imported libraries, in [use] order
        if (isLibrary) {
            if (use.length) {
                reportIssue(
                    issues,
                    use[0].line,
                    'warning',
                    'no [match] (library): [use] is ignored — libraries cannot import'
                );
            }
            if (ruleLines.length) {
                reportIssue(issues, ruleLines[0].lineNum, 'warning', 'no [match] (library): its [rules] never run');
            }
        } else if (getLib) {
            for (const u of use) {
                if (libs.some((l) => l.name === u.name)) continue;
                const lib = u.name === fileName ? null : getLib(u.name);
                if (u.name === fileName) {
                    reportIssue(issues, u.line, 'error', '[use]: a file cannot import itself');
                } else if (!lib) {
                    reportIssue(issues, u.line, 'error', `[use]: no settings file named "${u.name}"`);
                } else if (!lib.isLibrary) {
                    reportIssue(
                        issues,
                        u.line,
                        'error',
                        `[use]: "${u.name}" has a [match] section — only libraries can be imported`
                    );
                } else {
                    if (lib.issues.some((i) => i.severity === 'error')) {
                        reportIssue(
                            issues,
                            u.line,
                            'warning',
                            `[use]: library "${u.name}" has errors (open it to see them)`
                        );
                    }
                    libs.push({ name: u.name, css: lib.css });
                    // Nested @refs inside a library list point to the library's own
                    // lists, so they get the same LIB/ prefix.
                    for (const [name, entries] of lib.lists) {
                        lists.set(
                            `${u.name}/${name}`,
                            entries.map((e) => (e.startsWith('@') ? `@${u.name}/${e.slice(1)}` : e))
                        );
                    }
                }
            }
        }

        for (const { line, lineNum: n } of ruleLines) {
            const rule = parseRuleLine(line, n, lists, issues);
            if (rule) {
                // Stable identity for debug mode: file name + the rule's position in
                // that file ("first rule = name#1"); raw + line let the user find it
                // (Ctrl+F the line in the settings textarea).
                rule.id = `${fileName}#${rules.length + 1}`;
                rule.raw = line;
                rule.line = n;
                rule.file = fileName;
                rules.push(rule);
            }
        }

        return { lists, rules, css: cssLines.join('\n'), issues, match, exclude, use, isLibrary, libs };
    }

    // Only the [match]/[exclude] patterns of a file — cheap enough to run for every
    // stored file on every page load, without parsing (and logging) the rest.
    function fileHeader(text) {
        const out = { match: [], exclude: [] };
        let section = null;
        for (const raw of text.split('\n')) {
            const t = raw.trim();
            const h = sectionHeader(t);
            if (h) {
                section = h.type;
                continue;
            }
            if ((section === 'match' || section === 'exclude') && t && !t.startsWith('#') && !t.startsWith('//')) {
                const up = parseUrlPattern(t);
                if (up) out[section].push(up);
            }
        }
        return out;
    }

    // Whether a file (parsed or fileHeader()) runs on `url`.
    function fileRunsOn(header, url = location.href) {
        return header.match.some((p) => p.regex.test(url)) && !header.exclude.some((p) => p.regex.test(url));
    }

    // Parse a stored file in the context of all files, resolving [use] by name.
    // Pass the same libCache across calls to parse each library only once.
    function parseFile(file, files, libCache = new Map()) {
        const getLib = (name) => {
            if (!libCache.has(name)) {
                const f = files.find((x) => x.name === name);
                libCache.set(name, f ? parseConfig(f.text, null, f.name) : null);
            }
            return libCache.get(name);
        };
        return parseConfig(file.text, getLib, file.name);
    }

    // Basic structural check of the [css] text: unclosed /* comments and unbalanced
    // { } ( ) [ ]. The browser silently drops broken CSS, so an unclosed comment
    // would otherwise swallow every rule after it without any hint.
    function checkCssBalance(entries, issues) {
        const stack = []; // { ch, line }
        const closers = { '}': '{', ')': '(', ']': '[' };
        let commentLine = 0;
        for (const { text, line } of entries) {
            let quote = null; // strings cannot span lines unescaped
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (commentLine) {
                    if (c === '*' && text[i + 1] === '/') {
                        commentLine = 0;
                        i++;
                    }
                } else if (quote) {
                    if (c === '\\') i++;
                    else if (c === quote) quote = null;
                } else if (c === '/' && text[i + 1] === '*') {
                    commentLine = line;
                    i++;
                } else if (c === '"' || c === "'") {
                    quote = c;
                } else if (c === '{' || c === '(' || c === '[') {
                    stack.push({ ch: c, line });
                } else if (closers[c]) {
                    if (stack.at(-1)?.ch !== closers[c]) {
                        reportIssue(issues, line, 'error', `[css]: unexpected '${c}' (no matching '${closers[c]}')`);
                        return;
                    }
                    stack.pop();
                }
            }
        }
        if (commentLine) {
            reportIssue(
                issues,
                commentLine,
                'error',
                "[css]: comment opened with '/*' is never closed with '*/' (swallows all CSS after it)"
            );
            return;
        }
        for (const { ch, line } of stack) {
            reportIssue(issues, line, 'error', `[css]: '${ch}' is never closed`);
        }
    }

    function parseRuleLine(line, lineNum, lists, issues) {
        const fields = splitTopLevel(line, '|').map((f) => f.trim());
        if (fields.length < 4) {
            reportIssue(issues, lineNum, 'error', `expected at least 4 fields (url|source|patterns|action): ${line}`);
            return null;
        }
        const [rawUrl, rawSource, rawPatterns, rawAction, rawScope, rawOptions] = fields;

        const urlPattern = parseUrlPattern(rawUrl, issues, lineNum);
        if (!urlPattern) return null;

        const sources = parseSource(rawSource, issues, lineNum);
        if (!sources.length) {
            reportIssue(issues, lineNum, 'error', `no valid source: ${rawSource}`);
            return null;
        }

        const actions = parseAction(rawAction, issues, lineNum);
        if (!actions) return null;

        const options = parseOptions(rawOptions, issues, lineNum);

        // Resolve patterns: @ref → (possibly nested/wildcard) list fragments, else
        // inline token. seenFragments deduplicates across all refs + inline tokens so
        // overlapping lists (e.g. @dark and @text_* both yielding "gore") produce only
        // one regex branch — unique by fragment string, not semantic equivalence.
        // A leading ! puts the token into the exclude set instead (see scanText).
        const include = { fragments: [], seen: new Set() };
        const exclude = { fragments: [], seen: new Set() };
        for (const tok of splitTopLevel(rawPatterns, ',')) {
            let t = tok.trim();
            const set = t.startsWith('!') ? exclude : include;
            if (set === exclude) t = t.slice(1).trim();
            if (!t) continue;
            if (t.startsWith('@')) {
                expandListFragments(
                    t.slice(1).toLowerCase(),
                    lists,
                    set.fragments,
                    set.seen,
                    new Set(),
                    1,
                    issues,
                    lineNum
                );
            } else {
                const frag = patternTokenToFragment(t);
                if (frag !== null && !set.seen.has(frag)) {
                    set.seen.add(frag);
                    set.fragments.push(frag);
                }
            }
        }
        if (!include.fragments.length && exclude.fragments.length) {
            reportIssue(issues, lineNum, 'error', `only ! (exclude) patterns, nothing to match: ${rawPatterns}`);
            return null;
        }
        const regex = buildCombinedRegex(include.fragments, issues, lineNum);
        if (!regex) {
            reportIssue(issues, lineNum, 'error', `no valid patterns: ${rawPatterns}`);
            return null;
        }
        const excludeRegex = exclude.fragments.length ? buildCombinedRegex(exclude.fragments, issues, lineNum) : null;

        const scope = parseScope(rawScope, issues, lineNum);
        if (options.ifNone) {
            // if-none has no matched element to start from — the scope selector is
            // what defines the containers to check.
            if (scope.kind !== 'closest') {
                reportIssue(issues, lineNum, 'error', `if-none needs a closest:SELECTOR (or row) scope: ${line}`);
                return null;
            }
            if (sources.some((s) => s !== 'text')) {
                reportIssue(issues, lineNum, 'warning', 'if-none only checks text, ignoring the other sources');
            }
            sources.splice(0, sources.length, 'text');
        }
        return { urlPattern, sources, regex, excludeRegex, actions, scope, options };
    }

    // A rule's match on one value: the include regex hits and no exclude pattern
    // does. Returns the exec result (for the debug label) or null.
    function matchRule(rule, value) {
        const m = rule.regex.exec(value); // exec (no /g flag) also yields the matched substring for debug
        return m && !rule.excludeRegex?.test(value) ? m : null;
    }

    // -----------------------------------------------------------------------
    //  SETTINGS FILES (storage)
    // -----------------------------------------------------------------------

    function newFileId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // Run order = name order, by plain character code (0-9 before a-z, - before
    // both), so a prefix like 10-… / 50-… sets the order — see the reference.
    function sortFiles(files) {
        return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }

    // Stored files in run order, migrating the legacy single config on first use:
    // it becomes file "main" running everywhere (its rules keep their own url
    // patterns, so behavior is unchanged). The legacy key is left untouched for
    // rollback.
    async function getFiles() {
        const files = await GM.getValue(FILES_KEY, null);
        if (Array.isArray(files)) return sortFiles(files);
        // DEPRECATED (2026-10-12): legacy migration below — remove once all installs
        // have run it (docs/TODO.md); then just return [] here.
        const legacy = await GM.getValue(STORAGE_KEY, null);
        const migrated = [];
        if (legacy != null && legacy.trim() && legacy.trim() !== DEFAULT_RULES.trim()) {
            // Rule lines may precede the first section header (allowed in the old
            // format); keep them rules once [match] is prepended.
            const firstContent = legacy.split('\n').find((l) => {
                const t = l.trim();
                return t && !t.startsWith('#') && !t.startsWith('//');
            });
            const needRules = firstContent !== undefined && !sectionHeader(firstContent.trim());
            const head =
                '# migrated from the single-config version\n[match]\n*://*/*\n' + (needRules ? '\n[rules]\n' : '\n');
            migrated.push({ id: newFileId(), name: 'main', enabled: true, text: head + legacy });
        }
        await GM.setValue(FILES_KEY, migrated);
        return migrated;
    }

    async function saveFiles(files) {
        await GM.setValue(FILES_KEY, files);
    }

    // Replace one file's text in the CURRENT stored state (not a stale copy), so
    // a quick-add never overwrites concurrent edits to other files.
    async function saveFileText(id, text) {
        const files = await getFiles();
        const f = files.find((x) => x.id === id);
        if (!f) return false;
        f.text = text;
        await saveFiles(files);
        return true;
    }

    // -----------------------------------------------------------------------
    //  RULE STATE
    // -----------------------------------------------------------------------

    let activeRules = [];
    let activeFiles = []; // names of the files running on this page, in run order
    let customCss = ''; // [css] of the active files + their libraries, injected by ensureStyles()

    // Every enabled file whose [match] fits this page runs, in name order. A
    // library's CSS comes before its importer's (so the importer can override it)
    // and is injected only once even when several active files use it.
    async function loadRules() {
        const files = await getFiles();
        const libCache = new Map();
        const cssParts = [];
        const cssLibs = new Set();
        const rules = [];
        activeFiles = [];
        for (const f of files) {
            if (!f.enabled || !fileRunsOn(fileHeader(f.text))) continue;
            const parsed = parseFile(f, files, libCache);
            activeFiles.push(f.name);
            for (const lib of parsed.libs) {
                if (cssLibs.has(lib.name) || !lib.css) continue;
                cssLibs.add(lib.name);
                cssParts.push(`/* library: ${lib.name} */\n${lib.css}`);
            }
            if (parsed.css) cssParts.push(`/* file: ${f.name} */\n${parsed.css}`);
            rules.push(...parsed.rules);
        }
        customCss = cssParts.join('\n');
        const cssInfo = analyzeEffectCss(customCss);
        peekExempt = cssInfo.peekExempt;
        hiddenActions = cssInfo.hiddenActions;
        activeRules = rules.filter((r) => r.urlPattern.regex.test(location.href));
        unloadActive = UNLOAD.enabled && activeRules.some(ruleHides);
        hiddenSelector = [...hiddenActions].map((c) => '.' + c).join(', ');
        return activeRules;
    }

    // -----------------------------------------------------------------------
    //  CLOUDFLARE GUARD
    // -----------------------------------------------------------------------

    function isCloudflareChallenge() {
        return (
            document.title === 'Just a moment...' ||
            document.title.includes('Cloudflare') ||
            document.querySelector('#cf-challenge-form, #cf-turnstile, .cf-turnstile, #cf-turnstile-script') !== null ||
            typeof window.turnstile !== 'undefined'
        );
    }

    // -----------------------------------------------------------------------
    //  USERNAME EXTRACTION (source: user)
    // -----------------------------------------------------------------------

    // Pull candidate username strings from a URL (path segments + ?user= style).
    const USER_PATH_RE = /\/(?:profile|user|users|u|members?|author|channel|@)\/([^/?#]+)/gi;
    const USER_QUERY_RE = /[?&](?:user|uid|username|author|u)=([^&#]+)/gi;

    function extractUsernames(url) {
        if (!url) return [];
        const out = [];
        let m;
        USER_PATH_RE.lastIndex = 0;
        while ((m = USER_PATH_RE.exec(url))) out.push(decodeURIComponent(m[1]));
        USER_QUERY_RE.lastIndex = 0;
        while ((m = USER_QUERY_RE.exec(url))) out.push(decodeURIComponent(m[1]));
        return out;
    }

    // -----------------------------------------------------------------------
    //  BLUR APPLICATION
    // -----------------------------------------------------------------------

    const processed = new WeakSet(); // elements already blurred

    function ensureStyles() {
        if (document.getElementById('ucb-style')) return;
        const style = document.createElement('style');
        style.id = 'ucb-style';
        // Built-in blur strength is a bare number in --ucb-blur (set per-element by
        // a "blur:N" action), multiplied to px here so the default falls back cleanly.
        style.textContent = `
.${BLUR_CLASS} { filter: blur(calc(var(--ucb-blur, ${BLUR_STRENGTH_PX}) * 1px)) !important; transition: filter 0.2s ease; }
.${BLUR_CLASS}.${HOVER_CLASS}:hover { filter: none !important; }
.${FREEZE_CLASS}, .${FREEZE_CLASS} * { animation-play-state: paused !important; }
.${FREEZE_CLASS}.${HOVER_CLASS}:hover, .${FREEZE_CLASS}.${HOVER_CLASS}:hover * { animation-play-state: running !important; }
/* DEBUG (Alt+Shift+D): outline every affected element and label it with its rule
   id + matched text. Gated on the root .ucb-debug-on class so it costs nothing
   until enabled. --ucb-r is stamped on each target by applyActions(). */
html.ucb-debug-on [data-ucb-r] { outline: 2px dashed #ff3b30 !important; outline-offset: -1px !important; position: relative !important; }
html.ucb-debug-on [data-ucb-r]::after {
    content: attr(data-ucb-r); position: absolute; top: 0; left: 0; z-index: 2147483646;
    background: #ff3b30; color: #fff; font: 11px/1.4 monospace; padding: 1px 5px;
    border-radius: 0 0 4px 0; pointer-events: none; white-space: nowrap;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}
${customCss || ''}
`;
        (document.head ?? document.documentElement).appendChild(style);
    }

    // Resolve the element to blur from the matched element + the rule's scope.
    function resolveTarget(matchedEl, scope) {
        if (!matchedEl) return null;
        if (scope.kind === 'self') return matchedEl;
        if (scope.kind === 'closest') {
            try {
                return matchedEl.closest(scope.selector) || matchedEl;
            } catch {
                return matchedEl;
            }
        }
        if (scope.kind === 'up') {
            let node = matchedEl;
            for (let i = 0; i < scope.n && node.parentElement; i++) node = node.parentElement;
            return node;
        }
        return matchedEl;
    }

    // Base target plus the prev:N / next:N sibling elements from the rule's scope
    // modifiers; clamped at the parent's edges.
    function expandScopeGroup(target, scope) {
        if (!scope.prev && !scope.next) return [target];
        const group = [target];
        let el = target;
        for (let i = 0; i < scope.prev && el.previousElementSibling; i++)
            group.unshift((el = el.previousElementSibling));
        el = target;
        for (let i = 0; i < scope.next && el.nextElementSibling; i++) group.push((el = el.nextElementSibling));
        return group;
    }

    function applyActions(matchedEl, rule, matchInfo) {
        const base = resolveTarget(matchedEl, rule.scope);
        if (!base || processed.has(base)) return;
        const group = expandScopeGroup(base, rule.scope);
        // Debug label, stamped on every group member: "#N ⟨matched text⟩". Group
        // siblings (prev/next) share the base match — they carry the same label.
        const dbgLabel = rule.id + (matchInfo?.match ? ' ' + truncate(String(matchInfo.match), 30) : '');
        for (const target of group) {
            if (processed.has(target)) continue;
            // Never touch structural roots.
            if (target === document.body || target === document.documentElement) continue;
            processed.add(target);
            touched.add(target); // remembered so a "peek" can suspend/restore its effects
            for (const act of rule.actions) {
                target.classList.add('ucb-' + act.name); // built-in .ucb-blur or a user [css] class
                if (act.value != null) target.style.setProperty('--ucb-' + act.name, act.value);
            }
            if (rule.options.hover) target.classList.add(HOVER_CLASS);
            if (rule.options.freeze) freezeMedia(target);
            // Hidden content keeps its images unfetched / aborted (see UNLOAD).
            if (UNLOAD.enabled && ruleHides(rule)) unloadMedia(target);
            // Debug provenance: stamp the label (shown only when .ucb-debug-on is set)
            // and tally the hit so the HUD legend can show a per-rule count.
            target.dataset.ucbR = dbgLabel;
            countDebugHit(rule.id);
            // If a reveal is currently active, keep newly-matched content revealed too.
            if (revealAll()) suspendEl(target, true);
            else if (peekOn) suspendEl(target);
        }
        if (group.length > 1 && rule.options.hover) linkHoverGroup(group);
    }

    // -----------------------------------------------------------------------
    //  FREEZE MOTION (option: freeze)
    // -----------------------------------------------------------------------

    const frozen = new WeakSet(); // images already snapshotted
    const gifCanvasOf = new WeakMap(); // animated img  -> its frozen canvas
    const gifImgOf = new WeakMap(); // frozen canvas -> its animated img
    const ANIMATED_SRC_RE = /\.(gif|webp|apng)(?:[?#]|$)/i;

    function pauseVideo(v) {
        try {
            v.autoplay = false;
            v.removeAttribute('autoplay');
            v.pause();
            if (!v.dataset.ucbPauseBound) {
                v.dataset.ucbPauseBound = '1';
                // Re-pause if the site (or our own hover) plays it while not hovered.
                v.addEventListener('play', () => {
                    const host = v.closest('.' + FREEZE_CLASS);
                    if (host && !host.matches(':hover')) v.pause();
                });
            }
        } catch {
            /* ignore */
        }
    }

    // Replace an animated image with a static <canvas> snapshot of its current
    // frame. drawImage() works on cross-origin images (it only taints the canvas,
    // which we never read back via toDataURL/getImageData), so third-party gallery
    // GIFs/WebP/APNG freeze too. The canvas inherits the image's classes so any
    // blur/hover applied directly to the image still works on the snapshot.
    function freezeImage(img) {
        if (frozen.has(img)) return;
        const snapshot = () => {
            if (frozen.has(img)) return;
            const w = img.clientWidth || img.naturalWidth;
            const h = img.clientHeight || img.naturalHeight;
            if (!w || !h) return;
            let canvas;
            try {
                canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            } catch {
                return; // could not draw — leave the image untouched
            }
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            canvas.className = img.className;
            canvas.classList.add(FROZEN_CLASS);
            img.style.setProperty('display', 'none', 'important');
            img.insertAdjacentElement('afterend', canvas);
            gifCanvasOf.set(img, canvas);
            gifImgOf.set(canvas, img);
            frozen.add(img);
        };
        if (img.complete && img.naturalWidth) snapshot();
        else img.addEventListener('load', snapshot, { once: true });
    }

    // Stop motion inside a blurred target: pause CSS animations + videos and
    // snapshot animated images so the blurred content can't move.
    function freezeMedia(target) {
        target.classList.add(FREEZE_CLASS);
        const vids = target.matches('video') ? [target] : target.querySelectorAll('video');
        for (const v of vids) pauseVideo(v);
        const imgs = target.matches('img') ? [target] : target.querySelectorAll('img');
        for (const img of imgs) {
            if (ANIMATED_SRC_RE.test(img.currentSrc || img.src || '')) freezeImage(img);
        }
        // CSS animations resume via CSS on hover; videos/GIFs need JS — see below.
        if (target.classList.contains(HOVER_CLASS)) ensureMotionHoverDelegation();
    }

    // -----------------------------------------------------------------------
    //  UNFREEZE MOTION ON HOVER (for freeze + hover rules)
    // -----------------------------------------------------------------------

    function togglePlay(v, play) {
        try {
            if (play) v.play();
            else v.pause();
        } catch {
            /* ignore */
        }
    }

    // Swap between the moving image and its frozen-frame canvas.
    function setGif(img, canvas, play) {
        if (!img || !canvas) return;
        if (play) {
            canvas.style.setProperty('display', 'none', 'important');
            img.style.removeProperty('display');
        } else {
            img.style.setProperty('display', 'none', 'important');
            canvas.style.removeProperty('display');
        }
    }

    // Resume (play=true) or re-freeze (play=false) motion within a hovered host.
    function setMotion(host, play) {
        // If the host *is* a frozen canvas / its paired image, leave it frozen:
        // toggling its display would swap the element under the cursor and flicker.
        // Hover still reveals the still frame via the blur:hover rule. Motion only
        // resumes when the hover host is a container (gif/video is a descendant).
        if (gifImgOf.has(host) || gifCanvasOf.has(host)) return;
        if (host.matches('video')) togglePlay(host, play);
        for (const v of host.querySelectorAll('video')) togglePlay(v, play);
        for (const canvas of host.querySelectorAll('.' + FROZEN_CLASS)) setGif(gifImgOf.get(canvas), canvas, play);
    }

    let motionHoverBound = false;
    function ensureMotionHoverDelegation() {
        if (motionHoverBound) return;
        motionHoverBound = true;
        const sel = '.' + FREEZE_CLASS + '.' + HOVER_CLASS;
        // Delegated enter/leave: the relatedTarget guard prevents flicker when the
        // pointer moves between children of the same host.
        document.addEventListener(
            'mouseover',
            (e) => {
                const host = e.target.closest?.(sel);
                if (host && !host.contains(e.relatedTarget)) setMotion(host, true);
            },
            true
        );
        document.addEventListener(
            'mouseout',
            (e) => {
                const host = e.target.closest?.(sel);
                if (host && !host.contains(e.relatedTarget)) setMotion(host, false);
            },
            true
        );
    }

    // -----------------------------------------------------------------------
    //  PEEK / SUSPEND (temporary peek + persistent all-effects toggle)
    // -----------------------------------------------------------------------

    let peekOn = false; // transient reveal (PEEK hold/tap) — skips peek-exempt effects
    let stylesOff = false; // persistent all-effects toggle (KEYS.toggleStyles / menu); resets on reload
    let debugOn = false; // debug overlay (KEYS.toggleDebug) — reveals all effects + labels; resets on reload
    const touched = new Set(); // elements we've applied effect classes to
    // Both the styles-off toggle and debug mode fully reveal every effect. Peek is
    // the narrower, transient reveal (skips peek-exempt/layout effects).
    const revealAll = () => stylesOff || debugOn;
    const NON_EFFECT_CLASSES = new Set([HOVER_CLASS, FREEZE_CLASS, FROZEN_CLASS]);

    // Effect classes ('ucb-NAME') a peek must NOT strip: revealing an effect that
    // changes layout (a [css] hide/resize, …) makes content jump/scroll under the
    // cursor mid-peek. Detected best-effort from the [css] section — see
    // analyzeEffectCss(). The styles-off toggle and group hover ignore this.
    let peekExempt = new Set();
    // Effect classes that HIDE their target (display:none / visibility:hidden) —
    // images inside such targets are unloaded when UNLOAD is enabled.
    let hiddenActions = new Set();
    // True when UNLOAD is enabled AND an active rule hides: the observer then
    // scans added nodes undebounced to beat the browser's image fetch dispatch.
    let unloadActive = false;
    // CSS selector matching any hidden-action class ('.ucb-hide, …') — used to
    // catch late inserts INTO an already-hidden target (see the observer).
    let hiddenSelector = '';

    const ruleHides = (rule) => rule.actions.some((a) => hiddenActions.has('ucb-' + a.name));

    // Best-effort: does setting this (longhand) CSS property change layout?
    // Purely visual properties (filter, opacity, visibility, color, background,
    // outline, box-shadow, transform, …) are peek-safe and intentionally absent.
    function isLayoutProp(p) {
        if (p.startsWith('--')) return false;
        if (/^border-.*(width|style)$/.test(p)) return true; // border-color/-radius are visual-only
        return /^(display|position|float|clear|top|right|bottom|left|inset|width|height|min-|max-|margin|padding|font|line-height|flex|grid|order|gap|row-gap|column-gap|overflow|content-visibility|box-sizing|white-space|vertical-align)/.test(
            p
        );
    }

    // Parse the user's [css] section (browser-native, via a <style> in a detached
    // document — CSP-proof and sandbox-safe) and classify the .ucb-NAME classes:
    // peekExempt = declarations affect layout (a --ucb-peek: on|off declaration
    // inside a class overrides the detection either way); hiddenActions = the
    // class hides its target outright (drives UNLOAD). Best effort: if parsing
    // fails, both sets stay empty (peek reveals everything, nothing unloads).
    function analyzeEffectCss(cssText) {
        const res = { peekExempt: new Set(), hiddenActions: new Set() };
        if (!cssText) return res;
        let sheet;
        try {
            const doc = document.implementation.createHTMLDocument('');
            const style = doc.createElement('style');
            style.textContent = cssText;
            doc.head.appendChild(style);
            sheet = style.sheet;
            if (!sheet) throw new Error('no sheet on detached style element');
        } catch (e) {
            console.warn(LOG_PREFIX, 'could not parse [css] for effect analysis:', e.message);
            return res;
        }
        const overrides = new Map(); // 'ucb-NAME' -> peekable (true) / exempt (false)
        const walk = (ruleList) => {
            for (const rule of ruleList) {
                if (rule.style && rule.selectorText) {
                    const classes = (rule.selectorText.match(/\.ucb-[a-z0-9_-]+/gi) || [])
                        .map((c) => c.slice(1).toLowerCase())
                        .filter((c) => !NON_EFFECT_CLASSES.has(c));
                    if (classes.length) {
                        const ov = rule.style.getPropertyValue('--ucb-peek').trim().toLowerCase();
                        const layout = [...rule.style].some(isLayoutProp);
                        const display = rule.style.getPropertyValue('display').trim().toLowerCase();
                        const visibility = rule.style.getPropertyValue('visibility').trim().toLowerCase();
                        const hides = display === 'none' || visibility === 'hidden' || visibility === 'collapse';
                        for (const cls of classes) {
                            if (layout) res.peekExempt.add(cls);
                            if (hides) res.hiddenActions.add(cls);
                            if (ov) overrides.set(cls, !/^(off|no|none|never|false|0)$/.test(ov));
                        }
                    }
                }
                if (rule.cssRules) walk(rule.cssRules); // @media / nested rules
            }
        };
        walk(sheet.cssRules);
        for (const [cls, peekable] of overrides) {
            if (peekable) res.peekExempt.delete(cls);
            else res.peekExempt.add(cls);
        }
        return res;
    }

    // Strip the fetchable sources from the <img>/<source> elements of a hidden
    // target: aborts an in-flight download and keeps lazy images from ever being
    // requested. Originals are stashed in data attributes for reloadMedia().
    function unloadMedia(target) {
        const els = target.matches?.('img, source') ? [target] : [];
        if (target.querySelectorAll) els.push(...target.querySelectorAll('img, source'));
        for (const el of els) {
            if (el.dataset.ucbUnloaded) continue;
            const src = el.getAttribute('src');
            const srcset = el.getAttribute('srcset');
            if (src == null && srcset == null) continue;
            el.dataset.ucbUnloaded = '1';
            if (src != null) {
                el.dataset.ucbSrc = src;
                el.removeAttribute('src');
            }
            if (srcset != null) {
                el.dataset.ucbSrcset = srcset;
                el.removeAttribute('srcset');
            }
        }
    }

    // Restore stripped sources — the fetches happen now, by user intent (Alt+Z /
    // group hover). One-way per element: re-hiding does not re-strip, the image
    // is already fetched and cached, there is nothing left to save.
    function reloadMedia(target) {
        const els = target.dataset?.ucbUnloaded ? [target] : [];
        if (target.querySelectorAll) els.push(...target.querySelectorAll('[data-ucb-unloaded]'));
        for (const el of els) {
            if (el.dataset.ucbSrcset != null) {
                el.setAttribute('srcset', el.dataset.ucbSrcset);
                delete el.dataset.ucbSrcset;
            }
            if (el.dataset.ucbSrc != null) {
                el.setAttribute('src', el.dataset.ucbSrc);
                delete el.dataset.ucbSrc;
            }
            delete el.dataset.ucbUnloaded;
        }
    }

    // Suspend an element: stash removed ucb-* effect classes in a data attribute,
    // so the cascade restores the element's original look exactly on resume. This
    // works for any effect (built-in or user [css]), unlike a global "off".
    // Default scope skips peek-exempt classes (layout-affecting effects); full=true
    // strips ALL effects (styles-off toggle, group hover reveal). Calling again
    // with full=true upgrades a partial suspension (stash entries are appended).
    function suspendEl(el, full = false) {
        const strip = [...el.classList].filter(
            (c) => c.startsWith('ucb-') && !NON_EFFECT_CLASSES.has(c) && (full || !peekExempt.has(c))
        );
        if (!strip.length) return;
        const prev = el.dataset.ucbOff;
        el.dataset.ucbOff = (prev ? prev + ' ' : '') + strip.join(' ');
        el.classList.remove(...strip);
        if (el.classList.contains(FREEZE_CLASS)) setMotion(el, true); // let motion play while revealed
        if (full && UNLOAD.enabled) reloadMedia(el); // deliberate reveal → let its images load now
    }

    function resumeEl(el) {
        const eff = el.dataset.ucbOff;
        if (eff == null) return;
        el.classList.add(...eff.split(' ').filter(Boolean));
        delete el.dataset.ucbOff;
        if (el.classList.contains(FREEZE_CLASS)) setMotion(el, false);
    }

    // Bring an element to the state implied by the global flags alone (resume,
    // then re-suspend at the right scope). Used when flags change and when the
    // pointer leaves a hover group.
    function applyGlobalState(el) {
        resumeEl(el);
        if (revealAll()) suspendEl(el, true);
        else if (peekOn) suspendEl(el);
    }

    // Reconcile every touched element with the current (peekOn, stylesOff) flags.
    // Members of a currently-hovered group are left alone — group hover owns them
    // until the pointer leaves (its mouseout applies the global state then).
    function updateSuspension() {
        for (const el of [...touched]) {
            if (!el.isConnected) {
                touched.delete(el);
                continue;
            }
            if (hoveredGroup && hoveredGroup.includes(el)) continue;
            applyGlobalState(el);
        }
    }

    function setPeek(on) {
        if (on === peekOn) return;
        peekOn = on;
        if (!revealAll()) updateSuspension(); // a full reveal already shows everything
    }

    function setStylesOff(off) {
        if (off === stylesOff) return;
        stylesOff = off;
        updateSuspension();
    }

    function toggleStyles() {
        setStylesOff(!stylesOff);
        toast('Content Blur: all effects ' + (stylesOff ? 'OFF' : 'ON'));
    }

    // -----------------------------------------------------------------------
    //  DEBUG OVERLAY (KEYS.toggleDebug) — reveal effects + label each area
    // -----------------------------------------------------------------------

    // Per-rule hit tally, kept live so the HUD legend can show how many elements
    // each active rule matched on this page.
    const debugHits = new Map(); // rule.id -> count
    const debugCountEls = new Map(); // rule.id -> the HUD <span> showing that count

    function countDebugHit(id) {
        const n = (debugHits.get(id) || 0) + 1;
        debugHits.set(id, n);
        const el = debugCountEls.get(id);
        if (el) el.textContent = String(n);
    }

    function setDebug(on) {
        if (on === debugOn) return;
        debugOn = on;
        document.documentElement.classList.toggle('ucb-debug-on', on);
        updateSuspension(); // reveal (or restore, honoring peek/styles-off) every touched element
        if (on) buildDebugHud();
        else removeDebugHud();
    }

    function toggleDebug() {
        ensureStyles(); // debug CSS lives in the main style block; make sure it's injected
        setDebug(!debugOn);
        toast('Content Blur: debug ' + (debugOn ? 'ON — effects revealed, areas labelled' : 'OFF'));
    }

    // A fixed corner legend mapping the FILE#N badges to their rules: id, the raw
    // config line (Ctrl+F it in settings), and a live hit count. Click a row to
    // open that settings file.
    function buildDebugHud() {
        removeDebugHud();
        ensureUiStyles();
        const hud = document.createElement('div');
        hud.id = 'ucb-debug-hud';
        Object.assign(hud.style, {
            position: 'fixed',
            top: '8px',
            right: '8px',
            zIndex: '2147483647',
            maxWidth: 'min(560px, 46vw)',
            maxHeight: '80vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'rgba(30,30,30,0.96)',
            color: '#d4d4d4',
            border: '1px solid #ff3b30',
            borderRadius: '8px',
            padding: '10px 12px',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        });

        const head = document.createElement('div');
        Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
        const title = document.createElement('strong');
        title.textContent = 'Content Blur — debug';
        Object.assign(title.style, { color: '#fff', flex: '1', fontSize: '13px' });
        const close = document.createElement('span');
        close.textContent = '✕';
        close.title = 'Close (Alt+Shift+D)';
        Object.assign(close.style, { cursor: 'pointer', color: '#888', padding: '0 2px' });
        close.addEventListener('click', () => toggleDebug());
        head.append(title, close);

        const sub = document.createElement('div');
        sub.textContent =
            `${activeRules.length} rule${activeRules.length !== 1 ? 's' : ''} active on ${location.hostname}` +
            (activeFiles.length ? ` — files: ${activeFiles.join(', ')}` : '');
        Object.assign(sub.style, { color: '#888', fontSize: '11px', marginBottom: '8px' });

        hud.append(head, sub);

        if (!activeRules.length) {
            const none = document.createElement('div');
            none.textContent = 'No rules match this page.';
            Object.assign(none.style, { color: '#888' });
            hud.append(none);
        }

        for (const r of activeRules) {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                gap: '8px',
                alignItems: 'baseline',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                lineHeight: '1.45',
            });
            row.title = `Open settings file "${r.file}"`;
            row.addEventListener('mouseenter', () => (row.style.background = 'rgba(255,255,255,0.06)'));
            row.addEventListener('mouseleave', () => (row.style.background = ''));
            row.addEventListener('click', () => openSettings(r.file));

            const id = document.createElement('span');
            id.textContent = r.id;
            Object.assign(id.style, { color: '#ff8c7a', fontFamily: 'monospace', fontWeight: 'bold' });

            const raw = document.createElement('span');
            raw.textContent = r.raw;
            Object.assign(raw.style, { flex: '1', fontFamily: 'monospace', color: '#9cdcfe', wordBreak: 'break-all' });

            const count = document.createElement('span');
            count.textContent = String(debugHits.get(r.id) || 0);
            count.title = 'elements matched';
            Object.assign(count.style, {
                color: '#4ec9b0',
                fontFamily: 'monospace',
                minWidth: '2ch',
                textAlign: 'right',
            });
            debugCountEls.set(r.id, count);

            row.append(id, raw, count);
            hud.append(row);
        }

        document.documentElement.appendChild(hud);
    }

    function removeDebugHud() {
        document.getElementById('ucb-debug-hud')?.remove();
        debugCountEls.clear();
    }

    // -----------------------------------------------------------------------
    //  HOVER-LINKED GROUPS (scope modifiers prev:N / next:N)
    // -----------------------------------------------------------------------

    // A multi-element scope group reveals as one unit: hovering ANY member
    // suspends the effects of ALL members and restores them when the pointer
    // leaves the group. Reusing the peek suspend/resume machinery makes this
    // work for every effect — built-in blur and user [css] classes alike —
    // without any extra CSS.

    const groupOf = new WeakMap(); // member element -> its group (array of members)
    let hoveredGroup = null; // group currently revealed by the pointer

    function linkHoverGroup(group) {
        for (const el of group) {
            if (!groupOf.has(el)) {
                groupOf.set(el, group); // first group wins if rules overlap
                el.dataset.ucbGroup = '1'; // marker for the delegated closest() lookup
            }
        }
        ensureGroupHoverDelegation();
    }

    let groupHoverBound = false;
    function ensureGroupHoverDelegation() {
        if (groupHoverBound) return;
        groupHoverBound = true;
        document.addEventListener(
            'mouseover',
            (e) => {
                const member = e.target.closest?.('[data-ucb-group]');
                const group = member && groupOf.get(member);
                if (!group || group === hoveredGroup) return;
                // A stale hovered group (e.g. its members were re-rendered away, so
                // no mouseout fired) is restored before revealing the new one.
                if (hoveredGroup) for (const el of hoveredGroup) applyGlobalState(el);
                hoveredGroup = group;
                // Group hover is a deliberate reveal: strip ALL effects, upgrading a
                // partial (peek-scoped) suspension of the members if one is active.
                for (const el of group) suspendEl(el, true);
            },
            true
        );
        document.addEventListener(
            'mouseout',
            (e) => {
                const member = e.target.closest?.('[data-ucb-group]');
                const group = member && groupOf.get(member);
                if (!group || group !== hoveredGroup) return;
                if (e.relatedTarget && group.some((el) => el.contains(e.relatedTarget))) return; // still inside
                hoveredGroup = null;
                for (const el of group) applyGlobalState(el);
            },
            true
        );
    }

    // -----------------------------------------------------------------------
    //  SCANNING
    // -----------------------------------------------------------------------

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
    // The script's own UI (settings dialog, quick panel, debug HUD) must never be
    // scanned: its help text contains words the rules match, which would get the
    // dialog blurred/underlined/hidden.
    const OWN_UI_SELECTOR = '#ucb-quick-panel, #ucb-settings, #ucb-debug-hud';

    // Page stylesheets leak into our UI (e.g. a site's global `code { background }`
    // made the settings help text unreadable). `all: revert` rolls every page-author
    // declaration back to browser defaults; our inline styles still win because the
    // rule is not !important. Not a shadow root, so the UI stays plain light DOM.
    function ensureUiStyles() {
        if (document.getElementById('ucb-ui-style')) return;
        const style = document.createElement('style');
        style.id = 'ucb-ui-style';
        style.textContent = OWN_UI_SELECTOR.split(', ')
            .flatMap((id) => [id, id + ' *'])
            .join(', ')
            .concat(' { all: revert; }');
        (document.head || document.documentElement).appendChild(style);
    }

    // Walker over the visible, non-empty text nodes under root (own UI excluded).
    function textWalker(root) {
        return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                // Elements are only visited to prune own-UI subtrees; SKIP keeps descending.
                if (node.nodeType === Node.ELEMENT_NODE)
                    return node.matches(OWN_UI_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
    }

    function scanText(root, textRules) {
        if (!textRules.length) return;
        const walker = textWalker(root);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.nodeValue;
            const el = node.parentElement;
            for (const rule of textRules) {
                if (rule.options.within && !el.closest(rule.options.within)) continue;
                const m = matchRule(rule, text);
                if (m) applyActions(el, rule, { source: 'text', match: m[0] });
            }
        }
    }

    function scanAttributes(root, attrRules) {
        if (!attrRules.length) return;
        // Gather candidate elements once; cheaper than per-rule querySelectorAll.
        // Also include root itself — querySelectorAll only searches descendants.
        // [class] matches far more elements than the attribute selectors, so it is
        // only added when a class rule is active on this page.
        const needClass = attrRules.some((r) => r.sources.includes('class'));
        const sel = 'a[href], img[src], [alt], [title]' + (needClass ? ', [class]' : '');
        const descendants = root.querySelectorAll === undefined ? [] : root.querySelectorAll(sel);
        const els = root.matches?.(sel) ? [root, ...descendants] : descendants;
        for (const el of els) {
            if (el.closest?.(OWN_UI_SELECTOR)) continue;
            const href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('src'));
            const alt = el.getAttribute && el.getAttribute('alt');
            const title = el.getAttribute && el.getAttribute('title');
            const usernames = href ? extractUsernames(href) : null;
            const classes = needClass && el.classList?.length ? [...el.classList] : null;

            for (const rule of attrRules) {
                if (rule.options.within && !el.closest(rule.options.within)) continue;
                for (const source of rule.sources) {
                    let hit = null;
                    if (source === 'url' && href) hit = matchRule(rule, href);
                    else if (source === 'alt' && alt) hit = matchRule(rule, alt);
                    else if (source === 'title' && title) hit = matchRule(rule, title);
                    else if (source === 'user' && usernames) {
                        for (const u of usernames) if ((hit = matchRule(rule, u))) break;
                    } else if (source === 'class' && classes) {
                        for (const c of classes) if ((hit = matchRule(rule, c))) break;
                    }
                    if (hit) {
                        applyActions(el, rule, { source, match: hit[0] });
                        break;
                    }
                }
            }
        }
    }

    // if-none rules: every scope container (closest:SEL) under or around root whose
    // text has NO match gets the actions. A container is re-checked whenever new
    // content lands in it, but an applied effect is not undone if a matching text
    // only arrives later.
    function scanNone(root, noneRules) {
        for (const rule of noneRules) {
            const sel = rule.scope.selector;
            const containers = new Set(root.querySelectorAll?.(sel) ?? []);
            const around = root.closest?.(sel);
            if (around) containers.add(around);
            for (const box of containers) {
                if (processed.has(box)) continue;
                // Like for normal rules, in:SEL restricts which texts count, not the
                // target. A box without any counted text (e.g. not rendered yet, or
                // a same-class element elsewhere on the page) is left alone.
                const walker = textWalker(box);
                let node;
                let counted = 0;
                let hit = false;
                while (!hit && (node = walker.nextNode())) {
                    if (rule.options.within && !node.parentElement.closest(rule.options.within)) continue;
                    counted++;
                    hit = !!matchRule(rule, node.nodeValue);
                }
                if (counted && !hit) applyActions(box, rule, { source: 'text', match: '(no match)' });
            }
        }
    }

    function scan(root = document.body) {
        if (!root || isCloudflareChallenge() || root.closest?.(OWN_UI_SELECTOR)) return;
        ensureStyles();
        const matchRules = activeRules.filter((r) => !r.options.ifNone);
        const textRules = matchRules.filter((r) => r.sources.includes('text'));
        const attrRules = matchRules.filter((r) => r.sources.some((s) => s !== 'text'));
        scanText(root, textRules);
        scanAttributes(root, attrRules);
        scanNone(
            root,
            activeRules.filter((r) => r.options.ifNone)
        );
    }

    // -----------------------------------------------------------------------
    //  OBSERVER
    // -----------------------------------------------------------------------

    let observer = null;
    let debounceTimer = null;
    const pendingRoots = new Set();

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver((records) => {
            if (isCloudflareChallenge()) {
                observer.disconnect();
                return;
            }
            for (const r of records)
                for (const n of r.addedNodes)
                    if (n.nodeType === Node.ELEMENT_NODE) pendingRoots.add(n);
                    else if (n.nodeType === Node.TEXT_NODE && n.parentElement) pendingRoots.add(n.parentElement);
            const flush = () => {
                debounceTimer = null;
                const roots = [...pendingRoots];
                pendingRoots.clear();
                for (const root of roots) {
                    if (!root.isConnected) continue;
                    // A node inserted INTO an already-hidden target (lazy galleries
                    // often add the img after the item was matched and hidden) never
                    // matches a rule itself — unload it via the ancestor check.
                    if (unloadActive && hiddenSelector && root.closest?.(hiddenSelector)) unloadMedia(root);
                    scan(root);
                }
            };
            if (debounceTimer) clearTimeout(debounceTimer);
            // A hide+unload rule races the browser's image fetch: scanning right in
            // the observer microtask usually wins, so skip the debounce then. Pages
            // without such a rule keep the cheaper batched scanning.
            if (unloadActive) flush();
            else debounceTimer = setTimeout(flush, SCAN_DEBOUNCE_MS);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // -----------------------------------------------------------------------
    //  QUICK-ADD (keyboard-driven rule capture)
    // -----------------------------------------------------------------------

    let lastHoveredLink = null;
    // Track the hovered link via mousemove, NOT mouseover: mouseover also fires when
    // content reflows under a stationary cursor (e.g. when a peek reveals hidden rows
    // and the layout shifts), which would silently capture the wrong link. mousemove
    // only fires on real pointer motion, so the last link stays what you last pointed at.
    document.addEventListener(
        'mousemove',
        (e) => {
            const a = e.target.closest && e.target.closest('a[href]');
            if (a) lastHoveredLink = a;
        },
        true
    );

    function isEditableTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }

    // A selection inside the script's own UI must never count as page content:
    // Firefox exposes text selected in input fields via window.getSelection(), so
    // the auto-selected token in the quick-add bar would otherwise be re-captured
    // (and re-escaped) on every hotkey re-press. Checked via both the selection
    // anchor and the focused element — for text controls the anchor may point at
    // anonymous content while focus reliably sits on the input itself.
    function isOwnUiNode(node) {
        const el = node instanceof Element ? node : node?.parentElement;
        return !!el?.closest?.(OWN_UI_SELECTOR);
    }

    // Figure out what to capture: selected text wins, else hovered link. `pattern`
    // is the RAW captured value; defaultToken() turns it into a config-syntax token.
    function captureContext() {
        const selection = window.getSelection ? window.getSelection() : null;
        const sel = selection ? String(selection).trim() : '';
        if (sel && !isOwnUiNode(selection.anchorNode) && !isOwnUiNode(document.activeElement)) {
            return { source: 'text', pattern: sel, label: sel };
        }
        if (lastHoveredLink) {
            const href = lastHoveredLink.getAttribute('href') || '';
            const abs = lastHoveredLink.href || href;
            const users = extractUsernames(abs);
            if (users.length) {
                return { source: 'user', pattern: users[0], label: users[0] };
            }
            return { source: 'url', pattern: href, label: href };
        }
        return null;
    }

    // Escape raw captured text into a faithful *literal* token: neutralize the
    // literal-syntax specials (\ * ? ") and a leading / or ! (which would otherwise
    // be read as a /regex/ or an exclude). Interior characters need no escaping.
    function escapeLiteral(s) {
        const out = s.replace(/([\\*?"])/g, '\\$1');
        return /^[/!]/.test(out) ? '\\' + out : out;
    }

    // The config-syntax token quick-add pre-fills / writes for a captured value:
    //   user → "name"  (exact, so it can't also match a longer username)
    //   else → literal (whole-word for text, literal substring for a url href)
    // Fully editable in the bottom bar — what you see is what gets written.
    function defaultToken(ctx) {
        const lit = escapeLiteral(ctx.pattern);
        return ctx.source === 'user' ? `"${lit}"` : lit;
    }

    function buildRuleLine(source, token, scope, options) {
        const urlPat = `*://${location.hostname}/*`;
        const opt = options.length ? options.join(',') : 'hover';
        return `${urlPat} | ${source} | ${token} | blur | ${scope} | ${opt}`;
    }

    // Normalize a rule line for duplicate detection: trim whitespace around the |
    // field separators (so hand-aligned "ASCII table" rules still compare equal)
    // without touching whitespace inside fields (e.g. within the patterns list).
    function normalizeRuleLine(line) {
        return splitTopLevel(line, '|')
            .map((f) => f.trim())
            .join(' | ');
    }

    // Append a rule line to settings file `fileName` — or to a new file for this
    // host when there is no such file — unless a semantically-identical rule
    // already exists there. Returns { changed, file } (file = name written to).
    async function appendRuleLine(ruleLine, fileName) {
        const files = await getFiles();
        const f = files.find((x) => x.name === fileName) ?? createHostFile(files);
        const { ruleEntries } = indexConfigRaw(f.text.split('\n'));
        const newNorm = normalizeRuleLine(ruleLine);
        if (ruleEntries.some((e) => e.fields.join(' | ') === newNorm)) {
            return { changed: false, file: f.name };
        }
        let next = f.text.trimEnd();
        // Append into a [rules] section: a trailing list/css/match block would
        // otherwise swallow the new line.
        const lastHeader = next
            .split('\n')
            .map((l) => sectionHeader(l.trim()))
            .filter(Boolean)
            .pop();
        if (lastHeader?.type !== 'rules') next += '\n\n[rules]';
        f.text = next + '\n' + ruleLine + '\n';
        await saveFiles(files);
        await loadRules();
        return { changed: true, file: f.name };
    }

    // Files quick-add may write to on this page: the running files (their rules
    // and lists) plus the libraries they import (lists only — library rules never
    // run). Each carries its raw lines + index, so edits happen in place.
    async function editTargets() {
        const files = await getFiles();
        const targets = [];
        const libNames = [];
        for (const f of files) {
            if (!f.enabled || !fileRunsOn(fileHeader(f.text))) continue;
            const lines = f.text.split('\n');
            const idx = indexConfigRaw(lines);
            targets.push({ file: f, lines, ...idx, isLibrary: false });
            libNames.push(...idx.use);
        }
        for (const name of new Set(libNames)) {
            const f = files.find((x) => x.name === name);
            if (!f || targets.some((t) => t.file === f) || fileHeader(f.text).match.length) continue;
            const lines = f.text.split('\n');
            const idx = indexConfigRaw(lines);
            targets.push({ file: f, lines, ...idx, ruleEntries: [], isLibrary: true });
        }
        return targets;
    }

    // File a new rule goes to: the remembered one if it still runs here, else the
    // first file running here, else null (= create a file for this host).
    function newRuleFile(targets, saved) {
        const running = targets.filter((t) => !t.isLibrary);
        return (running.find((t) => t.file.name === saved.newFile) ?? running[0])?.file.name ?? null;
    }

    function toast(msg, ok = true) {
        const t = document.createElement('div');
        Object.assign(t.style, {
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '2147483647',
            background: ok ? 'rgba(14,99,156,0.95)' : 'rgba(156,40,40,0.95)',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: '6px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
        });
        t.textContent = msg;
        document.documentElement.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    // Append a brand-new rule built from the captured context, then apply it.
    async function addNewRuleFromContext(ctx, fileName) {
        const res = await appendRuleLine(buildRuleLine(ctx.source, defaultToken(ctx), 'self', ['hover']), fileName);
        if (res.changed) {
            scan(document.body);
            if (activeRules.length > 0) startObserver(); // apply immediately on this page
        }
        return res;
    }

    async function quickAddSilent() {
        const ctx = captureContext();
        if (!ctx) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        const saved = (await GM.getValue(PANEL_STATE_KEY, null)) || {};
        const res = await addNewRuleFromContext(ctx, newRuleFile(await editTargets(), saved));
        toast(
            res.changed
                ? `Content Blur: added rule for "${truncate(ctx.label, 40)}" to ${res.file}`
                : `Content Blur: rule for "${truncate(ctx.label, 40)}" already exists in ${res.file}`
        );
    }

    // Quick-block: add the captured pattern to the rule/list last used via the
    // quick-add panel (or a previous quick-block) when it still applies to this
    // page, else to the FIRST rule (in a file running here) whose source type +
    // URL pattern match — into its first referenced [list:NAME] if it has one,
    // else appended inline to the rule's patterns field. Falls back to creating a
    // new rule when nothing matches. Great for blocking users one keypress at a
    // time into a chosen list.
    async function quickBlock() {
        const ctx = captureContext();
        if (!ctx) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        const targets = await editTargets();
        const saved = (await GM.getValue(PANEL_STATE_KEY, null)) || {};
        const res = addPatternToMatchingRule(targets, ctx, saved);
        if (!res) {
            const added = await addNewRuleFromContext(ctx, newRuleFile(targets, saved));
            if (added.changed) {
                const line = buildRuleLine(ctx.source, defaultToken(ctx), 'self', ['hover']);
                await GM.setValue(PANEL_STATE_KEY, {
                    ...saved,
                    mode: 'rule',
                    file: added.file,
                    newFile: added.file,
                    ruleKey: line.trim(),
                });
            }
            toast(
                added.changed
                    ? `Content Blur: no matching rule — created one for "${truncate(ctx.label, 40)}" in ${added.file}`
                    : `Content Blur: rule for "${truncate(ctx.label, 40)}" already exists in ${added.file}`
            );
            return;
        }
        await GM.setValue(PANEL_STATE_KEY, { ...saved, ...res.state });
        if (res.changed) {
            await saveFileText(res.target.file.id, res.target.lines.join('\n'));
            await loadRules();
            scan(document.body);
            if (activeRules.length > 0) startObserver();
        }
        toast(`Content Blur: ${res.message} (${res.target.file.name})`);
    }

    // Scan raw config lines once into an index of list blocks, rule lines and
    // [use] names, so the quick-add panel and quick-block can insert into a chosen
    // destination and edit the raw text in place. Mirrors parseConfig().
    function indexConfigRaw(lines) {
        const listBlocks = new Map(); // name -> { headerIdx, lastEntryIdx }
        const ruleEntries = []; // { idx, fields } for each rule line
        const use = []; // [use] file names
        let section = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            const header = sectionHeader(line);
            if (header) {
                if (header.type === 'list' && !listBlocks.has(header.name)) {
                    listBlocks.set(header.name, { headerIdx: i, lastEntryIdx: i });
                }
                section = header;
                continue;
            }
            if (section && section.type === 'css') continue; // never touch raw CSS
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            if (section && section.type === 'list') {
                listBlocks.get(section.name).lastEntryIdx = i;
                continue;
            }
            if (section && section.type === 'use') {
                use.push(line.toLowerCase());
                continue;
            }
            if (section && (section.type === 'match' || section.type === 'exclude')) continue;
            if (line.includes('|') || (section && section.type === 'rules')) {
                const fields = splitTopLevel(line, '|').map((f) => f.trim());
                if (fields.length >= 4) ruleEntries.push({ idx: i, fields });
            }
        }
        return { listBlocks, ruleEntries, use };
    }

    // Insert an entry into a [list:NAME] block (dedup). Mutates `lines` in place.
    function insertListEntry(lines, block, name, entry, label) {
        for (let i = block.headerIdx + 1; i <= block.lastEntryIdx; i++) {
            if (lines[i].trim() === entry) {
                return { changed: false, message: `"${truncate(label, 40)}" already in list @${name}` };
            }
        }
        lines.splice(block.lastEntryIdx + 1, 0, entry);
        return { changed: true, message: `added "${truncate(label, 40)}" to list @${name}` };
    }

    // Append a token to a rule's patterns field (dedup). Mutates `lines` in place.
    function insertRulePattern(lines, entry, token, label) {
        const tokens = splitTopLevel(entry.fields[2], ',')
            .map((t) => t.trim())
            .filter(Boolean);
        if (tokens.includes(token)) {
            return { changed: false, message: `"${truncate(label, 40)}" already in the rule` };
        }
        entry.fields[2] = entry.fields[2] + ', ' + token;
        lines[entry.idx] = entry.fields.join(' | ');
        return { changed: true, message: `added "${truncate(label, 40)}" to the rule` };
    }

    // First list a rule references that actually exists, as { target, name }
    // (`name` local to that target's file), or null. @LIB/NAME resolves into the
    // imported library's file; wildcard refs are skipped.
    function firstListOf(entry, target, targets) {
        const ref = splitTopLevel(entry.fields[2], ',')
            .map((t) => t.trim())
            .find((t) => t.startsWith('@'));
        const full = ref?.slice(1).toLowerCase();
        if (!full) return null;
        const slash = full.indexOf('/');
        if (slash === -1) return target.listBlocks.has(full) ? { target, name: full } : null;
        const lib = targets.find((t) => t.isLibrary && t.file.name === full.slice(0, slash));
        const name = full.slice(slash + 1);
        return lib?.listBlocks.has(name) ? { target: lib, name } : null;
    }

    // Quick-block target, in order of preference:
    //   1. the destination last used via the quick-add panel (incl. a newly
    //      created rule) or quick-block (`saved`), if it is still relevant here
    //      (its rule matches the current URL + captured source) — so repeated
    //      adds keep going to the same place
    //   2. the FIRST rule matching the current URL + captured source
    // A rule's first referenced list is preferred over its inline patterns.
    // Mutates the chosen target's `lines`. Returns
    // { target, changed, message, state }, or null when no rule is relevant.
    function addPatternToMatchingRule(targets, ctx, saved = {}) {
        const relevant = targets.flatMap((t) =>
            t.ruleEntries
                .filter((e) => {
                    const up = parseUrlPattern(e.fields[0]);
                    return up && up.regex.test(location.href) && parseSource(e.fields[1]).includes(ctx.source);
                })
                .map((e) => ({ t, e }))
        );
        if (!relevant.length) return null;

        const token = defaultToken(ctx);
        const toList = ({ target, name }) => {
            const res = insertListEntry(target.lines, target.listBlocks.get(name), name, token, ctx.label);
            return { ...res, target, state: { mode: 'list', file: target.file.name, listName: name } };
        };
        const toRule = ({ t, e }) => {
            const res = insertRulePattern(t.lines, e, token, ctx.label);
            return { ...res, target: t, state: { mode: 'rule', file: t.file.name, ruleKey: t.lines[e.idx].trim() } };
        };
        const isSavedRule = ({ t, e }) => t.file.name === saved.file && t.lines[e.idx].trim() === saved.ruleKey;

        if (saved.mode === 'list') {
            const hit = relevant
                .map(({ t, e }) => firstListOf(e, t, targets))
                .find((l) => l && l.target.file.name === saved.file && l.name === saved.listName);
            if (hit) return toList(hit);
        } else if (saved.mode === 'rule' || saved.mode === 'new') {
            const hit = relevant.find(isSavedRule);
            if (hit) return toRule(hit);
        }
        const first = relevant[0];
        const list = firstListOf(first.e, first.t, targets);
        return list ? toList(list) : toRule(first);
    }

    function truncate(s, n) {
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    // -----------------------------------------------------------------------
    //  QUICK-ADD PANEL (KEYS.quickAddPanel)
    // -----------------------------------------------------------------------

    const PANEL_MODES = [
        { value: 'new', label: 'New rule' },
        { value: 'rule', label: '+ Existing rule' },
        { value: 'list', label: '+ Existing list' },
    ];

    // The captured value can go to a new rule (full form), an existing rule's
    // patterns field, or an existing list. The chosen mode + destination are
    // remembered in GM storage (PANEL_STATE_KEY) so repeated adds need no reselect.
    async function quickAddPanel() {
        const captured = captureContext();
        if (!captured) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        // If the bar is already open, refresh it in place from the fresh capture
        // (keeping the chosen destination) instead of tearing it down and rebuilding.
        // This is what makes "hold Alt+Shift, hover different links, tap R to
        // re-capture" update the pattern smoothly, with no focus/async churn.
        const existing = document.getElementById('ucb-quick-panel');
        if (existing && typeof existing._ucbRefresh === 'function') {
            existing._ucbRefresh(captured);
            return;
        }
        existing?.remove();
        let ctx = captured;

        // Load the files running here (to enumerate destinations) + remembered
        // panel state. Destinations are file-qualified: { t: target, e | name }.
        const targets = await editTargets();
        const ruleOpts = targets.flatMap((t) => t.ruleEntries.map((e) => ({ t, e })));
        const listOpts = targets.flatMap((t) => [...t.listBlocks.keys()].map((name) => ({ t, name })));
        const runningFiles = targets.filter((t) => !t.isLibrary).map((t) => t.file.name);
        const savedState = (await GM.getValue(PANEL_STATE_KEY, null)) || {};

        ensureUiStyles();
        const panel = document.createElement('div');
        panel.id = 'ucb-quick-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            [QUICK_BAR.position === 'top' ? 'top' : 'bottom']: QUICK_BAR.offset + 'px',
            width: 'max-content',
            maxWidth: `calc(100vw - ${2 * QUICK_BAR.margin}px)`,
            zIndex: '2147483647',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '14px 16px',
            borderRadius: '10px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxShadow: `0 ${QUICK_BAR.position === 'top' ? '' : '-'}4px 24px rgba(0,0,0,0.55)`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'flex-end',
        });
        if (QUICK_BAR.align === 'right') panel.style.right = QUICK_BAR.margin + 'px';
        else if (QUICK_BAR.align === 'center') {
            panel.style.left = '50%';
            panel.style.transform = 'translateX(-50%)';
        } else panel.style.left = QUICK_BAR.margin + 'px';

        const field = (labelText, control) => {
            const wrap = document.createElement('label');
            Object.assign(wrap.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '11px',
                color: '#999',
            });
            wrap.append(labelText, control);
            return wrap;
        };

        const inputStyle = {
            background: '#2d2d2d',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '4px',
            padding: '5px 7px',
            fontSize: '13px',
            fontFamily: 'monospace',
        };
        const mkSelect = () => {
            const s = document.createElement('select');
            Object.assign(s.style, inputStyle);
            return s;
        };

        // --- persistent controls: mode combobox, pattern input, buttons ---
        const modeSel = mkSelect();
        for (const m of PANEL_MODES) {
            const o = document.createElement('option');
            o.value = m.value;
            o.textContent = m.label;
            if (m.value === 'rule' && !ruleOpts.length) o.disabled = true;
            if (m.value === 'list' && !listOpts.length) o.disabled = true;
            modeSel.appendChild(o);
        }

        const patternInput = document.createElement('input');
        patternInput.type = 'text';
        patternInput.value = defaultToken(ctx);
        patternInput.title = 'word = whole-word literal · "text" = exact · /regex/ = regex · * ? = wildcards';
        Object.assign(patternInput.style, inputStyle, { minWidth: '240px', flex: '1' });

        const addBtn = makeBtn('Add & apply', '#0e639c');
        const cancelBtn = makeBtn('Cancel', '#333', '#ccc');

        // --- swappable middle region (mode-specific fields) ---
        const midWrap = document.createElement('div');
        Object.assign(midWrap.style, { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' });
        const mid = {}; // current mode-specific controls

        const renderMid = (mode) => {
            midWrap.replaceChildren();
            for (const k of Object.keys(mid)) delete mid[k];
            if (mode === 'new') {
                const sourceSel = mkSelect();
                for (const s of VALID_SOURCES) {
                    const o = document.createElement('option');
                    o.value = o.textContent = s;
                    if (s === ctx.source) o.selected = true;
                    sourceSel.appendChild(o);
                }
                const scopeSel = mkSelect();
                for (const s of ['self', 'up:1', 'up:2', 'up:3', 'row', 'closest:.comment', 'closest:article']) {
                    const o = document.createElement('option');
                    o.value = o.textContent = s;
                    scopeSel.appendChild(o);
                }
                const hoverCb = document.createElement('input');
                hoverCb.type = 'checkbox';
                hoverCb.checked = true;
                const hoverLabel = document.createElement('label');
                Object.assign(hoverLabel.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '12px',
                    color: '#999',
                });
                hoverLabel.append(hoverCb, 'reveal on hover');
                const fileSel = mkSelect();
                const defaultFile = newRuleFile(targets, savedState);
                for (const name of runningFiles) {
                    const o = document.createElement('option');
                    o.value = o.textContent = name;
                    if (name === defaultFile) o.selected = true;
                    fileSel.appendChild(o);
                }
                const o = document.createElement('option');
                o.value = '';
                o.textContent = `+ new file (${location.hostname})`;
                if (!defaultFile) o.selected = true;
                fileSel.appendChild(o);
                Object.assign(mid, { sourceSel, scopeSel, hoverCb, fileSel });
                midWrap.append(
                    field('file', fileSel),
                    field('source', sourceSel),
                    field('scope', scopeSel),
                    hoverLabel
                );
            } else if (mode === 'rule') {
                const ruleSel = mkSelect();
                Object.assign(ruleSel.style, { maxWidth: '440px' });
                ruleOpts.forEach(({ t, e }, i) => {
                    const o = document.createElement('option');
                    const raw = t.lines[e.idx].trim();
                    o.value = String(i);
                    o.textContent = `${t.file.name}: ${truncate(raw, 60)}`;
                    if (t.file.name === savedState.file && raw === savedState.ruleKey) o.selected = true;
                    ruleSel.appendChild(o);
                });
                mid.ruleSel = ruleSel;
                midWrap.append(field('target rule', ruleSel));
            } else {
                const listSel = mkSelect();
                listOpts.forEach(({ t, name }, i) => {
                    const o = document.createElement('option');
                    o.value = String(i);
                    o.textContent = `${t.file.name}: ${name}`;
                    if (t.file.name === savedState.file && name === savedState.listName) o.selected = true;
                    listSel.appendChild(o);
                });
                mid.listSel = listSel;
                midWrap.append(field('target list', listSel));
            }
        };

        // Initial mode: remembered, if still available; else new.
        let initialMode = savedState.mode || 'new';
        if (initialMode === 'rule' && !ruleOpts.length) initialMode = 'new';
        if (initialMode === 'list' && !listOpts.length) initialMode = 'new';
        modeSel.value = initialMode;
        renderMid(initialMode);
        modeSel.addEventListener('change', () => renderMid(modeSel.value));

        // --- apply helpers ---
        // The pattern field holds the config-syntax token verbatim (WYSIWYG), so an
        // add uses its value as-is — no re-wrapping.
        const saveState = async (patch) => {
            const cur = (await GM.getValue(PANEL_STATE_KEY, null)) || {};
            await GM.setValue(PANEL_STATE_KEY, { ...cur, ...patch });
        };
        const applyEdits = async (target, changed) => {
            if (!changed) return;
            await saveFileText(target.file.id, target.lines.join('\n'));
            await loadRules();
            scan(document.body);
            if (activeRules.length > 0) startObserver();
        };

        cancelBtn.addEventListener('click', () => panel.remove());
        // Escape closes the bar (same as Cancel) — parity with the settings dialog.
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                panel.remove();
            }
        });
        // Enter in the (auto-focused) pattern field commits right away — the common
        // flow is "hotkey, glance at the pre-filled values, Enter".
        patternInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addBtn.click();
            }
        });
        addBtn.addEventListener('click', async () => {
            const token = patternInput.value.trim();
            if (!token) {
                toast('Content Blur: pattern is empty', false);
                return;
            }
            const mode = modeSel.value;
            if (mode === 'new') {
                const line = buildRuleLine(
                    mid.sourceSel.value,
                    token,
                    mid.scopeSel.value,
                    mid.hoverCb.checked ? ['hover'] : ['no-hover']
                );
                const res = await appendRuleLine(line, mid.fileSel.value || null);
                if (res.changed) {
                    scan(document.body);
                    if (activeRules.length > 0) startObserver();
                }
                // Remember the new rule (and its file) so Alt+A (quick-block) and
                // the next new rule keep going there.
                await saveState(
                    res.changed
                        ? { mode, file: res.file, newFile: res.file, ruleKey: line.trim() }
                        : { mode, newFile: res.file }
                );
                toast(`Content Blur: ${res.changed ? 'rule added' : 'rule already exists'} (${res.file})`);
            } else if (mode === 'rule') {
                const { t, e } = ruleOpts[Number(mid.ruleSel.value)];
                const res = insertRulePattern(t.lines, e, token, ctx.label);
                await applyEdits(t, res.changed);
                await saveState({ mode, file: t.file.name, ruleKey: t.lines[e.idx].trim() });
                toast(`Content Blur: ${res.message} (${t.file.name})`);
            } else {
                const { t, name } = listOpts[Number(mid.listSel.value)];
                const res = insertListEntry(t.lines, t.listBlocks.get(name), name, token, ctx.label);
                await applyEdits(t, res.changed);
                await saveState({ mode, file: t.file.name, listName: name });
                toast(`Content Blur: ${res.message} (${t.file.name})`);
            }
            panel.remove();
        });

        // In-place refresh for a re-pressed hotkey: update the pattern (and source,
        // in New-rule mode) from a fresh capture without rebuilding, keeping the
        // chosen destination. Stored on the element so a re-open can find it.
        panel._ucbRefresh = (newCtx) => {
            ctx = newCtx;
            patternInput.value = defaultToken(ctx);
            if (mid.sourceSel) mid.sourceSel.value = ctx.source;
            patternInput.focus();
            patternInput.select();
        };
        panel._ucbCommit = () => addBtn.click(); // used by the COMMIT_TAP double-tap

        panel.append(field('add to', modeSel), field('pattern', patternInput), midWrap, addBtn, cancelBtn);
        document.documentElement.appendChild(panel);
        patternInput.focus();
        patternInput.select();
    }

    // -----------------------------------------------------------------------
    //  SETTINGS OVERLAY (KEYS.openSettings)
    // -----------------------------------------------------------------------

    function makeBtn(label, bg, color = '#fff') {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
            padding: '7px 14px',
            background: bg,
            color,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
        });
        return btn;
    }

    // Settings-file name derived from this page's host (e.g. "example.com").
    function hostFileName() {
        return (
            location.hostname
                .toLowerCase()
                .replace(/^www\./, '')
                .replace(/[^a-z0-9_.-]+/g, '-')
                .replace(/^[^a-z0-9]+/, '') || 'site'
        );
    }

    // `base`, or base-2, base-3, … — the first name no file in `files` uses.
    function uniqueFileName(base, files) {
        let name = base;
        for (let n = 2; name === REFERENCE_NAME || files.some((x) => x.name === name); n++) name = `${base}-${n}`;
        return name;
    }

    // The text of a new settings file running on this host.
    function hostFileText(name) {
        return `# ${name}\n[match]\n*://${location.hostname}/*\n\n[rules]\n`;
    }

    // A new, empty settings file running on this host (pushed onto `files`).
    function createHostFile(files) {
        const name = uniqueFileName(hostFileName(), files);
        const f = { id: newFileId(), name, enabled: true, text: hostFileText(name) };
        files.push(f);
        return f;
    }

    // Names of the files that [use] the file named `name`.
    function importersOf(name, files) {
        return files
            .filter((f) => f.name !== name && indexConfigRaw(f.text.split('\n')).use.includes(name))
            .map((f) => f.name);
    }

    // Rewrite references to a renamed library: its [use] line and @OLD/ list refs
    // in list and rule lines ([css] and other sections are left alone).
    function renameImports(text, oldName, newName) {
        let section = null;
        const refRe = new RegExp('@' + escapeRegExp(oldName) + '/', 'gi');
        return text
            .split('\n')
            .map((line) => {
                const t = line.trim();
                const h = sectionHeader(t);
                if (h) {
                    section = h.type;
                    return line;
                }
                if (!t || t.startsWith('#') || t.startsWith('//')) return line;
                if (section === 'use') return t.toLowerCase() === oldName ? line.replace(t, newName) : line;
                if (section === 'list' || section === 'rules' || section === null)
                    return line.replace(refRe, `@${newName}/`);
                return line;
            })
            .join('\n');
    }

    // Export / import format: { format, version, exported, files: [{ name, enabled, text }] }.
    const EXPORT_FORMAT = 'any-content-blur';

    function downloadJson(filename, files) {
        const data = {
            format: EXPORT_FORMAT,
            version: 1,
            exported: new Date().toISOString(),
            files: files.map(({ name, enabled, text }) => ({ name, enabled, text })),
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        (document.body ?? document.documentElement).append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Parse an export file's text into [{ name, enabled, text }], or throw.
    function parseImport(json) {
        const data = JSON.parse(json);
        if (data?.format !== EXPORT_FORMAT || !Array.isArray(data.files)) {
            throw new Error('not an Any Content Blur export');
        }
        return data.files
            .filter((f) => typeof f?.name === 'string' && typeof f?.text === 'string')
            .map((f) => ({ name: f.name.trim().toLowerCase(), enabled: f.enabled !== false, text: f.text }));
    }

    // Settings dialog: a file bar (select, enabled, New/Duplicate/Rename/Delete,
    // Import/Export) above the selected file's text. File-bar actions are stored
    // immediately; text edits need Save (per file — leaving a file with unsaved
    // changes asks first). The built-in reference file is read-only and never
    // stored.
    function openSettings(fileName) {
        document.getElementById('ucb-settings')?.remove();
        ensureUiStyles();

        const overlay = document.createElement('div');
        overlay.id = 'ucb-settings';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483647',
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        });

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '8px',
            padding: '18px',
            width: '860px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain', // scrolling the dialog never chains to the page behind it
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
        });

        const header = document.createElement('div');
        Object.assign(header.style, { display: 'flex', alignItems: 'center', margin: '0 0 6px' });
        const title = document.createElement('h3');
        title.textContent = 'Any Content Blur — Settings';
        Object.assign(title.style, { margin: '0', color: '#fff', fontSize: '15px', flex: '1' });
        const btnClose = document.createElement('button');
        btnClose.textContent = '✕';
        btnClose.title = 'Close (Esc)';
        btnClose.setAttribute('aria-label', 'Close');
        Object.assign(btnClose.style, {
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: '1',
            padding: '2px 4px',
        });
        btnClose.addEventListener('mouseenter', () => (btnClose.style.color = '#fff'));
        btnClose.addEventListener('mouseleave', () => (btnClose.style.color = '#888'));
        btnClose.addEventListener('click', () => confirmClose());
        header.append(title, btnClose);

        const hint = document.createElement('div');
        hint.innerHTML =
            'Each settings file runs like its own userscript on the URLs in its ' +
            '<code style="color:#9cdcfe">[match]</code> section (minus ' +
            '<code style="color:#9cdcfe">[exclude]</code>); its lists and CSS are private. A file without ' +
            '<code style="color:#9cdcfe">[match]</code> is a library: import it with ' +
            '<code style="color:#9cdcfe">[use]</code> and reference its lists as ' +
            '<code style="color:#9cdcfe">@LIB/NAME</code>. ' +
            'One rule per line: ' +
            '<code style="color:#9cdcfe">url-pattern | source | patterns | action | scope | options</code> ' +
            '(url <code style="color:#9cdcfe">*</code> = wherever the file runs). ' +
            'Files run in name order (prefix 10-…, 50-… to order them). ● runs here · · not here · × disabled · ○ library. ' +
            'See the read-only <code style="color:#9cdcfe">reference</code> file for full docs and examples.';
        Object.assign(hint.style, { margin: '0 0 10px', color: '#888', fontSize: '11px', lineHeight: '1.5' });

        // --- file bar ---
        const smallBtn = (label, tip) => {
            const b = makeBtn(label, '#333', '#ccc');
            Object.assign(b.style, { padding: '4px 9px', fontSize: '12px' });
            b.title = tip;
            return b;
        };
        const setEnabled = (btn, on) => {
            btn.disabled = !on;
            btn.style.opacity = on ? '1' : '0.4';
            btn.style.cursor = on ? 'pointer' : 'default';
        };
        const fileBar = document.createElement('div');
        Object.assign(fileBar.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignItems: 'center',
            margin: '0 0 8px',
        });
        const fileSel = document.createElement('select');
        Object.assign(fileSel.style, {
            background: '#2d2d2d',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            minWidth: '220px',
        });
        const enabledCb = document.createElement('input');
        enabledCb.type = 'checkbox';
        const enabledLabel = document.createElement('label');
        Object.assign(enabledLabel.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: '#999',
        });
        enabledLabel.title = 'Disabled files never run (an imported library is used regardless)';
        enabledLabel.append(enabledCb, 'enabled');
        const btnNew = smallBtn('New', `New file running on ${location.hostname}`);
        const btnDup = smallBtn('Duplicate', 'Copy this file (the copy starts disabled)');
        const btnRename = smallBtn('Rename', 'Rename this file (also updates files that [use] it)');
        const btnDelete = smallBtn('Delete', 'Delete this file');
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        const btnImport = smallBtn('Import…', 'Import files from an exported .json');
        const btnExportFile = smallBtn('Export file', 'Download this file and the libraries it uses as .json');
        const btnExportAll = smallBtn('Export all', 'Download all settings files as .json');
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.display = 'none';
        fileBar.append(
            fileSel,
            enabledLabel,
            btnNew,
            btnDup,
            btnRename,
            btnDelete,
            spacer,
            btnImport,
            btnExportFile,
            btnExportAll,
            importInput
        );

        const textarea = document.createElement('textarea');
        Object.assign(textarea.style, {
            width: '100%',
            height: '420px',
            background: '#252526',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '4px',
            padding: '8px',
            boxSizing: 'border-box',
            resize: 'vertical',
            overscrollBehavior: 'contain', // wheel scroll stays in the textarea, never chains to the page
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6',
        });

        const statusLine = document.createElement('div');
        Object.assign(statusLine.style, { marginTop: '6px', fontSize: '11px', color: '#888', minHeight: '16px' });
        const setStatus = (msg, color = '#888') => {
            statusLine.style.color = color;
            statusLine.textContent = msg;
        };

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, { display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' });
        const btnValidate = makeBtn('Validate', '#3a3a3a', '#9cdcfe');
        const btnCancel = makeBtn('Close', '#333', '#ccc');
        const btnSave = makeBtn('Save', '#1f6fad');
        const btnSaveReload = makeBtn('Save & Reload', '#0e639c');
        btnCancel.title = 'Close (Esc) — asks first if there are unsaved changes';
        btnSave.title = 'Save this file and keep editing (Ctrl+S) — applies on next page load';
        btnSaveReload.title = 'Save this file and reload — re-evaluates rules on the current page';

        // --- state ---
        const REF_ID = '\0reference'; // select value of the built-in reference file
        let files = [];
        let selId = REF_ID;
        let savedValue = DEFAULT_RULES;
        const sel = () => files.find((f) => f.id === selId) ?? null; // null = reference
        const isDirty = () => !!sel() && textarea.value !== savedValue;
        // In-dialog prompt for unsaved changes — a browser confirm() only offers
        // two choices. Resolves 'save' | 'discard' | 'stay' (Esc / backdrop = stay).
        let promptOpen = false;
        const askUnsaved = () =>
            new Promise((resolve) => {
                promptOpen = true;
                const layer = document.createElement('div');
                Object.assign(layer.style, {
                    position: 'fixed',
                    inset: '0',
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                });
                const box = document.createElement('div');
                Object.assign(box.style, {
                    background: '#252526',
                    border: '1px solid #555',
                    borderRadius: '8px',
                    padding: '16px',
                    maxWidth: '90vw',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                });
                const msg = document.createElement('div');
                msg.textContent = `"${sel().name}" has unsaved changes.`;
                Object.assign(msg.style, { color: '#fff', margin: '0 0 12px' });
                const row = document.createElement('div');
                Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' });
                const done = (choice) => {
                    promptOpen = false;
                    layer.remove();
                    resolve(choice);
                };
                const bStay = makeBtn('Stay', '#333', '#ccc');
                const bDiscard = makeBtn('Discard & continue', '#6e2a2a');
                const bSave = makeBtn('Save & continue', '#0e639c');
                bStay.addEventListener('click', () => done('stay'));
                bDiscard.addEventListener('click', () => done('discard'));
                bSave.addEventListener('click', () => done('save'));
                layer.addEventListener('click', (e) => e.target === layer && done('stay'));
                layer.addEventListener('keydown', (e) => {
                    if (e.key !== 'Escape') return;
                    e.stopPropagation();
                    done('stay');
                });
                row.append(bStay, bDiscard, bSave);
                box.append(msg, row);
                layer.append(box);
                overlay.append(layer);
                bSave.focus();
            });
        // Before leaving the current file (switch, new, import, close): true when it
        // is clean, was saved, or the user chose to discard. A save with errors
        // stays (the status line shows them).
        const proceedIfClean = async () => {
            if (!isDirty()) return true;
            const choice = await askUnsaved();
            if (choice === 'save') return saveSelected();
            return choice === 'discard';
        };
        const confirmClose = async () => {
            if (await proceedIfClean()) overlay.remove();
        };

        // Grouped by kind; within a group by name (= run order, see sortFiles).
        // Every mark is one monospace cell so the names line up.
        const renderSelect = () => {
            const option = (value, mark, label) => {
                const o = document.createElement('option');
                o.value = value;
                o.textContent = `${mark} ${label}`;
                return o;
            };
            const group = (label, opts) => {
                const g = document.createElement('optgroup');
                g.label = label;
                g.append(...opts);
                return g;
            };
            const runnable = [];
            const libs = [];
            for (const f of sortFiles([...files])) {
                const hdr = fileHeader(f.text);
                if (!hdr.match.length) libs.push(option(f.id, '○', f.name));
                else if (!f.enabled) runnable.push(option(f.id, '×', `${f.name}  (disabled)`));
                else runnable.push(option(f.id, fileRunsOn(hdr) ? '●' : '·', f.name));
            }
            const groups = [];
            if (runnable.length) groups.push(group('Files (in run order)', runnable));
            if (libs.length) groups.push(group('Libraries', libs));
            groups.push(group('Reference', [option(REF_ID, '≡', `${REFERENCE_NAME}  (read-only)`)]));
            fileSel.replaceChildren(...groups);
            fileSel.value = selId;
        };
        const updateControls = () => {
            const f = sel();
            textarea.readOnly = !f;
            textarea.style.opacity = f ? '1' : '0.8';
            enabledCb.checked = f?.enabled ?? false;
            enabledCb.disabled = !f;
            btnDup.textContent = f ? 'Duplicate' : 'Copy to new file';
            for (const b of [btnRename, btnDelete, btnExportFile, btnValidate, btnSave, btnSaveReload])
                setEnabled(b, !!f);
            setEnabled(btnExportAll, files.length > 0);
        };
        const selectFile = (id) => {
            selId = files.some((f) => f.id === id) ? id : REF_ID;
            savedValue = sel()?.text ?? DEFAULT_RULES;
            textarea.value = savedValue;
            textarea.scrollTop = 0;
            renderSelect();
            updateControls();
            if (sel()) validateInto();
            else setStatus('Read-only reference — use "Copy to new file" to start from it.');
        };
        // Apply a file-bar change to the CURRENT stored files (so concurrent
        // quick-adds are not overwritten), store it, and re-render.
        const mutate = async (fn) => {
            files = await getFiles();
            const res = fn(files);
            sortFiles(files);
            await saveFiles(files);
            renderSelect();
            updateControls();
            return res;
        };
        // Prompt for a valid, unused file name; null when cancelled.
        const askName = (msg, def, except = null) => {
            let name = def;
            let err = '';
            for (;;) {
                name = prompt(err + msg, name);
                if (name === null) return null;
                name = name.trim().toLowerCase();
                if (!FILE_NAME_RE.test(name)) err = `"${name}": use a-z, 0-9, _ . - (no spaces or /).\n`;
                else if (name === REFERENCE_NAME) err = `"${name}" is reserved.\n`;
                else if (files.some((f) => f.name === name && f.id !== except)) err = `"${name}" already exists.\n`;
                else return name;
            }
        };

        // Parse the textarea (in the context of all files, for [use]), render a
        // summary + first issues into the status line, and return the number of
        // error-severity issues. Shared by Validate + Save so a faulty file is
        // never stored. For a library, also re-checks the files importing it.
        const validateInto = () => {
            const f = sel();
            if (!f) return 0;
            const draft = { ...f, text: textarea.value };
            const ctxFiles = files.map((x) => (x.id === f.id ? draft : x));
            const parsed = parseFile(draft, ctxFiles);
            const issues = [...parsed.issues];
            const ownLists = [...parsed.lists.keys()].filter((n) => !n.includes('/')).length;
            const count = parsed.rules.length;
            let summary = `${count} rule${count !== 1 ? 's' : ''}, ${ownLists} list${ownLists !== 1 ? 's' : ''}`;
            if (parsed.isLibrary) {
                const users = importersOf(f.name, ctxFiles);
                summary += ` — library, used by: ${users.length ? users.join(', ') : 'none'}`;
                const libCache = new Map();
                for (const name of users) {
                    const errs = parseFile(
                        ctxFiles.find((x) => x.name === name),
                        ctxFiles,
                        libCache
                    ).issues.filter((i) => i.severity === 'error').length;
                    if (errs)
                        issues.push({
                            severity: 'warning',
                            message: `importing file "${name}" has ${errs} error${errs !== 1 ? 's' : ''}`,
                        });
                }
            } else {
                if (parsed.libs.length) summary += ` (+ ${parsed.libs.map((l) => l.name).join(', ')})`;
                const runs = f.enabled && fileRunsOn(parsed);
                const active = runs ? parsed.rules.filter((r) => r.urlPattern.regex.test(location.href)).length : 0;
                summary += runs
                    ? ` — runs here, ${active} rule${active !== 1 ? 's' : ''} match ${location.hostname}`
                    : ` — does not run on ${location.hostname}${f.enabled ? '' : ' (disabled)'}`;
            }
            const errs = issues.filter((i) => i.severity === 'error');
            const warns = issues.filter((i) => i.severity === 'warning');
            const shown = (errs.length ? errs : warns).slice(0, 2);
            const detail = shown.map((i) => (i.line ? `line ${i.line}: ` : '') + i.message).join('  •  ');
            setStatus(
                `${errs.length} error${errs.length !== 1 ? 's' : ''}, ${warns.length} warning${warns.length !== 1 ? 's' : ''} — ${summary}.` +
                    (detail ? `  (${detail}${(errs.length || warns.length) > 2 ? ', …' : ''})` : ''),
                errs.length ? '#f14c4c' : warns.length ? '#d7ba7d' : '#4ec9b0'
            );
            return errs.length;
        };

        // --- file bar actions ---
        fileSel.addEventListener('change', async () => {
            const target = fileSel.value;
            fileSel.value = selId; // stays on the current file until it is clean
            if (await proceedIfClean()) selectFile(target);
        });

        enabledCb.addEventListener('change', async () => {
            const id = selId;
            const on = enabledCb.checked;
            await mutate((fs) => {
                const f = fs.find((x) => x.id === id);
                if (f) f.enabled = on;
            });
            validateInto();
        });

        btnNew.addEventListener('click', async () => {
            if (!(await proceedIfClean())) return;
            const name = askName('Name of the new settings file:', uniqueFileName(hostFileName(), files));
            if (!name) return;
            const f = { id: newFileId(), name, enabled: true, text: hostFileText(name) };
            await mutate((fs) => fs.push(f));
            selectFile(f.id);
        });

        btnDup.addEventListener('click', async () => {
            if (!(await proceedIfClean())) return;
            const src = sel();
            const name = askName(
                src ? `Name of the copy of "${src.name}":` : 'Name of the new settings file:',
                uniqueFileName(src ? `${src.name}-copy` : hostFileName(), files)
            );
            if (!name) return;
            // A copy of a running file starts disabled so it doesn't double every
            // effect; a copy of the reference gets a [match] for this host.
            const f = src
                ? { id: newFileId(), name, enabled: false, text: src.text }
                : {
                      id: newFileId(),
                      name,
                      enabled: true,
                      text: DEFAULT_RULES.replace(/\[rules\]\s*$/, `[match]\n*://${location.hostname}/*\n\n[rules]\n`),
                  };
            await mutate((fs) => fs.push(f));
            selectFile(f.id);
        });

        btnRename.addEventListener('click', async () => {
            const f = sel();
            if (!f) return;
            if (!(await proceedIfClean())) return;
            const name = askName(`New name for "${f.name}":`, f.name, f.id);
            if (!name || name === f.name) return;
            const users = importersOf(f.name, files);
            const id = f.id;
            const old = f.name;
            await mutate((fs) => {
                for (const x of fs) {
                    if (x.id === id) x.name = name;
                    else if (users.includes(x.name)) x.text = renameImports(x.text, old, name);
                }
            });
            selectFile(id);
            if (users.length)
                setStatus(`Renamed; updated [use] and @${old}/ references in: ${users.join(', ')}.`, '#4ec9b0');
        });

        btnDelete.addEventListener('click', async () => {
            const f = sel();
            if (!f) return;
            const users = importersOf(f.name, files);
            const msg =
                `Delete settings file "${f.name}"? This cannot be undone — use "Export file" first to keep a copy.` +
                (users.length ? `\n\nThese files [use] it and will report errors: ${users.join(', ')}` : '');
            if (!confirm(msg)) return;
            const i = files.indexOf(f);
            await mutate((fs) =>
                fs.splice(
                    fs.findIndex((x) => x.id === f.id),
                    1
                )
            );
            selectFile(files[Math.min(i, files.length - 1)]?.id ?? REF_ID);
        });

        btnExportFile.addEventListener('click', () => {
            const f = sel();
            if (!f) return;
            const libs = indexConfigRaw(f.text.split('\n'))
                .use.map((n) => files.find((x) => x.name === n))
                .filter((x) => x && !fileHeader(x.text).match.length);
            downloadJson(`content-blur-${f.name}.json`, [f, ...new Set(libs)]);
            setStatus(
                `Exported "${f.name}"` +
                    (libs.length
                        ? ` + librar${libs.length !== 1 ? 'ies' : 'y'} ${libs.map((x) => x.name).join(', ')}`
                        : '') +
                    (isDirty() ? ' (stored version — unsaved changes not included)' : '') +
                    '.',
                '#4ec9b0'
            );
        });

        btnExportAll.addEventListener('click', () => {
            downloadJson(`content-blur-all-${new Date().toISOString().slice(0, 10)}.json`, files);
            setStatus(`Exported ${files.length} file${files.length !== 1 ? 's' : ''}.`, '#4ec9b0');
        });

        btnImport.addEventListener('click', async () => {
            if (!(await proceedIfClean())) return;
            importInput.value = '';
            importInput.click();
        });
        importInput.addEventListener('change', async () => {
            const file = importInput.files?.[0];
            if (!file) return;
            let incoming;
            try {
                incoming = parseImport(await file.text());
            } catch (e) {
                setStatus(`Import failed: ${e.message}`, '#f14c4c');
                return;
            }
            const counts = { added: 0, replaced: 0, unchanged: 0, skipped: [] };
            let lastId = null;
            await mutate((fs) => {
                for (const inc of incoming) {
                    if (!FILE_NAME_RE.test(inc.name) || inc.name === REFERENCE_NAME) {
                        counts.skipped.push(inc.name);
                        continue;
                    }
                    const existing = fs.find((x) => x.name === inc.name);
                    if (existing && existing.text === inc.text) {
                        counts.unchanged++;
                        continue;
                    }
                    if (existing) {
                        const alt = uniqueFileName(inc.name, fs);
                        if (confirm(`"${inc.name}" already exists.\n\nOK = replace it\nCancel = import as "${alt}"`)) {
                            Object.assign(existing, { enabled: inc.enabled, text: inc.text });
                            counts.replaced++;
                            lastId = existing.id;
                            continue;
                        }
                        inc.name = alt;
                    }
                    const f = { id: newFileId(), ...inc };
                    fs.push(f);
                    counts.added++;
                    lastId = f.id;
                }
            });
            selectFile(lastId ?? selId);
            setStatus(
                `Imported: ${counts.added} added, ${counts.replaced} replaced, ${counts.unchanged} unchanged` +
                    (counts.skipped.length ? `, skipped invalid names: ${counts.skipped.join(', ')}` : '') +
                    ' — reload the page to apply.',
                '#4ec9b0'
            );
        });

        // --- save / close ---
        btnValidate.addEventListener('click', () => validateInto());
        btnCancel.addEventListener('click', confirmClose);

        const saveSelected = async () => {
            if (validateInto() > 0) return false; // errors → stay in the dialog, do not persist
            const id = selId;
            const text = textarea.value;
            await mutate((fs) => {
                const f = fs.find((x) => x.id === id);
                if (f) f.text = text;
            });
            savedValue = text;
            await loadRules();
            setStatus(
                `Saved "${sel()?.name}" — applies on next page load. ${statusLine.textContent}`,
                statusLine.style.color
            );
            return true;
        };
        btnSave.addEventListener('click', () => saveSelected());
        btnSaveReload.addEventListener('click', async () => {
            if (await saveSelected()) location.reload();
        });

        // Close on backdrop click only when the press STARTED on the backdrop and
        // outside a small dead zone around the panel — so selecting text and
        // releasing just outside the textarea (or a near-miss click) doesn't discard
        // the dialog. Only a deliberate press+release on the backdrop closes it.
        const CLOSE_DEADZONE_PX = 12;
        let pressedOnBackdrop = false;
        overlay.addEventListener('pointerdown', (e) => {
            if (e.target !== overlay) {
                pressedOnBackdrop = false;
                return;
            }
            const r = panel.getBoundingClientRect();
            const nearPanel =
                e.clientX >= r.left - CLOSE_DEADZONE_PX &&
                e.clientX <= r.right + CLOSE_DEADZONE_PX &&
                e.clientY >= r.top - CLOSE_DEADZONE_PX &&
                e.clientY <= r.bottom + CLOSE_DEADZONE_PX;
            pressedOnBackdrop = !nearPanel;
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && pressedOnBackdrop) confirmClose();
            pressedOnBackdrop = false;
        });
        overlay.addEventListener('keydown', (e) => {
            if (promptOpen) return;
            if (e.key === 'Escape') confirmClose();
            // Ctrl/Cmd+S saves (and keeps the dialog open) instead of the
            // browser's "save page as".
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                e.stopPropagation();
                if (sel()) saveSelected();
            }
        });

        btnRow.append(btnValidate, btnCancel, btnSave, btnSaveReload);
        panel.append(header, hint, fileBar, textarea, statusLine, btnRow);
        overlay.append(panel);
        (document.body ?? document.documentElement).append(overlay);
        textarea.focus();

        // Initial file: the requested one, else the first enabled file running
        // here, else the first file, else the reference.
        getFiles().then((fs) => {
            files = fs;
            const pick =
                fs.find((f) => f.name === fileName) ??
                fs.find((f) => f.enabled && fileRunsOn(fileHeader(f.text))) ??
                fs[0];
            selectFile(pick?.id ?? REF_ID);
        });
    }

    // -----------------------------------------------------------------------
    //  HOTKEYS
    // -----------------------------------------------------------------------

    function matchesKey(e, def) {
        return (
            e.altKey === def.alt &&
            e.shiftKey === def.shift &&
            e.ctrlKey === def.ctrl &&
            e.metaKey === def.meta &&
            e.key.toLowerCase() === def.key
        );
    }

    // Human-readable label for a KEYS entry, e.g. { alt, shift, key:'r' } → "Alt+Shift+R".
    function keyLabel(def) {
        const parts = [];
        if (def.ctrl) parts.push('Ctrl');
        if (def.alt) parts.push('Alt');
        if (def.shift) parts.push('Shift');
        if (def.meta) parts.push('Meta');
        parts.push(def.key.toUpperCase());
        return parts.join('+');
    }

    document.addEventListener('keydown', (e) => {
        // Ignore hotkeys while typing in page inputs, but still allow them inside our
        // own bottom bar so re-pressing the hotkey (while hovering a new link) rebuilds
        // it with the freshly-captured value instead of doing nothing.
        if (isEditableTarget(e.target) && !e.target.closest?.('#ucb-quick-panel')) return;
        if (matchesKey(e, KEYS.openSettings)) {
            e.preventDefault();
            openSettings();
        } else if (matchesKey(e, KEYS.quickAddPanel)) {
            e.preventDefault();
            quickAddPanel();
        } else if (matchesKey(e, KEYS.quickBlock)) {
            e.preventDefault();
            quickBlock();
        } else if (matchesKey(e, KEYS.quickAddSilent)) {
            e.preventDefault();
            quickAddSilent();
        } else if (matchesKey(e, KEYS.toggleStyles)) {
            e.preventDefault();
            toggleStyles();
        } else if (matchesKey(e, KEYS.toggleDebug)) {
            e.preventDefault();
            toggleDebug();
        }
    });

    // ---- Peek: bare-modifier hold/toggle to suspend effects (see PEEK config) ----

    let holdTimer = null; // pending hold-delay timer (hold mode)
    let tapStart = 0; // press timestamp of a candidate tap (toggle mode)
    let tapCandidate = false; // a bare peek modifier is down with no other key since

    const isPeekKey = (e) => PEEK.keys.includes(e.key);

    // True only for a single, bare modifier (no second modifier held), so the
    // existing Alt/Shift combos (Alt+R, Alt+Shift+S, …) never count as a bare
    // peek or commit tap.
    function isBareModifier(e) {
        if (e.key === 'Shift') return !e.ctrlKey && !e.altKey && !e.metaKey;
        if (e.key === 'Alt') return !e.ctrlKey && !e.shiftKey && !e.metaKey;
        return true; // a non-modifier key configured as a peek key: accept as-is
    }

    document.addEventListener(
        'keydown',
        (e) => {
            if (!PEEK.enabled) return;
            if (!isPeekKey(e)) {
                // Any other key cancels a pending/candidate peek (e.g. Alt then R).
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                tapCandidate = false;
                return;
            }
            if (e.repeat || isEditableTarget(e.target)) return;
            if (!isBareModifier(e)) return;
            if (e.key === 'Alt') e.preventDefault(); // suppress Firefox menu-bar focus
            if (PEEK.mode === 'hold') {
                if (holdTimer || peekOn) return;
                holdTimer = setTimeout(() => {
                    holdTimer = null;
                    setPeek(true);
                }, PEEK.holdDelayMs);
            } else {
                tapCandidate = true;
                tapStart = performance.now();
            }
        },
        true
    );

    document.addEventListener(
        'keyup',
        (e) => {
            if (!PEEK.enabled || !isPeekKey(e)) return;
            if (e.key === 'Alt') e.preventDefault();
            if (PEEK.mode === 'hold') {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                setPeek(false);
            } else if (tapCandidate && performance.now() - tapStart <= PEEK.tapMaxMs) {
                tapCandidate = false;
                // While the quick-add bar is open, bare taps of the commit key belong
                // to COMMIT_TAP — don't also toggle a peek on each tap.
                if (COMMIT_TAP.enabled && e.key === COMMIT_TAP.key && document.getElementById('ucb-quick-panel'))
                    return;
                setPeek(!peekOn);
                toast('Content Blur: peek ' + (peekOn ? 'on (effects revealed)' : 'off'));
            }
        },
        true
    );

    // Losing focus mid-hold drops the keyup — don't get stuck revealed.
    window.addEventListener('blur', () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        tapCandidate = false;
        if (PEEK.mode === 'hold') setPeek(false);
    });

    // ---- Commit-tap: rapid bare-modifier taps commit the quick-add bar ----

    let ctDownAt = 0; // keydown timestamp of a candidate tap (0 = none pending)
    let ctTaps = 0; // completed taps in the current sequence
    let ctLastUp = 0; // keyup timestamp of the last completed tap

    document.addEventListener(
        'keydown',
        (e) => {
            if (!COMMIT_TAP.enabled) return;
            if (e.key !== COMMIT_TAP.key) {
                // Any other key (incl. a second modifier, e.g. Alt+Shift+R) breaks the tap sequence.
                ctDownAt = 0;
                ctTaps = 0;
                return;
            }
            if (e.repeat) return;
            if (!isBareModifier(e) || !document.getElementById('ucb-quick-panel')) {
                ctDownAt = 0;
                ctTaps = 0;
                return;
            }
            ctDownAt = performance.now();
        },
        true
    );

    document.addEventListener(
        'keyup',
        (e) => {
            if (!COMMIT_TAP.enabled || e.key !== COMMIT_TAP.key || !ctDownAt) return;
            const now = performance.now();
            const isTap = now - ctDownAt <= COMMIT_TAP.tapMaxMs;
            ctDownAt = 0;
            if (!isTap) {
                ctTaps = 0;
                return;
            }
            if (ctTaps && now - ctLastUp > COMMIT_TAP.windowMs) ctTaps = 0; // stale sequence
            ctTaps++;
            ctLastUp = now;
            if (ctTaps >= COMMIT_TAP.taps) {
                ctTaps = 0;
                document.getElementById('ucb-quick-panel')?._ucbCommit?.();
            }
        },
        true
    );

    window.addEventListener('blur', () => {
        ctDownAt = 0;
        ctTaps = 0;
    });

    // -----------------------------------------------------------------------
    //  INIT
    // -----------------------------------------------------------------------

    GM_registerMenuCommand(`⚙️ Content Blur Settings (${keyLabel(KEYS.openSettings)})`, () => openSettings());
    GM_registerMenuCommand(
        `➕ Quick-add: ${keyLabel(KEYS.quickAddSilent)} (silent) / ${keyLabel(KEYS.quickAddPanel)} (panel)`,
        quickAddPanel
    );
    GM_registerMenuCommand(`⛔ Quick-block into matching rule (${keyLabel(KEYS.quickBlock)})`, quickBlock);
    GM_registerMenuCommand(
        `👁️ Toggle all effects on/off (${keyLabel(KEYS.toggleStyles)})` +
            (PEEK.enabled ? ` — or hold ${PEEK.keys.join('/')} to peek` : ''),
        toggleStyles
    );
    GM_registerMenuCommand(`🐞 Toggle debug overlay (${keyLabel(KEYS.toggleDebug)})`, toggleDebug);

    await loadRules();

    if (activeRules.length > 0 && !isCloudflareChallenge()) {
        ensureStyles();
        scan(document.body);
        startObserver();
        console.log(LOG_PREFIX, `active: ${activeRules.length} rule(s) match ${location.hostname}`);
    }
})();
