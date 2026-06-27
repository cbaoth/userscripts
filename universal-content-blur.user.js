// ==UserScript==
// @name         Universal Content Blur
// @namespace    https://github.com/cbaoth/userscripts
// @version      2026-06-27
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
// @updateURL    https://github.com/cbaoth/userscripts/raw/master/universal-content-blur.user.js
// ==/UserScript==

(async function () {
    'use strict';
    /* eslint-disable no-console */

    // -----------------------------------------------------------------------
    //  CONFIG (constants — tweak to taste)
    // -----------------------------------------------------------------------

    const STORAGE_KEY = 'contentBlurRules';
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

    // -----------------------------------------------------------------------
    //  DEFERRED IDEAS (not implemented in v1 — revisit if blur is insufficient)
    // -----------------------------------------------------------------------
    //  Additional actions (currently only `blur` is implemented):
    //    hide        — display:none (hard hide, removes from layout)
    //    dim         — low opacity (keeps layout, gentler than blur)
    //    pixelate    — stronger obscuring for images (canvas/SVG filter)
    //  Other ideas:
    //    pointer-events:none on blurred content to block accidental clicks
    //      (opt-in only — it contributed to breakage in the script this replaces)
    //    Cross-row blur: when a result spans several sibling rows (old <table>
    //      galleries), blur both the title row AND the username row if either
    //      triggers. Needs a "neighbor"/sibling-group scope; too complex for v1.
    //    Match commented-out HTML (e.g. <!-- ... alt="..." -->) — niche; skipped.

    // -----------------------------------------------------------------------
    //  DEFAULT CONFIG (also serves as inline documentation)
    // -----------------------------------------------------------------------

    const DEFAULT_RULES = `\
# Universal Content Blur — configuration
#
# Two kinds of sections:
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
#   [rules]       one rule per line, pipe-separated:
#                     url-pattern | source | patterns | action | scope | options
#
# Lines starting with # or // and blank lines are ignored.
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
#                 word        literal, WHOLE-WORD match (auto-escaped): "test"
#                             matches "test" but not "tested". Spaces allowed
#                             ("foo bar"). Wildcards: * = any run, ? = one char;
#                             write \\* or \\? for a literal * or ?.
#                 /regex/i    raw regex (flags optional); matches as a SUBSTRING
#                             (also inside words). Add \\b...\\b for whole-word,
#                             or ^...$ for a full-value match. Use for alternation
#                             etc. (For a plain word, bare text is simpler.)
#               NOTE: inside a rule line, | is the field separator, so a /regex/
#               token must NOT contain | . For alternatives use commas (foo,bar)
#               or put a full regex (incl. |) in a [list:NAME] block.
#
# action        blur   (only action implemented in v1)
#
# scope         Which element gets blurred, relative to the match:
#                 self            the matched element (text → its parent element)
#                 up:N            climb N ancestor elements (e.g. up:2)
#                 closest:SEL     nearest ancestor matching CSS selector SEL
#                 row             alias for closest:tr (old table layouts)
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
# [rules]
# # blur the whole table row of a flagged username on one site:
# *://site.com/*   | user          | @users             | blur | row        | hover
# # blur any visible text containing a @words_violent word, anywhere, reveal on hover:
# *://*/*          | text          | @words_violent     | blur | self       | hover
# # blur image + caption when alt/title or filename matches, on all sites,
# # using a wildcard directly in the rule's patterns field:
# *://*/*          | alt,title,url | @words_*           | blur | up:1       | hover

[rules]
`;

    // -----------------------------------------------------------------------
    //  SHARED HELPERS
    // -----------------------------------------------------------------------

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    // Convert literal text to a regex fragment: escape regex specials, support
    // simplified wildcards (* = any run, ? = one char; \* \? \\ are literals), and
    // add \b word boundaries where an edge is a word char. So "test" matches only
    // the whole word "test", "foo bar" matches that phrase, "te*st" is wildcarded.
    function literalToFragment(text) {
        let body = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '\\' && (text[i + 1] === '*' || text[i + 1] === '?' || text[i + 1] === '\\')) {
                body += escapeRegExp(text[i + 1]); // literal *, ?, or \
                i++;
            } else if (c === '*') {
                body += '.*';
            } else if (c === '?') {
                body += '.';
            } else {
                body += escapeRegExp(c);
            }
        }
        // Boundary only where the matched edge is a literal word char (not a wildcard).
        const first = text[0];
        const last = text[text.length - 1];
        const lead = first !== '*' && first !== '?' && first !== '\\' && isWordChar(first) ? '\\b' : '';
        const tail = last !== '*' && last !== '?' && isWordChar(last) ? '\\b' : '';
        return lead + body + tail;
    }

    // A single regex *fragment* from one pattern token (@ref expanded by the
    // caller). /regex/ is used verbatim; anything else is literal whole-word text.
    function patternTokenToFragment(token) {
        const t = token.trim();
        if (!t) return null;
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

    function parseScope(field, issues, lineNum) {
        const t = (field || 'self').trim();
        if (!t || t === 'self') return { kind: 'self' };
        if (t === 'row') return { kind: 'closest', selector: 'tr' };
        if (/^up:\d+$/i.test(t)) return { kind: 'up', n: parseInt(t.slice(3), 10) };
        if (/^closest:/i.test(t)) {
            const selector = t.slice(8).trim();
            if (selector) return { kind: 'closest', selector };
        }
        reportIssue(issues, lineNum, 'warning', `unknown scope "${t}", using self`);
        return { kind: 'self' };
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

    // Parse the whole config into { lists, rules, issues }. `issues` collects
    // structured problems (errors block save; warnings are advisory).
    function parseConfig(text) {
        const lists = new Map();
        const rules = [];
        const issues = [];
        let section = null; // { type:'list', name } | { type:'rules' }
        let lineNum = 0;

        for (const rawLine of text.split('\n')) {
            lineNum++;
            const line = rawLine.trim();
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            const listHeader = line.match(/^\[list:([^\]]+)\]$/i);
            if (listHeader) {
                const name = listHeader[1].trim().toLowerCase();
                if (!lists.has(name)) lists.set(name, []);
                section = { type: 'list', name };
                continue;
            }
            if (/^\[rules\]$/i.test(line)) {
                section = { type: 'rules' };
                continue;
            }

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

        return { lists, rules, issues };
    }

    function parseRuleLine(line, lineNum, lists, issues) {
        const fields = line.split('|').map((f) => f.trim());
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

        const action = (rawAction || 'blur').trim().toLowerCase();
        if (action !== 'blur') {
            reportIssue(issues, lineNum, 'error', `action "${action}" not implemented (v1 = blur)`);
            return null;
        }

        const options = parseOptions(rawOptions, issues, lineNum);

        // Resolve patterns: @ref → (possibly nested/wildcard) list fragments, else
        // inline token. seenFragments deduplicates across all refs + inline tokens so
        // overlapping lists (e.g. @dark and @text_* both yielding "gore") produce only
        // one regex branch — unique by fragment string, not semantic equivalence.
        const fragments = [];
        const seenFragments = new Set();
        for (const tok of rawPatterns.split(',')) {
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
        return { urlPattern, sources, regex, action, scope, options };
    }

    // -----------------------------------------------------------------------
    //  RULE STATE
    // -----------------------------------------------------------------------

    let rules = [];
    let activeRules = [];

    async function loadRules() {
        const stored = await GM.getValue(STORAGE_KEY, null);
        rules = parseConfig(stored ?? DEFAULT_RULES).rules;
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
        style.textContent = `
.${BLUR_CLASS} { filter: blur(${BLUR_STRENGTH_PX}px) !important; transition: filter 0.2s ease; }
.${BLUR_CLASS}.${HOVER_CLASS}:hover { filter: none !important; }
.${FREEZE_CLASS}, .${FREEZE_CLASS} * { animation-play-state: paused !important; }
.${FREEZE_CLASS}.${HOVER_CLASS}:hover, .${FREEZE_CLASS}.${HOVER_CLASS}:hover * { animation-play-state: running !important; }
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

    function blurTarget(matchedEl, rule) {
        const target = resolveTarget(matchedEl, rule.scope);
        if (!target || processed.has(target)) return;
        // Never blur structural roots.
        if (target === document.body || target === document.documentElement) return;
        processed.add(target);
        target.classList.add(BLUR_CLASS);
        if (rule.options.hover) target.classList.add(HOVER_CLASS);
        if (rule.options.freeze) freezeMedia(target);
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
                if (rule.regex.test(text)) blurTarget(el, rule);
            }
        }
    }

    function scanAttributes(root, attrRules) {
        if (!attrRules.length) return;
        // Gather candidate elements once; cheaper than per-rule querySelectorAll.
        const els =
            root.querySelectorAll === undefined ? [] : root.querySelectorAll('a[href], img[src], [alt], [title]');
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
                        blurTarget(el, rule);
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

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(() => {
            if (isCloudflareChallenge()) {
                observer.disconnect();
                return;
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => scan(document.body), SCAN_DEBOUNCE_MS);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // -----------------------------------------------------------------------
    //  QUICK-ADD (keyboard-driven rule capture)
    // -----------------------------------------------------------------------

    let lastHoveredLink = null;
    document.addEventListener(
        'mouseover',
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

    // Figure out what to capture: selected text wins, else hovered link.
    function captureContext() {
        const sel = window.getSelection ? String(window.getSelection()).trim() : '';
        if (sel) {
            return { source: 'text', pattern: escapeRegExp(sel), label: sel };
        }
        if (lastHoveredLink) {
            const href = lastHoveredLink.getAttribute('href') || '';
            const abs = lastHoveredLink.href || href;
            const users = extractUsernames(abs);
            if (users.length) {
                return { source: 'user', pattern: escapeRegExp(users[0]), label: users[0] };
            }
            return { source: 'url', pattern: escapeRegExp(href), label: href };
        }
        return null;
    }

    // Canonical written forms for a captured pattern. Usernames are anchored
    // (/^name$/) so e.g. "bob" doesn't also blur "bobby"; other sources stay
    // substring matches (you usually want a word found anywhere in the text).
    function patternToken(ctx) {
        return ctx.source === 'user' ? `/^${ctx.pattern}$/` : `/${ctx.pattern}/`;
    }
    function listEntry(ctx) {
        return ctx.source === 'user' ? `/^${ctx.pattern}$/` : ctx.pattern;
    }

    function buildRuleLine(ctx, scope, options) {
        const urlPat = `*://${location.hostname}/*`;
        const opt = options.length ? options.join(',') : 'hover';
        return `${urlPat} | ${ctx.source} | ${patternToken(ctx)} | blur | ${scope} | ${opt}`;
    }

    async function appendRuleLine(ruleLine) {
        const stored = (await GM.getValue(STORAGE_KEY, null)) ?? DEFAULT_RULES;
        let next = stored.trimEnd();
        if (!/\[rules\]/i.test(next)) next += '\n\n[rules]';
        next += '\n' + ruleLine + '\n';
        await GM.setValue(STORAGE_KEY, next);
        await loadRules();
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
        await appendRuleLine(buildRuleLine(ctx, 'self', ['hover']));
        scan(document.body);
        if (activeRules.length > 0) startObserver(); // apply immediately on this page
    }

    async function quickAddSilent() {
        const ctx = captureContext();
        if (!ctx) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        await addNewRuleFromContext(ctx);
        toast(`Content Blur: added rule for "${truncate(ctx.label, 40)}"`);
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
            await addNewRuleFromContext(ctx);
            toast(`Content Blur: no matching rule — created one for "${truncate(ctx.label, 40)}"`);
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

    // Returns { text, changed, message } when a matching rule was found (text is the
    // updated config), or null when no rule matches (caller creates a new one).
    function addPatternToMatchingRule(text, ctx) {
        const lines = text.split('\n');
        const listBlocks = new Map(); // name -> { headerIdx, lastEntryIdx }
        let section = null;
        let matchIdx = -1;
        let matchFields = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

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
            if (section && section.type === 'list') {
                listBlocks.get(section.name).lastEntryIdx = i;
                continue;
            }
            // Rule candidate — remember the first one matching source type + URL.
            if (matchIdx === -1 && (line.includes('|') || (section && section.type === 'rules'))) {
                const fields = line.split('|').map((f) => f.trim());
                if (fields.length >= 4) {
                    const up = parseUrlPattern(fields[0]);
                    if (up && up.regex.test(location.href) && parseSource(fields[1]).includes(ctx.source)) {
                        matchIdx = i;
                        matchFields = fields;
                    }
                }
            }
        }

        if (matchIdx === -1) return null;

        const newEntry = listEntry(ctx); // usernames anchored as /^name$/, others bare
        const tokens = matchFields[2]
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        const listRef = tokens.find((t) => t.startsWith('@'));

        // Prefer adding to the first referenced list (clean + reusable).
        if (listRef) {
            const name = listRef.slice(1).toLowerCase();
            const block = listBlocks.get(name);
            if (block) {
                for (let i = block.headerIdx + 1; i <= block.lastEntryIdx; i++) {
                    if (lines[i].trim() === newEntry) {
                        return { changed: false, message: `"${truncate(ctx.label, 40)}" already in list @${name}` };
                    }
                }
                lines.splice(block.lastEntryIdx + 1, 0, newEntry);
                return {
                    text: lines.join('\n'),
                    changed: true,
                    message: `added "${truncate(ctx.label, 40)}" to list @${name}`,
                };
            }
            // referenced list is not defined anywhere — fall through to inline append
        }

        // No usable list — append inline as a comma token to the patterns field.
        const token = patternToken(ctx);
        if (tokens.includes(token)) {
            return { changed: false, message: `"${truncate(ctx.label, 40)}" already in the matching rule` };
        }
        matchFields[2] = matchFields[2] + ', ' + token;
        lines[matchIdx] = matchFields.join(' | ');
        return {
            text: lines.join('\n'),
            changed: true,
            message: `added "${truncate(ctx.label, 40)}" to the matching rule`,
        };
    }

    function truncate(s, n) {
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    // -----------------------------------------------------------------------
    //  QUICK-ADD PANEL (KEYS.quickAddPanel)
    // -----------------------------------------------------------------------

    function quickAddPanel() {
        const ctx = captureContext();
        if (!ctx) {
            toast('Content Blur: select text or hover a link first', false);
            return;
        }
        document.getElementById('ucb-quick-panel')?.remove();

        const panel = document.createElement('div');
        panel.id = 'ucb-quick-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            zIndex: '2147483647',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '14px 16px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.55)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'flex-end',
        });

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

        const patternInput = document.createElement('input');
        patternInput.type = 'text';
        patternInput.value = ctx.pattern;
        Object.assign(patternInput.style, inputStyle, { minWidth: '240px', flex: '1' });

        const sourceSel = document.createElement('select');
        for (const s of VALID_SOURCES) {
            const o = document.createElement('option');
            o.value = o.textContent = s;
            if (s === ctx.source) o.selected = true;
            sourceSel.appendChild(o);
        }
        Object.assign(sourceSel.style, inputStyle);

        const scopeSel = document.createElement('select');
        for (const s of ['self', 'up:1', 'up:2', 'up:3', 'row', 'closest:.comment', 'closest:article']) {
            const o = document.createElement('option');
            o.value = o.textContent = s;
            scopeSel.appendChild(o);
        }
        Object.assign(scopeSel.style, inputStyle);

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

        const addBtn = makeBtn('Add & apply', '#0e639c');
        const cancelBtn = makeBtn('Cancel', '#333', '#ccc');

        cancelBtn.addEventListener('click', () => panel.remove());
        addBtn.addEventListener('click', async () => {
            const pattern = patternInput.value.trim();
            if (!pattern) {
                toast('Content Blur: pattern is empty', false);
                return;
            }
            panel.remove();
            const line = buildRuleLine(
                { source: sourceSel.value, pattern },
                scopeSel.value,
                hoverCb.checked ? ['hover'] : ['no-hover']
            );
            await appendRuleLine(line);
            scan(document.body);
            toast('Content Blur: rule added');
        });

        panel.append(
            field('pattern (regex)', patternInput),
            field('source', sourceSel),
            field('scope', scopeSel),
            hoverLabel,
            addBtn,
            cancelBtn
        );
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
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
        });

        const title = document.createElement('h3');
        title.textContent = 'Universal Content Blur — Rules';
        Object.assign(title.style, { margin: '0 0 6px', color: '#fff', fontSize: '15px' });

        const hint = document.createElement('div');
        hint.innerHTML =
            'One rule per line: ' +
            '<code style="color:#9cdcfe">url-pattern | source | patterns | action | scope | options</code>. ' +
            'Define reusable lists with <code style="color:#9cdcfe">[list:NAME]</code> and reference them as ' +
            '<code style="color:#9cdcfe">@NAME</code> or <code style="color:#9cdcfe">@glob*</code> — lists ' +
            'may reference other lists (including wildcards) to compose categories. ' +
            'Sources: text, alt, title, url, user. Scope: self, up:N, ' +
            'closest:SEL, row. See the comments in the default config for full docs.';
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

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) confirmClose();
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') confirmClose();
        });

        btnRow.append(btnReset, btnValidate, btnCancel, btnSave, btnSaveReload);
        panel.append(title, hint, textarea, statusLine, btnRow);
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
        if (isEditableTarget(e.target)) return;
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

    // -----------------------------------------------------------------------
    //  INIT
    // -----------------------------------------------------------------------

    GM_registerMenuCommand(`⚙️ Content Blur Settings (${keyLabel(KEYS.openSettings)})`, openSettings);
    GM_registerMenuCommand(
        `➕ Quick-add: ${keyLabel(KEYS.quickAddSilent)} (silent) / ${keyLabel(KEYS.quickAddPanel)} (panel)`,
        quickAddPanel
    );
    GM_registerMenuCommand(`⛔ Quick-block into matching rule (${keyLabel(KEYS.quickBlock)})`, quickBlock);

    await loadRules();

    if (activeRules.length > 0 && !isCloudflareChallenge()) {
        ensureStyles();
        scan(document.body);
        startObserver();
        console.log(LOG_PREFIX, `active: ${activeRules.length} rule(s) match ${location.hostname}`);
    }
})();
