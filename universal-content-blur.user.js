// ==UserScript==
// @name         Universal Content Blur
// @namespace    https://github.com/cbaoth/userscripts
// @version      2026-07-04T030213
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
// @downloadURL  https://github.com/cbaoth/userscripts/raw/master/universal-content-blur.user.js
// ==/UserScript==

(async function () {
    'use strict';
    /* eslint-disable no-console */

    // -----------------------------------------------------------------------
    //  CONFIG (constants — tweak to taste)
    // -----------------------------------------------------------------------

    const STORAGE_KEY = 'contentBlurRules';
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

    // "Peek": hold (or tap) a bare modifier to temporarily suspend ALL effects so
    // you can see the page as-is — reveal blurred content, drop highlights, etc.
    // Non-destructive (classes are removed then restored). Set enabled:false to
    // disable. The keys are bare modifiers (KeyboardEvent.key); any one triggers.
    const PEEK = {
        enabled: true,
        mode: 'hold', // 'hold' = active only while held; 'toggle' = tap to flip on/off
        keys: ['Shift', 'Alt'], // bare modifier keys that trigger (either one, not combined)
        holdDelayMs: 1000, // hold mode: ignore presses shorter than this — long enough that pressing a hotkey combo (Alt+R/…) never trips a peek; also ignores Shift-for-capitals
        tapMaxMs: 300, // toggle mode: max press duration still counted as a deliberate tap
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
# Universal Content Blur — configuration
#
# Three kinds of sections:
#
#   [list:NAME]   reusable pattern list — one regex per line (case-insensitive).
#                 Reference it from a rule as @NAME. A list line may itself be
#                 @OTHER to include another list (nesting up to 5 levels deep;
#                 reference loops and self-references are silently dropped).
#                 Wildcards (* / ?) are supported in list names: @text_* expands
#                 to every list whose name matches that glob. This works both in
#                 rule patterns and in list entries.
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
#
#   [rules]       one rule per line, pipe-separated:
#                     url-pattern | source | patterns | action | scope | options
#
# Outside [css], lines starting with # or // and blank lines are ignored.
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
#                 *       all of the above
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
#               A , or | inside "..." is literal (not a separator). Inside a raw
#               /regex/ they still split, so for a regex that needs | use a
#               [list:NAME] line (list entries are one per line, so | and , are
#               literal there).
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
# /* hard hide — no hover reveal once removed from layout */
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

[rules]
`;

    // -----------------------------------------------------------------------
    //  SHARED HELPERS
    // -----------------------------------------------------------------------

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Split on a top-level single-char delimiter, treating "…" as a literal group so
    // a delimiter inside double quotes (\" = literal quote) is NOT a separator. A raw
    // /regex/ is NOT protected — a | or , inside a regex still splits (use "…" for a
    // literal, or a [list:…] line for a regex that needs |). Whitespace is not trimmed.
    function splitTopLevel(str, delim) {
        const out = [];
        let cur = '';
        let inQuote = false;
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
            } else if (c === '"') {
                inQuote = true;
                cur += c;
            } else if (c === delim) {
                out.push(cur);
                cur = '';
            } else {
                cur += c;
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

    // Glob (with *) or /regex/flags → { regex }. Mirrors universal-image-resizer.
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
    // \* \? \\ \" \/ as the literal characters. The caller decides anchoring.
    function literalBody(text) {
        let body = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '\\' && '*?\\"/'.includes(text[i + 1])) {
                body += escapeRegExp(text[i + 1]); // literal *, ?, \, ", or /
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

    const VALID_SOURCES = ['text', 'alt', 'title', 'url', 'user'];
    const MAX_LIST_DEPTH = 5; // max nested [list:…] reference levels before giving up

    function parseSource(field, issues, lineNum) {
        const parts = field
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        if (parts.includes('*')) return [...VALID_SOURCES];
        const out = [];
        for (const p of parts) {
            if (VALID_SOURCES.includes(p)) out.push(p);
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
    const RESERVED_ACTIONS = new Set(['hover', 'freeze', 'frozen']);

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

    function parseOptions(field, issues, lineNum) {
        const opts = { hover: true, freeze: false };
        if (!field) return opts;
        for (const raw of field.split(',')) {
            const t = raw.trim().toLowerCase();
            if (!t) continue;
            if (t === 'hover') opts.hover = true;
            else if (t === 'no-hover') opts.hover = false;
            else if (t === 'freeze') opts.freeze = true;
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

    // Parse the whole config into { lists, rules, css, issues }. `issues` collects
    // structured problems (errors block save; warnings are advisory). `css` is the
    // raw text of the [css] section, injected verbatim into the page.
    function parseConfig(text) {
        const lists = new Map();
        const rules = [];
        const cssLines = [];
        const issues = [];
        let section = null; // { type:'list', name } | { type:'rules' } | { type:'css' }
        let lineNum = 0;

        for (const rawLine of text.split('\n')) {
            lineNum++;
            const trimmed = rawLine.trim();

            // Section headers are detected before comment filtering so we can switch
            // into/out of [css] — where # is a CSS id selector, not a comment.
            const listHeader = trimmed.match(/^\[list:([^\]]+)\]$/i);
            if (listHeader) {
                const name = listHeader[1].trim().toLowerCase();
                if (!lists.has(name)) lists.set(name, []);
                section = { type: 'list', name };
                continue;
            }
            if (/^\[rules\]$/i.test(trimmed)) {
                section = { type: 'rules' };
                continue;
            }
            if (/^\[css\]$/i.test(trimmed)) {
                section = { type: 'css' };
                continue;
            }

            // Inside [css]: capture verbatim (skip only blank lines). # and // stay
            // literal so #id selectors and CSS work; use /* … */ for CSS comments.
            if (section && section.type === 'css') {
                if (trimmed) cssLines.push(rawLine);
                continue;
            }

            // Everywhere else: # and // are comments, blank lines are ignored.
            const line = trimmed;
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            if (section && section.type === 'list') {
                lists.get(section.name).push(line);
                continue;
            }

            // Anything with pipes is a rule (allow rules even before a [rules] header).
            if (line.includes('|') || (section && section.type === 'rules')) {
                const rule = parseRuleLine(line, lineNum, lists, issues);
                if (rule) rules.push(rule);
                continue;
            }

            reportIssue(issues, lineNum, 'warning', `ignored (not in a section, no pipes): ${line}`);
        }

        return { lists, rules, css: cssLines.join('\n'), issues };
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
        const fragments = [];
        const seenFragments = new Set();
        for (const tok of splitTopLevel(rawPatterns, ',')) {
            const t = tok.trim();
            if (!t) continue;
            if (t.startsWith('@')) {
                expandListFragments(
                    t.slice(1).toLowerCase(),
                    lists,
                    fragments,
                    seenFragments,
                    new Set(),
                    1,
                    issues,
                    lineNum
                );
            } else {
                const frag = patternTokenToFragment(t);
                if (frag !== null && !seenFragments.has(frag)) {
                    seenFragments.add(frag);
                    fragments.push(frag);
                }
            }
        }
        const regex = buildCombinedRegex(fragments, issues, lineNum);
        if (!regex) {
            reportIssue(issues, lineNum, 'error', `no valid patterns: ${rawPatterns}`);
            return null;
        }

        const scope = parseScope(rawScope, issues, lineNum);
        return { urlPattern, sources, regex, actions, scope, options };
    }

    // -----------------------------------------------------------------------
    //  RULE STATE
    // -----------------------------------------------------------------------

    let rules = [];
    let activeRules = [];
    let customCss = ''; // raw [css] section, injected by ensureStyles()

    async function loadRules() {
        const stored = await GM.getValue(STORAGE_KEY, null);
        const parsed = parseConfig(stored ?? DEFAULT_RULES);
        rules = parsed.rules;
        customCss = parsed.css;
        activeRules = rules.filter((r) => r.urlPattern.regex.test(location.href));
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

    function applyActions(matchedEl, rule) {
        const base = resolveTarget(matchedEl, rule.scope);
        if (!base || processed.has(base)) return;
        const group = expandScopeGroup(base, rule.scope);
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
            // If a peek is currently active, keep newly-matched content revealed too.
            if (suspended) suspendEl(target);
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
    //  PEEK / SUSPEND (temporarily reveal everything — see PEEK config)
    // -----------------------------------------------------------------------

    let suspended = false;
    const touched = new Set(); // elements we've applied effect classes to
    const NON_EFFECT_CLASSES = new Set([HOVER_CLASS, FREEZE_CLASS, FROZEN_CLASS]);

    // Suspend an element: stash its ucb-* effect classes in a data attribute and
    // remove them, so the cascade restores the element's original look exactly.
    // This works for any effect (built-in or user [css]), unlike a global "off".
    function suspendEl(el) {
        if (el.dataset.ucbOff != null) return;
        const eff = [...el.classList].filter((c) => c.startsWith('ucb-') && !NON_EFFECT_CLASSES.has(c));
        if (!eff.length) return;
        el.dataset.ucbOff = eff.join(' ');
        el.classList.remove(...eff);
        if (el.classList.contains(FREEZE_CLASS)) setMotion(el, true); // let motion play while revealed
    }

    function resumeEl(el) {
        const eff = el.dataset.ucbOff;
        if (eff == null) return;
        el.classList.add(...eff.split(' ').filter(Boolean));
        delete el.dataset.ucbOff;
        if (el.classList.contains(FREEZE_CLASS)) setMotion(el, false);
    }

    function setSuspended(on) {
        if (on === suspended) return;
        suspended = on;
        for (const el of [...touched]) {
            if (!el.isConnected) {
                touched.delete(el);
                continue;
            }
            if (on) suspendEl(el);
            // Members of a currently-hovered group stay revealed when a peek ends.
            else if (!hoveredGroup || !hoveredGroup.includes(el)) resumeEl(el);
        }
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
                if (hoveredGroup && !suspended) for (const el of hoveredGroup) resumeEl(el);
                hoveredGroup = group;
                if (!suspended) for (const el of group) suspendEl(el);
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
                if (!suspended) for (const el of group) resumeEl(el);
            },
            true
        );
    }

    // -----------------------------------------------------------------------
    //  SCANNING
    // -----------------------------------------------------------------------

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);

    function scanText(root, textRules) {
        if (!textRules.length) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        let node;
        while ((node = walker.nextNode())) {
            const text = node.nodeValue;
            const el = node.parentElement;
            for (const rule of textRules) {
                if (rule.regex.test(text)) applyActions(el, rule);
            }
        }
    }

    function scanAttributes(root, attrRules) {
        if (!attrRules.length) return;
        // Gather candidate elements once; cheaper than per-rule querySelectorAll.
        // Also include root itself — querySelectorAll only searches descendants.
        const sel = 'a[href], img[src], [alt], [title]';
        const descendants = root.querySelectorAll === undefined ? [] : root.querySelectorAll(sel);
        const els = root.matches?.(sel) ? [root, ...descendants] : descendants;
        for (const el of els) {
            const href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('src'));
            const alt = el.getAttribute && el.getAttribute('alt');
            const title = el.getAttribute && el.getAttribute('title');
            const usernames = href ? extractUsernames(href) : null;

            for (const rule of attrRules) {
                for (const source of rule.sources) {
                    let hit = false;
                    if (source === 'url' && href) hit = rule.regex.test(href);
                    else if (source === 'alt' && alt) hit = rule.regex.test(alt);
                    else if (source === 'title' && title) hit = rule.regex.test(title);
                    else if (source === 'user' && usernames) hit = usernames.some((u) => rule.regex.test(u));
                    if (hit) {
                        applyActions(el, rule);
                        break;
                    }
                }
            }
        }
    }

    function scan(root = document.body) {
        if (!root || isCloudflareChallenge()) return;
        ensureStyles();
        const textRules = activeRules.filter((r) => r.sources.includes('text'));
        const attrRules = activeRules.filter((r) => r.sources.some((s) => s !== 'text'));
        scanText(root, textRules);
        scanAttributes(root, attrRules);
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
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const roots = [...pendingRoots];
                pendingRoots.clear();
                for (const root of roots) if (root.isConnected) scan(root);
            }, SCAN_DEBOUNCE_MS);
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
        return !!el?.closest?.('#ucb-quick-panel, #ucb-settings');
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
    // literal-syntax specials (\ * ? ") and a leading / (which would otherwise be
    // read as the start of a /regex/). Interior characters need no escaping.
    function escapeLiteral(s) {
        const out = s.replace(/([\\*?"])/g, '\\$1');
        return out.startsWith('/') ? '\\' + out : out;
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

    // Append a rule line, unless a semantically-identical rule already exists.
    // Returns { changed } so callers can report added-vs-already-present.
    async function appendRuleLine(ruleLine) {
        const stored = (await GM.getValue(STORAGE_KEY, null)) ?? DEFAULT_RULES;
        const { ruleEntries } = indexConfigRaw(stored.split('\n'));
        const newNorm = normalizeRuleLine(ruleLine);
        if (ruleEntries.some((e) => e.fields.join(' | ') === newNorm)) {
            return { changed: false };
        }
        let next = stored.trimEnd();
        if (!/\[rules\]/i.test(next)) next += '\n\n[rules]';
        next += '\n' + ruleLine + '\n';
        await GM.setValue(STORAGE_KEY, next);
        await loadRules();
        return { changed: true };
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
    async function addNewRuleFromContext(ctx) {
        const res = await appendRuleLine(buildRuleLine(ctx.source, defaultToken(ctx), 'self', ['hover']));
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
        const res = await addNewRuleFromContext(ctx);
        toast(
            res.changed
                ? `Content Blur: added rule for "${truncate(ctx.label, 40)}"`
                : `Content Blur: rule for "${truncate(ctx.label, 40)}" already exists`
        );
    }

    // Quick-block: add the captured pattern to the FIRST existing rule whose source
    // type + URL pattern match the current page — into its first referenced
    // [list:NAME] if it has one, else appended inline to the rule's patterns field.
    // Falls back to creating a new rule when nothing matches. Great for blocking
    // users one keypress at a time into a list an existing rule already uses.
    async function quickBlock() {
        const ctx = captureContext();
        if (!ctx) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        const stored = (await GM.getValue(STORAGE_KEY, null)) ?? DEFAULT_RULES;
        const res = addPatternToMatchingRule(stored, ctx);
        if (!res) {
            const added = await addNewRuleFromContext(ctx);
            toast(
                added.changed
                    ? `Content Blur: no matching rule — created one for "${truncate(ctx.label, 40)}"`
                    : `Content Blur: rule for "${truncate(ctx.label, 40)}" already exists`
            );
            return;
        }
        if (res.changed) {
            await GM.setValue(STORAGE_KEY, res.text);
            await loadRules();
            scan(document.body);
            if (activeRules.length > 0) startObserver();
        }
        toast('Content Blur: ' + res.message);
    }

    // Scan raw config lines once into an index of list blocks + rule lines, so the
    // quick-add panel and quick-block can insert into a chosen destination and edit
    // the raw text in place. Mirrors the section handling in parseConfig().
    function indexConfigRaw(lines) {
        const listBlocks = new Map(); // name -> { headerIdx, lastEntryIdx }
        const ruleEntries = []; // { idx, fields } for each rule line
        let section = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            const listHeader = line.match(/^\[list:([^\]]+)\]$/i);
            if (listHeader) {
                const name = listHeader[1].trim().toLowerCase();
                if (!listBlocks.has(name)) listBlocks.set(name, { headerIdx: i, lastEntryIdx: i });
                section = { type: 'list', name };
                continue;
            }
            if (/^\[rules\]$/i.test(line)) {
                section = { type: 'rules' };
                continue;
            }
            if (/^\[css\]$/i.test(line)) {
                section = { type: 'css' };
                continue;
            }
            if (section && section.type === 'css') continue; // never touch raw CSS
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            if (section && section.type === 'list') {
                listBlocks.get(section.name).lastEntryIdx = i;
                continue;
            }
            if (line.includes('|') || (section && section.type === 'rules')) {
                const fields = splitTopLevel(line, '|').map((f) => f.trim());
                if (fields.length >= 4) ruleEntries.push({ idx: i, fields });
            }
        }
        return { listBlocks, ruleEntries };
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

    // Quick-block target: the FIRST rule matching the current URL + captured source.
    // Prefer its first referenced [list:NAME]; else append inline to its patterns.
    // Returns { text, changed, message } (text only when changed), or null.
    function addPatternToMatchingRule(text, ctx) {
        const lines = text.split('\n');
        const { listBlocks, ruleEntries } = indexConfigRaw(lines);
        const match = ruleEntries.find((e) => {
            const up = parseUrlPattern(e.fields[0]);
            return up && up.regex.test(location.href) && parseSource(e.fields[1]).includes(ctx.source);
        });
        if (!match) return null;

        const listRef = splitTopLevel(match.fields[2], ',')
            .map((t) => t.trim())
            .find((t) => t.startsWith('@'));
        const token = defaultToken(ctx);
        let res;
        if (listRef && listBlocks.has(listRef.slice(1).toLowerCase())) {
            const name = listRef.slice(1).toLowerCase();
            res = insertListEntry(lines, listBlocks.get(name), name, token, ctx.label);
        } else {
            res = insertRulePattern(lines, match, token, ctx.label);
        }
        return { ...res, text: res.changed ? lines.join('\n') : undefined };
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

        // Load config (to enumerate destinations) + remembered panel state.
        const stored = (await GM.getValue(STORAGE_KEY, null)) ?? DEFAULT_RULES;
        const lines = stored.split('\n');
        const { listBlocks, ruleEntries } = indexConfigRaw(lines);
        const listNames = [...listBlocks.keys()];
        const savedState = (await GM.getValue(PANEL_STATE_KEY, null)) || {};

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
            if (m.value === 'rule' && !ruleEntries.length) o.disabled = true;
            if (m.value === 'list' && !listNames.length) o.disabled = true;
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
                Object.assign(mid, { sourceSel, scopeSel, hoverCb });
                midWrap.append(field('source', sourceSel), field('scope', scopeSel), hoverLabel);
            } else if (mode === 'rule') {
                const ruleSel = mkSelect();
                Object.assign(ruleSel.style, { maxWidth: '440px' });
                ruleEntries.forEach((e, i) => {
                    const o = document.createElement('option');
                    o.value = String(i);
                    o.textContent = truncate(lines[e.idx].trim(), 70);
                    if (lines[e.idx].trim() === savedState.ruleKey) o.selected = true;
                    ruleSel.appendChild(o);
                });
                mid.ruleSel = ruleSel;
                midWrap.append(field('target rule', ruleSel));
            } else {
                const listSel = mkSelect();
                for (const name of listNames) {
                    const o = document.createElement('option');
                    o.value = o.textContent = name;
                    if (name === savedState.listName) o.selected = true;
                    listSel.appendChild(o);
                }
                mid.listSel = listSel;
                midWrap.append(field('target list', listSel));
            }
        };

        // Initial mode: remembered, if still available; else new.
        let initialMode = savedState.mode || 'new';
        if (initialMode === 'rule' && !ruleEntries.length) initialMode = 'new';
        if (initialMode === 'list' && !listNames.length) initialMode = 'new';
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
        const applyEdits = async (changed) => {
            if (!changed) return;
            await GM.setValue(STORAGE_KEY, lines.join('\n'));
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
                const res = await appendRuleLine(line);
                if (res.changed) {
                    scan(document.body);
                    if (activeRules.length > 0) startObserver();
                }
                await saveState({ mode });
                toast('Content Blur: ' + (res.changed ? 'rule added' : 'rule already exists'));
            } else if (mode === 'rule') {
                const entry = ruleEntries[Number(mid.ruleSel.value)];
                const res = insertRulePattern(lines, entry, token, ctx.label);
                await applyEdits(res.changed);
                await saveState({ mode, ruleKey: lines[entry.idx].trim() });
                toast('Content Blur: ' + res.message);
            } else {
                const name = mid.listSel.value;
                const res = insertListEntry(lines, listBlocks.get(name), name, token, ctx.label);
                await applyEdits(res.changed);
                await saveState({ mode, listName: name });
                toast('Content Blur: ' + res.message);
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

    function openSettings() {
        document.getElementById('ucb-settings')?.remove();

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
            width: '760px',
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
        title.textContent = 'Universal Content Blur — Rules';
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
            'One rule per line: ' +
            '<code style="color:#9cdcfe">url-pattern | source | patterns | action | scope | options</code>. ' +
            'Define reusable lists with <code style="color:#9cdcfe">[list:NAME]</code> and reference them as ' +
            '<code style="color:#9cdcfe">@NAME</code> or <code style="color:#9cdcfe">@glob*</code> — lists ' +
            'may reference other lists (including wildcards) to compose categories. ' +
            'Patterns: <code style="color:#9cdcfe">word</code> (whole-word), ' +
            '<code style="color:#9cdcfe">"exact"</code>, <code style="color:#9cdcfe">/regex/</code>. ' +
            'Sources: text, alt, title, url, user. Scope: self, up:N, ' +
            'closest:SEL, row — append prev:N / next:N to extend the effect to sibling ' +
            'elements (hover reveals the whole group). Actions: blur (or blur:N), plus any ' +
            '<code style="color:#9cdcfe">.ucb-NAME</code> class you define in a ' +
            '<code style="color:#9cdcfe">[css]</code> block. ' +
            'See the comments in the default config for full docs.';
        Object.assign(hint.style, { margin: '0 0 10px', color: '#888', fontSize: '11px', lineHeight: '1.5' });

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

        let savedValue = '';
        GM.getValue(STORAGE_KEY, null).then((stored) => {
            savedValue = stored ?? DEFAULT_RULES;
            textarea.value = savedValue;
            textarea.scrollTop = textarea.scrollHeight;
        });

        const isDirty = () => textarea.value !== savedValue;
        const confirmClose = () => {
            if (isDirty() && !confirm('Discard unsaved changes to blur rules?')) return;
            overlay.remove();
        };

        const statusLine = document.createElement('div');
        Object.assign(statusLine.style, { marginTop: '6px', fontSize: '11px', color: '#888', minHeight: '16px' });

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, { display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' });

        const btnReset = makeBtn('Reset to Default', '#444', '#ccc');
        const btnValidate = makeBtn('Validate', '#3a3a3a', '#9cdcfe');
        const btnCancel = makeBtn('Cancel', '#333', '#ccc');
        const btnSave = makeBtn('Save', '#1f6fad');
        const btnSaveReload = makeBtn('Save & Reload', '#0e639c');

        btnSave.title = 'Save — applies on next page load; current page not re-evaluated';
        btnSaveReload.title = 'Save and reload — re-evaluates rules on the current page';

        btnReset.addEventListener('click', () => {
            textarea.value = DEFAULT_RULES;
            statusLine.textContent = '';
        });

        // Parse the textarea, render a summary + first issues into the status line,
        // and return the number of error-severity issues. Shared by Validate + Save
        // so a faulty config is never persisted.
        const validateInto = (parsed = parseConfig(textarea.value)) => {
            const errs = parsed.issues.filter((i) => i.severity === 'error');
            const warns = parsed.issues.filter((i) => i.severity === 'warning');
            const count = parsed.rules.length;
            const active = parsed.rules.filter((r) => r.urlPattern.regex.test(location.href)).length;
            const summary =
                `${count} rule${count !== 1 ? 's' : ''}, ${parsed.lists.size} list${parsed.lists.size !== 1 ? 's' : ''}, ` +
                `${active} match${active !== 1 ? '' : 'es'} the current URL (${location.hostname})`;
            const shown = (errs.length ? errs : warns).slice(0, 2);
            const detail = shown.map((i) => (i.line ? `line ${i.line}: ` : '') + i.message).join('  •  ');
            statusLine.style.color = errs.length ? '#f14c4c' : warns.length ? '#d7ba7d' : '#4ec9b0';
            statusLine.textContent =
                `${errs.length} error${errs.length !== 1 ? 's' : ''}, ${warns.length} warning${warns.length !== 1 ? 's' : ''} — ${summary}.` +
                (detail ? `  (${detail}${(errs.length || warns.length) > 2 ? ', …' : ''})` : '');
            return errs.length;
        };

        btnValidate.addEventListener('click', () => validateInto());

        btnCancel.addEventListener('click', confirmClose);

        btnSave.addEventListener('click', async () => {
            if (validateInto() > 0) return; // errors → stay in the dialog, do not persist
            await GM.setValue(STORAGE_KEY, textarea.value);
            overlay.remove();
            await loadRules();
        });

        btnSaveReload.addEventListener('click', async () => {
            if (validateInto() > 0) return; // errors → stay in the dialog, do not persist
            await GM.setValue(STORAGE_KEY, textarea.value);
            location.reload();
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
            if (e.key === 'Escape') confirmClose();
        });

        btnRow.append(btnReset, btnValidate, btnCancel, btnSave, btnSaveReload);
        panel.append(header, hint, textarea, statusLine, btnRow);
        overlay.append(panel);
        (document.body ?? document.documentElement).append(overlay);
        textarea.focus();
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
                if (holdTimer || suspended) return;
                holdTimer = setTimeout(() => {
                    holdTimer = null;
                    setSuspended(true);
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
                setSuspended(false);
            } else if (tapCandidate && performance.now() - tapStart <= PEEK.tapMaxMs) {
                tapCandidate = false;
                // While the quick-add bar is open, bare taps of the commit key belong
                // to COMMIT_TAP — don't also toggle a peek on each tap.
                if (COMMIT_TAP.enabled && e.key === COMMIT_TAP.key && document.getElementById('ucb-quick-panel'))
                    return;
                setSuspended(!suspended);
                toast('Content Blur: effects ' + (suspended ? 'suspended (revealed)' : 'active'));
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
        if (PEEK.mode === 'hold') setSuspended(false);
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

    GM_registerMenuCommand(`⚙️ Content Blur Settings (${keyLabel(KEYS.openSettings)})`, openSettings);
    GM_registerMenuCommand(
        `➕ Quick-add: ${keyLabel(KEYS.quickAddSilent)} (silent) / ${keyLabel(KEYS.quickAddPanel)} (panel)`,
        quickAddPanel
    );
    GM_registerMenuCommand(`⛔ Quick-block into matching rule (${keyLabel(KEYS.quickBlock)})`, quickBlock);
    if (PEEK.enabled) {
        GM_registerMenuCommand(`👁️ Toggle reveal all — suspend effects (or hold ${PEEK.keys.join('/')})`, () =>
            setSuspended(!suspended)
        );
    }

    await loadRules();

    if (activeRules.length > 0 && !isCloudflareChallenge()) {
        ensureStyles();
        scan(document.body);
        startObserver();
        console.log(LOG_PREFIX, `active: ${activeRules.length} rule(s) match ${location.hostname}`);
    }
})();
