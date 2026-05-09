// ==UserScript==
// @name        Universal Image Resizer
// @namespace   https://github.com/cbaoth/userscripts
// @version     2026-05-09T120000
// @description Resize images on configured sites by CSS selector. Supports per-URL rules, hover zoom, container-fix, and an element picker for easy rule creation.
// @author      cbaoth235
// @license     MIT
//
// @match       *://*/*
//
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM_registerMenuCommand
//
// @run-at      document-idle
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/universal-image-resizer.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/universal-image-resizer.user.js
// ==/UserScript==

(async function () {
    'use strict';
    /* eslint-disable no-console */

    const STORAGE_KEY = 'imageResizerRules';
    const PICKER_AUTO_OPEN_KEY = 'imageResizerPickerAutoOpen';
    const PICKER_DEPTH_KEY = 'imageResizerPickerDepth';
    const PICKER_DEPTH_DEFAULT = 5;
    const HOVER_CLASS = 'irr-hover';

    // Format, one rule per line, pipe-separated fields:
    //   url-pattern | css-selector | size | options | hover-size
    //
    // Fields 4 (options) and 5 (hover-size) are optional.
    // Use '-' for size to skip static resizing (hover-only rule; hover-size is then required).
    //
    // URL pattern:
    //   Glob:   *://example.com/path/*   (* matches any characters incl. /)
    //   Regex:  /pattern/flags           (matched against the full URL)
    //
    // CSS selector:
    //   Any CSS selector targeting <img> elements. Standard CSS as used in
    //   browser DevTools or uBlock cosmetic filters, e.g.:
    //     img                       all images
    //     .thumbnail img            images inside .thumbnail elements
    //     div.post img              images inside div.post
    //     a[href*="/full/"] img     images linked to URLs containing /full/
    //
    // Size  — aspect ratio is always preserved (or '-' to skip static resize):
    //   NNN%    scale to NNN% of the image's natural (intrinsic) size
    //   w:NNN   set display width to NNN px  (height scales automatically)
    //   h:NNN   set display height to NNN px (width scales automatically)
    //   le:NNN  longest edge = NNN px
    //   se:NNN  shortest edge = NNN px
    //
    // Options (optional 4th field, comma-separated):
    //   min:NNN        skip image if natural longest-edge < NNN px (skip icons/spacers)
    //   max:NNN        skip image if natural longest-edge > NNN px (skip full-size images)
    //   fix-container  loosen ancestor overflow:hidden clipping (always) and override
    //                  inline/attribute fixed dimensions on ancestor elements (opt-in)
    //
    // Hover-size (optional 5th field) — same syntax as size:
    //   Zooms matched images on hover; intentional visual overlap, layout stays intact.
    //   Can be combined with static resize or used alone (size = '-').
    //
    // Comments (# or //) and blank lines are ignored.
    const DEFAULT_RULES = `\
# Image Resizer — Rules
# One rule per line, pipe-separated fields:
#   url-pattern | css-selector | size | options | hover-size
#
# Fields 4 (options) and 5 (hover-size) are optional.
# Use '-' for size to skip static resizing (hover-only; hover-size then required).
#
# URL pattern:
#   Glob:   *://example.com/path/*   (* matches any characters incl. /)
#   Regex:  /pattern/flags           (matched against the full URL)
#
# CSS selector — any selector targeting <img> elements, e.g.:
#   img                       all images on the page
#   .thumbnail img            images inside .thumbnail elements
#   div.post img              images inside div.post
#   a[href*="/full/"] img     images whose parent link contains /full/
#
# Size  (aspect ratio always preserved, '-' = skip static resize):
#   NNN%    scale to NNN% of the image's natural (intrinsic) size
#   w:NNN   set display width to NNN px
#   h:NNN   set display height to NNN px
#   le:NNN  longest edge = NNN px
#   se:NNN  shortest edge = NNN px
#
# Options (optional 4th field, comma-separate multiple):
#   min:NNN        skip if natural longest edge < NNN px  (skip icons / spacers)
#   max:NNN        skip if natural longest edge > NNN px  (skip full-size images)
#   fix-container  loosen ancestor constraints to prevent clipping / layout breakage
#
# Hover-size (optional 5th field) — same syntax as size:
#   Images zoom to this size on hover; visual overlap is intentional.
#   Use alone with '-' size, or combine with a static resize.
#
# Comments (#, //) and blank lines are ignored.

# --- Examples (remove the leading # to enable) ---

# Upscale old-Reddit post thumbnails to 200 px width:
# *://old.reddit.com/* | a.thumbnail img | w:200

# Scale forum post images to 150% of their natural size; skip tiny images:
# *://forum.example.com/threads/* | div.post-content img | 150% | min:32

# Match gallery and album paths via regex; longest edge 400 px; skip small + huge:
# /https?:\\/\\/(www\\.)?example\\.com\\/(gallery|album)\\//i | img.photo | le:400 | min:50,max:2000

# Constrain oversized previews to 600 px longest edge (only affects images > 600 px):
# *://example.com/* | img.preview | le:600 | min:601

# Old HTML table gallery — resize thumbnails and fix container clipping:
# *://oldsite.example.com/gallery/* | td img | le:200 | min:32,fix-container

# Hover-only zoom — leave page layout intact, zoom in on hover:
# *://example.com/* | .thumb img | - | min:32 | le:600

# Static resize + further hover zoom:
# *://example.com/* | .thumb img | le:150 | min:32 | le:700
`;

    /*** Rule parsing ***/

    function parseUrlPattern(src) {
        if (src.startsWith('/')) {
            const lastSlash = src.lastIndexOf('/');
            if (lastSlash > 0) {
                try {
                    return { regex: new RegExp(src.slice(1, lastSlash), src.slice(lastSlash + 1) || 'i') };
                } catch (e) {
                    console.warn('[image-resizer] Invalid regex pattern:', src, e.message);
                    return null;
                }
            }
        }
        try {
            const escaped = src.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            return { regex: new RegExp('^' + escaped + '$', 'i') };
        } catch (e) {
            console.warn('[image-resizer] Invalid glob pattern:', src, e.message);
            return null;
        }
    }

    function parseSize(s) {
        const t = s.trim();
        if (t.endsWith('%')) {
            const v = parseFloat(t);
            if (!isNaN(v) && v > 0) return { mode: 'percent', value: v };
        } else if (/^w:\d+$/i.test(t)) {
            return { mode: 'width', value: parseInt(t.slice(2)) };
        } else if (/^h:\d+$/i.test(t)) {
            return { mode: 'height', value: parseInt(t.slice(2)) };
        } else if (/^le:\d+$/i.test(t)) {
            return { mode: 'longestEdge', value: parseInt(t.slice(3)) };
        } else if (/^se:\d+$/i.test(t)) {
            return { mode: 'shortestEdge', value: parseInt(t.slice(3)) };
        }
        return null;
    }

    // Parses the options field (field 4): filters + boolean flags.
    function parseOptions(s) {
        const result = { filters: [], fixContainer: false };
        if (!s || !s.trim()) return result;
        for (const token of s.split(',')) {
            const t = token.trim();
            if (!t) continue;
            if (/^min:\d+$/i.test(t)) result.filters.push({ type: 'min', value: parseInt(t.slice(4)) });
            else if (/^max:\d+$/i.test(t)) result.filters.push({ type: 'max', value: parseInt(t.slice(4)) });
            else if (t === 'fix-container') result.fixContainer = true;
            else console.warn('[image-resizer] Unknown option token:', t);
        }
        return result;
    }

    function parseRules(text) {
        const result = [];
        let lineNum = 0;
        for (const line of text.split('\n')) {
            lineNum++;
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

            const fields = trimmed.split('|').map((f) => f.trim());
            if (fields.length < 3) {
                console.warn(
                    `[image-resizer] Line ${lineNum}: expected at least 3 pipe-separated fields, got ${fields.length}:`,
                    trimmed
                );
                continue;
            }

            const [rawPattern, selector, rawSize] = fields;

            const urlPattern = parseUrlPattern(rawPattern);
            if (!urlPattern) continue;

            if (!selector) {
                console.warn(`[image-resizer] Line ${lineNum}: empty CSS selector`);
                continue;
            }

            const isNoop = rawSize === '-';
            const size = isNoop ? null : parseSize(rawSize);
            if (!isNoop && !size) {
                console.warn(
                    `[image-resizer] Line ${lineNum}: invalid size "${rawSize}" — expected e.g. le:250, w:300, 150%, or '-'`
                );
                continue;
            }

            const options = parseOptions(fields[3]);

            const hoverSize = fields[4] ? parseSize(fields[4]) : null;
            if (fields[4] && !hoverSize) {
                console.warn(`[image-resizer] Line ${lineNum}: invalid hover-size "${fields[4]}"`);
                continue;
            }

            if (!size && !hoverSize) {
                console.warn(`[image-resizer] Line ${lineNum}: '-' size requires a hover-size in field 5`);
                continue;
            }

            result.push({ urlPattern, selector, size, options, hoverSize });
        }
        return result;
    }

    let rules = [];

    async function loadRules() {
        const stored = await GM.getValue(STORAGE_KEY, null);
        rules = parseRules(stored ?? DEFAULT_RULES);
    }

    /*** URL matching ***/

    function urlMatchesRule(rule) {
        return rule.urlPattern.regex.test(location.href);
    }

    /*** Image resizing ***/

    function passesFilters(img, filters) {
        if (!filters || !filters.length) return true;
        const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
        for (const f of filters) {
            if (f.type === 'min' && longestEdge < f.value) return false;
            if (f.type === 'max' && longestEdge > f.value) return false;
        }
        return true;
    }

    // Set size-related inline styles on img given its natural dimensions.
    // Clears any site constraints (max-width etc.) first.
    function applySizeProps(img, nw, nh, size) {
        img.style.setProperty('max-width', 'none', 'important');
        img.style.setProperty('max-height', 'none', 'important');
        img.style.setProperty('min-width', '0', 'important');
        img.style.setProperty('min-height', '0', 'important');

        const { mode, value } = size;

        if (mode === 'percent') {
            img.style.setProperty('width', Math.round((nw * value) / 100) + 'px', 'important');
            img.style.setProperty('height', Math.round((nh * value) / 100) + 'px', 'important');
        } else if (mode === 'width') {
            img.style.setProperty('width', value + 'px', 'important');
            img.style.setProperty('height', 'auto', 'important');
        } else if (mode === 'height') {
            img.style.setProperty('height', value + 'px', 'important');
            img.style.setProperty('width', 'auto', 'important');
        } else if (mode === 'longestEdge') {
            if (nw >= nh) {
                img.style.setProperty('width', value + 'px', 'important');
                img.style.setProperty('height', 'auto', 'important');
            } else {
                img.style.setProperty('height', value + 'px', 'important');
                img.style.setProperty('width', 'auto', 'important');
            }
        } else if (mode === 'shortestEdge') {
            if (nw <= nh) {
                img.style.setProperty('width', value + 'px', 'important');
                img.style.setProperty('height', 'auto', 'important');
            } else {
                img.style.setProperty('height', value + 'px', 'important');
                img.style.setProperty('width', 'auto', 'important');
            }
        }
    }

    // Walk up ancestor chain and loosen layout constraints.
    // Option A (always): clear overflow:hidden so enlarged images aren't clipped.
    // Option B (fix-container): also override inline/attribute fixed dimensions.
    function looseAncestors(img, fixContainer) {
        let node = img.parentElement;
        let d = 0;
        while (node && node !== document.documentElement && d < 6) {
            const cs = window.getComputedStyle(node);
            if (cs.overflow === 'hidden') node.style.setProperty('overflow', 'visible', 'important');
            if (cs.overflowX === 'hidden') node.style.setProperty('overflow-x', 'visible', 'important');
            if (cs.overflowY === 'hidden') node.style.setProperty('overflow-y', 'visible', 'important');
            if (fixContainer) {
                // Clear inline styles and HTML attributes that impose fixed dimensions
                if (node.style.width || node.hasAttribute('width'))
                    node.style.setProperty('width', 'auto', 'important');
                if (node.style.height || node.hasAttribute('height'))
                    node.style.setProperty('height', 'auto', 'important');
                if (node.style.maxWidth) node.style.setProperty('max-width', 'none', 'important');
                if (node.style.maxHeight) node.style.setProperty('max-height', 'none', 'important');
            }
            node = node.parentElement;
            d++;
        }
    }

    function applyResize(img, size, fixContainer = false) {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) return;
        applySizeProps(img, nw, nh, size);
        looseAncestors(img, fixContainer);
    }

    // WeakMap<img, Set<rule>> — prevents scheduling the same img+rule pair twice
    const applied = new WeakMap();
    // WeakMap<img, rule[]> — hover rules registered for each img
    const hoverRules = new WeakMap();

    function scheduleResize(img, rule) {
        let ruleSet = applied.get(img);
        if (!ruleSet) {
            ruleSet = new Set();
            applied.set(img, ruleSet);
        }
        if (ruleSet.has(rule)) return;
        ruleSet.add(rule);

        // Register hover rule immediately (class added before image loads)
        if (rule.hoverSize) {
            let list = hoverRules.get(img);
            if (!list) {
                list = [];
                hoverRules.set(img, list);
            }
            if (!list.includes(rule)) {
                list.push(rule);
                img.classList.add(HOVER_CLASS);
            }
        }

        const doResize = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            if (!passesFilters(img, rule.options.filters)) return;
            if (rule.size) applyResize(img, rule.size, rule.options.fixContainer);
            else if (rule.options.fixContainer) looseAncestors(img, true);
        };

        if (img.complete && img.naturalWidth > 0) {
            doResize();
        } else {
            img.addEventListener('load', doResize, { once: true });
        }
    }

    function processImages(activeRules, root = document) {
        for (const rule of activeRules) {
            let targets;
            try {
                targets = root.querySelectorAll(rule.selector);
            } catch (e) {
                console.warn('[image-resizer] Invalid CSS selector:', rule.selector, e.message);
                continue;
            }
            for (const el of targets) {
                const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                if (img) scheduleResize(img, rule);
            }
        }
    }

    function observeMutations(activeRules) {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        const candidates = node.tagName === 'IMG' ? [node] : [...node.querySelectorAll('img')];
                        for (const img of candidates) {
                            for (const rule of activeRules) {
                                try {
                                    if (img.matches(rule.selector)) scheduleResize(img, rule);
                                } catch {
                                    /* invalid selector already warned */
                                }
                            }
                        }
                    }
                }
                if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
                    const img = mutation.target;
                    applied.delete(img);
                    for (const rule of activeRules) {
                        try {
                            if (img.matches(rule.selector)) scheduleResize(img, rule);
                        } catch {
                            /* invalid selector already warned */
                        }
                    }
                }
            }
        });
        observer.observe(document.body ?? document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
        });
    }

    /*** Hover zoom ***/

    function ensureHoverStyles() {
        if (document.getElementById('img-resizer-hover-style')) return;
        const style = document.createElement('style');
        style.id = 'img-resizer-hover-style';
        // position:relative establishes a stacking context so z-index works;
        // transition smooths the resize on mouseover/mouseout.
        style.textContent = `img.${HOVER_CLASS} { position: relative; transition: width 0.25s ease, height 0.25s ease; }`;
        (document.head ?? document.documentElement).appendChild(style);
    }

    function applyHoverResize(img, hoverSize) {
        const nw = img.naturalWidth,
            nh = img.naturalHeight;
        if (!nw || !nh) return;
        img.dataset.irrPreHover = img.style.cssText; // save for restore
        applySizeProps(img, nw, nh, hoverSize);
        img.style.setProperty('z-index', '9999', 'important');
        img.style.setProperty('position', 'relative', 'important');
    }

    function restoreHoverResize(img) {
        if (!('irrPreHover' in img.dataset)) return;
        img.style.cssText = img.dataset.irrPreHover;
        delete img.dataset.irrPreHover;
    }

    function setupHoverDelegation() {
        ensureHoverStyles();
        document.addEventListener(
            'mouseover',
            (e) => {
                const img = e.target;
                if (img.tagName !== 'IMG' || !img.classList.contains(HOVER_CLASS)) return;
                if ('irrPreHover' in img.dataset) return; // already zoomed
                const list = hoverRules.get(img);
                if (!list?.length) return;
                applyHoverResize(img, list[list.length - 1].hoverSize);
            },
            true
        );
        document.addEventListener(
            'mouseout',
            (e) => {
                const img = e.target;
                if (img.tagName !== 'IMG' || !img.classList.contains(HOVER_CLASS)) return;
                restoreHoverResize(img);
            },
            true
        );
    }

    /*** Element picker ***/

    // Classes that are too generic or layout-only to be useful in a selector.
    // Presence of only these on an element means we skip it and walk further up.
    const JUNK_CLASS_RE =
        /^(d-|col-|row$|container$|wrapper$|wrap$|clearfix$|active$|selected$|disabled$|hidden$|show$|hide$|open$|closed$|flex$|grid$|mt-|mb-|ml-|mr-|ms-|me-|pt-|pb-|pl-|pr-|ps-|pe-|p-|px-|py-|mx-|my-|m-|text-|bg-|border-|float-|w-|h-|fs-|fw-|lh-|align-|justify-|overflow-|position-|z-|gap-|g-|gy-|gx-|is-|js-|has-|no-)/i;

    function isUsefulClass(c) {
        return c.length >= 2 && !JUNK_CLASS_RE.test(c);
    }

    // Inject the outline preview <style> tag once
    function ensurePickerStyles() {
        if (document.getElementById('img-resizer-picker-style')) return;
        const style = document.createElement('style');
        style.id = 'img-resizer-picker-style';
        style.textContent =
            '[data-irp-preview]{outline:3px solid #f0a500!important;outline-offset:2px!important;border-radius:2px}';
        (document.head ?? document.documentElement).appendChild(style);
    }

    function setPreviewOutlines(selector) {
        clearPreviewOutlines();
        if (!selector) return;
        try {
            for (const el of document.querySelectorAll(selector)) {
                const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                if (img) img.setAttribute('data-irp-preview', '1');
            }
        } catch {
            /* invalid selector */
        }
    }

    function clearPreviewOutlines() {
        for (const el of document.querySelectorAll('[data-irp-preview]')) el.removeAttribute('data-irp-preview');
    }

    // Walk up from the clicked/touched element to find the nearest ancestor
    // that is an <img> or directly contains at least one <img>.
    function findPickTarget(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el && el !== document.documentElement) {
            if (el.tagName === 'IMG') return el;
            if (el.querySelector('img')) return el;
            el = el.parentElement;
        }
        return null;
    }

    // Generate an ordered list of CSS selector candidates for a picked element.
    // Returns [{selector, count}], most specific / most useful first.
    function generateCandidates(el, depth = PICKER_DEPTH_DEFAULT) {
        const isImg = el.tagName === 'IMG';
        const results = [];

        // Case: the img itself has useful classes → bare img.class selector
        if (isImg) {
            const good = [...el.classList].filter(isUsefulClass);
            if (good.length > 0) results.push('img.' + good.slice(0, 2).join('.'));
        }

        // Walk up the tree from the img's parent (or el itself if not img)
        let node = isImg ? el.parentElement : el;
        let d = 0;
        while (node && node !== document.documentElement && d < depth) {
            const tag = node.tagName.toLowerCase();

            // ID-based (most precise)
            if (node.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(node.id)) results.push(`#${node.id} img`);

            const good = [...node.classList].filter(isUsefulClass);
            if (good.length > 0) {
                const c1 = good[0];
                const c12 = good
                    .slice(0, 2)
                    .map((c) => '.' + c)
                    .join('');
                if (good.length >= 2) results.push(`${tag}${c12} img`); // tag.c1.c2 img
                results.push(`${tag}.${c1} img`); // tag.c1 img
                results.push(`.${c1} img`); // .c1 img (tag-agnostic)
            }

            node = node.parentElement;
            d++;
        }

        // Always offer bare img as last-resort fallback
        results.push('img');

        // Deduplicate, annotate with match counts, drop zero-matches
        const seen = new Set();
        return results
            .filter((s) => {
                if (seen.has(s)) return false;
                seen.add(s);
                return true;
            })
            .map((selector) => {
                let count = 0;
                try {
                    count = document.querySelectorAll(selector).length;
                } catch {}
                return { selector, count };
            })
            .filter((c) => c.count > 0);
    }

    // Build a compact HTML snippet of the picked element for the comment
    function elSnippet(el) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? ` id="${el.id}"` : '';
        const cls = el.classList.length ? ` class="${[...el.classList].slice(0, 4).join(' ')}"` : '';
        return `<${tag}${id}${cls}>`;
    }

    function startPicker() {
        // Clean up any leftover picker UI
        document.getElementById('img-resizer-picker-ui')?.remove();
        clearPreviewOutlines();
        ensurePickerStyles();

        // Instruction banner (pointer-events: none so it doesn't block clicks)
        const banner = document.createElement('div');
        banner.id = 'img-resizer-picker-ui';
        Object.assign(banner.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            zIndex: '2147483647',
            background: 'rgba(14,99,156,0.92)',
            color: '#fff',
            padding: '10px 16px',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            textAlign: 'center',
            pointerEvents: 'none',
            userSelect: 'none',
        });
        banner.textContent = '🎯 Click any thumbnail — Esc to cancel';
        document.documentElement.appendChild(banner);

        // Hover highlight box
        const hlBox = document.createElement('div');
        Object.assign(hlBox.style, {
            position: 'fixed',
            zIndex: '2147483646',
            pointerEvents: 'none',
            border: '2px solid #4ec9b0',
            background: 'rgba(78,201,176,0.08)',
            boxSizing: 'border-box',
            display: 'none',
        });
        document.documentElement.appendChild(hlBox);

        let currentTarget = null;

        function updateHighlight(x, y) {
            const target = findPickTarget(x, y);
            if (target === currentTarget) return;
            currentTarget = target;
            if (target) {
                const r = target.getBoundingClientRect();
                Object.assign(hlBox.style, {
                    display: 'block',
                    top: r.top + 'px',
                    left: r.left + 'px',
                    width: r.width + 'px',
                    height: r.height + 'px',
                });
            } else {
                hlBox.style.display = 'none';
            }
        }

        function cleanup() {
            banner.remove();
            hlBox.remove();
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('touchstart', onTouchStart, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKey, true);
        }

        function onMouseMove(e) {
            updateHighlight(e.clientX, e.clientY);
        }

        // touchstart sets currentTarget so it's available when click fires
        function onTouchStart(e) {
            const t = e.touches[0];
            if (t) updateHighlight(t.clientX, t.clientY);
        }

        function onClick(e) {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
            if (!currentTarget) return;
            showCandidatePanel(currentTarget);
        }

        function onKey(e) {
            if (e.key === 'Escape') cleanup();
        }

        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
    }

    async function showCandidatePanel(pickedEl) {
        const [autoOpen, savedDepth] = await Promise.all([
            GM.getValue(PICKER_AUTO_OPEN_KEY, true),
            GM.getValue(PICKER_DEPTH_KEY, PICKER_DEPTH_DEFAULT),
        ]);

        let currentDepth = savedDepth;
        let candidates = generateCandidates(pickedEl, currentDepth);
        let selectedIdx = 0;
        let rows = [];

        const panel = document.createElement('div');
        panel.id = 'img-resizer-picker-ui';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            zIndex: '2147483647',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '14px 16px 16px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.55)',
        });

        const ptitle = document.createElement('div');
        Object.assign(ptitle.style, { fontWeight: 'bold', color: '#fff', marginBottom: '8px', fontSize: '14px' });
        ptitle.textContent = '🎯 Select a selector — tap to preview outlines';

        // Scrollable candidate list
        const list = document.createElement('div');
        Object.assign(list.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '8px',
            maxHeight: 'min(240px, 35vh)',
            overflowY: 'auto',
        });

        function renderList(newCandidates) {
            candidates = newCandidates;
            // Default selection: first candidate in a thumbnail-like count range
            selectedIdx = 0;
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].count >= 1 && candidates[i].count <= 150) {
                    selectedIdx = i;
                    break;
                }
            }

            list.innerHTML = '';

            if (!candidates.length) {
                const empty = document.createElement('div');
                Object.assign(empty.style, { color: '#888', fontSize: '12px', padding: '6px 2px' });
                empty.textContent = 'No matching selectors found — try increasing depth.';
                list.appendChild(empty);
                clearPreviewOutlines();
                return;
            }

            rows = candidates.map((c, i) => {
                const row = document.createElement('div');
                Object.assign(row.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: i === selectedIdx ? '#0e639c' : '#2d2d2d',
                    border: i === selectedIdx ? '1px solid #4ec9b0' : '1px solid transparent',
                    userSelect: 'none',
                });

                const code = document.createElement('code');
                Object.assign(code.style, { flex: '1', fontSize: '12px', wordBreak: 'break-all', color: '#9cdcfe' });
                code.textContent = c.selector;

                const badge = document.createElement('span');
                Object.assign(badge.style, {
                    background: '#333',
                    color: '#888',
                    borderRadius: '10px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                });
                badge.textContent = `${c.count} img${c.count !== 1 ? 's' : ''}`;

                row.append(code, badge);
                row.addEventListener('click', () => {
                    selectedIdx = i;
                    rows.forEach((r, j) =>
                        Object.assign(r.style, {
                            background: j === i ? '#0e639c' : '#2d2d2d',
                            border: j === i ? '1px solid #4ec9b0' : '1px solid transparent',
                        })
                    );
                    setPreviewOutlines(c.selector);
                });

                list.appendChild(row);
                return row;
            });

            setPreviewOutlines(candidates[selectedIdx].selector);
        }

        renderList(candidates);

        // Picked element context (helps user tweak the selector without DevTools)
        const hint = document.createElement('div');
        Object.assign(hint.style, {
            fontSize: '11px',
            color: '#666',
            fontFamily: 'monospace',
            marginBottom: '8px',
            wordBreak: 'break-all',
        });
        hint.textContent = `Picked: ${elSnippet(pickedEl)}`;

        // Controls row: depth spinner + auto-open checkbox
        const controlsRow = document.createElement('div');
        Object.assign(controlsRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '10px',
            flexWrap: 'wrap',
        });

        const depthLabel = document.createElement('span');
        depthLabel.textContent = 'Depth:';
        depthLabel.title =
            'How many ancestor elements to walk up when generating CSS selector candidates. ' +
            'Increase if no suitable selector appears at the default depth (e.g. class is on a parent table or container).';
        Object.assign(depthLabel.style, { fontSize: '12px', color: '#888', cursor: 'help' });

        const depthDec = makeBtn('−', '#2d2d2d', '#ccc');
        Object.assign(depthDec.style, { padding: '3px 9px', fontSize: '13px' });

        const depthInput = document.createElement('input');
        depthInput.type = 'number';
        depthInput.min = 1;
        depthInput.max = 20;
        depthInput.value = currentDepth;
        Object.assign(depthInput.style, {
            width: '42px',
            background: '#2d2d2d',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '3px',
            padding: '3px 4px',
            fontSize: '12px',
            textAlign: 'center',
        });

        const depthInc = makeBtn('+', '#2d2d2d', '#ccc');
        Object.assign(depthInc.style, { padding: '3px 9px', fontSize: '13px' });

        function applyDepth(newDepth) {
            currentDepth = Math.max(1, Math.min(20, newDepth));
            depthInput.value = currentDepth;
            renderList(generateCandidates(pickedEl, currentDepth));
            GM.setValue(PICKER_DEPTH_KEY, currentDepth);
        }

        depthDec.addEventListener('click', () => applyDepth(currentDepth - 1));
        depthInc.addEventListener('click', () => applyDepth(currentDepth + 1));
        depthInput.addEventListener('change', () => applyDepth(parseInt(depthInput.value, 10) || PICKER_DEPTH_DEFAULT));

        // Auto-open checkbox (pushed to the right)
        const cbLabel = document.createElement('label');
        Object.assign(cbLabel.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#888',
            cursor: 'pointer',
            marginLeft: 'auto',
        });
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = autoOpen;
        cb.addEventListener('change', () => GM.setValue(PICKER_AUTO_OPEN_KEY, cb.checked));
        cbLabel.append(cb, 'Open settings after adding rule');

        controlsRow.append(depthLabel, depthDec, depthInput, depthInc, cbLabel);

        // Buttons
        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

        const btnCancel = makeBtn('Cancel', '#333', '#ccc');
        const btnAdd = makeBtn('Add Rule', '#0e639c');

        btnCancel.addEventListener('click', () => {
            panel.remove();
            clearPreviewOutlines();
        });

        btnAdd.addEventListener('click', async () => {
            panel.remove();
            clearPreviewOutlines();

            const chosen = candidates[selectedIdx];
            if (!chosen) return;
            const urlPat = `*://${location.hostname}/*`;
            const altLines = candidates
                .filter((_, i) => i !== selectedIdx)
                .map((c) => `# alt: ${c.selector} (${c.count} img${c.count !== 1 ? 's' : ''})`)
                .join('\n');

            const block = [
                `# [picker] ${elSnippet(pickedEl)} — ${chosen.count} img${chosen.count !== 1 ? 's' : ''} matched`,
                altLines,
                `# Adjust size, options (min/max/fix-container), and hover-size as needed`,
                `${urlPat} | ${chosen.selector} | le:250 | min:32`,
                '',
            ]
                .filter((l) => l !== null)
                .join('\n');

            const stored = await GM.getValue(STORAGE_KEY, null);
            await GM.setValue(STORAGE_KEY, (stored ?? DEFAULT_RULES).trimEnd() + '\n\n' + block);
            await loadRules();

            if (cb.checked) openSettings();
        });

        btnRow.append(btnCancel, btnAdd);
        panel.append(ptitle, list, hint, controlsRow, btnRow);
        document.documentElement.appendChild(panel);
    }

    /*** Settings panel ***/

    function openSettings() {
        document.getElementById('image-resizer-settings')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'image-resizer-settings';
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
            width: '680px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
        });

        const title = document.createElement('h3');
        title.textContent = 'Image Resizer — Rules';
        Object.assign(title.style, { margin: '0 0 6px', color: '#fff', fontSize: '15px' });

        const hint = document.createElement('div');
        hint.innerHTML = `Format, one rule per line, pipe-separated fields:
<br><code style="font-size:11px;color:#9cdcfe">url-pattern | css-selector | size | options | hover-size</code>
<table style="border-collapse:collapse;width:100%;font-size:11px;color:#aaa;margin-top:6px">
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">URL pattern</b></td>
    <td>Glob <code>*://host/path/*</code> (<code>*</code> matches anything incl. <code>/</code>), or regex <code>/pattern/flags</code></td>
  </tr>
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">CSS selector</b></td>
    <td>Any CSS selector targeting <code>&lt;img&gt;</code>, e.g. <code>div.thumb img</code> · <code>.post img</code> · <code>img</code></td>
  </tr>
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">Size</b></td>
    <td><code>NNN%</code> · <code>w:NNN</code> · <code>h:NNN</code> · <code>le:NNN</code> (longest edge) · <code>se:NNN</code> (shortest edge) · <code>-</code> (skip, use with hover-size)</td>
  </tr>
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">Options</b></td>
    <td>Optional. <code>min:NNN</code> skip if longest edge &lt; NNN px · <code>max:NNN</code> skip if &gt; NNN px · <code>fix-container</code> loosen ancestor overflow/dimensions · comma-separate multiple</td>
  </tr>
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">Hover-size</b></td>
    <td>Optional. Same syntax as size. Images zoom to this size on hover (intentional overlap, layout intact). Combine with static size or use alone (<code>-</code>).</td>
  </tr>
</table>`;
        Object.assign(hint.style, { margin: '0 0 10px', color: '#888', fontSize: '11px' });

        const textarea = document.createElement('textarea');
        Object.assign(textarea.style, {
            width: '100%',
            height: '380px',
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
            // Scroll to bottom so newly picker-added rules are visible
            textarea.scrollTop = textarea.scrollHeight;
        });

        const isDirty = () => textarea.value !== savedValue;
        const confirmClose = () => {
            if (isDirty() && !confirm('Discard unsaved changes to resize rules?')) return;
            overlay.remove();
        };

        const statusLine = document.createElement('div');
        Object.assign(statusLine.style, {
            marginTop: '6px',
            fontSize: '11px',
            color: '#888',
            minHeight: '16px',
        });

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            justifyContent: 'flex-end',
        });

        const btnReset = makeBtn('Reset to Default', '#444', '#ccc');
        const btnValidate = makeBtn('Validate', '#3a3a3a', '#9cdcfe');
        const btnCancel = makeBtn('Cancel', '#333', '#ccc');
        const btnSave = makeBtn('Save', '#1f6fad');
        const btnSaveReload = makeBtn('Save & Reload', '#0e639c');

        btnSave.title = 'Save — rules apply on the next page load; current page is not re-evaluated';
        btnSaveReload.title = 'Save and reload — immediately re-evaluates rules on the current page';

        btnReset.addEventListener('click', () => {
            textarea.value = DEFAULT_RULES;
            statusLine.textContent = '';
        });

        btnValidate.addEventListener('click', () => {
            const parsed = parseRules(textarea.value);
            const count = parsed.length;
            const active = parsed.filter((r) => r.urlPattern.regex.test(location.href)).length;
            statusLine.style.color = count === 0 ? '#f14c4c' : '#4ec9b0';
            statusLine.textContent =
                count === 0
                    ? 'No valid rules found.'
                    : `${count} valid rule${count !== 1 ? 's' : ''} — ` +
                      `${active} match${active !== 1 ? '' : 'es'} the current URL (${location.hostname}).`;
        });

        btnCancel.addEventListener('click', confirmClose);

        btnSave.addEventListener('click', async () => {
            await GM.setValue(STORAGE_KEY, textarea.value);
            overlay.remove();
            await loadRules();
        });

        btnSaveReload.addEventListener('click', async () => {
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

    /*** Shared UI helper ***/

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

    /*** Init ***/

    await loadRules();

    const activeRules = rules.filter(urlMatchesRule);
    if (activeRules.length > 0) {
        processImages(activeRules);
        observeMutations(activeRules);
    }
    if (activeRules.some((r) => r.hoverSize)) setupHoverDelegation();

    GM_registerMenuCommand('🎯 Pick Element', startPicker);
    GM_registerMenuCommand('⚙️ Edit Resize Rules', openSettings);
})();
