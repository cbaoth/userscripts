// ==UserScript==
// @name        Universal Image Resizer
// @namespace   https://github.com/cbaoth/userscripts
// @version     2026-05-06
// @description Resize images on configured sites by CSS selector. Supports per-URL rules with aspect-ratio-preserving modes: %, width, height, longest-edge, shortest-edge.
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

    const STORAGE_KEY = 'imageResizerRules';

    // Format, one rule per line, pipe-separated fields:
    //   url-pattern | css-selector | size [| filter[,filter…]]
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
    // Size  — aspect ratio is always preserved:
    //   NNN%    scale to NNN% of the image's natural (intrinsic) size
    //   w:NNN   set display width to NNN px  (height scales automatically)
    //   h:NNN   set display height to NNN px (width scales automatically)
    //   le:NNN  longest edge = NNN px
    //   se:NNN  shortest edge = NNN px
    //
    // Filter (optional 4th field, comma-separated if multiple):
    //   min:NNN  skip image if natural longest-edge < NNN px (skip icons/spacers)
    //   max:NNN  skip image if natural longest-edge > NNN px (skip full-size images)
    //
    // Comments (# or //) and blank lines are ignored.
    const DEFAULT_RULES = `\
# Image Resizer — Rules
# One rule per line, pipe-separated fields:
#   url-pattern | css-selector | size [| filter[,filter…]]
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
# Size  (aspect ratio is always preserved):
#   NNN%    scale to NNN% of the image's natural (intrinsic) size
#   w:NNN   set display width to NNN px
#   h:NNN   set display height to NNN px
#   le:NNN  longest edge = NNN px
#   se:NNN  shortest edge = NNN px
#
# Filter (optional 4th field, comma-separate multiple):
#   min:NNN  skip if natural longest edge < NNN px  (skip icons / spacers)
#   max:NNN  skip if natural longest edge > NNN px  (skip full-size images)
#
# Comments (#, //) and blank lines are ignored.

# --- Examples (remove the leading # to enable) ---

# Upscale old-Reddit post thumbnails to 200 px width:
# *://old.reddit.com/* | a.thumbnail img | w:200

# Scale forum post images to 150% of their natural size; skip tiny images:
# *://forum.example.com/threads/* | div.post-content img | 150% | min:32

# Match gallery and album paths via regex; longest edge 400 px; skip small + huge:
# /https?:\\/\\/(www\\.)?example\\.com\\/(gallery|album)\\//i | img.photo | le:400 | min:50,max:2000

# Constrain oversized preview images to 600 px longest edge (only affects images > 600 px):
# *://example.com/* | img.preview | le:600 | min:601
`;

    /*** Rule parsing ***/

    function parseUrlPattern(src) {
        // Regex rule: /pattern/flags
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
        // Glob rule: escape regex special chars, then * → .*
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

    function parseFilters(s) {
        if (!s || !s.trim()) return [];
        return s.split(',').flatMap((token) => {
            const t = token.trim();
            if (/^min:\d+$/i.test(t)) return [{ type: 'min', value: parseInt(t.slice(4)) }];
            if (/^max:\d+$/i.test(t)) return [{ type: 'max', value: parseInt(t.slice(4)) }];
            console.warn('[image-resizer] Unknown filter token:', t);
            return [];
        });
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

            const [rawPattern, selector, rawSize, rawFilter] = fields;

            const urlPattern = parseUrlPattern(rawPattern);
            if (!urlPattern) continue;

            if (!selector) {
                console.warn(`[image-resizer] Line ${lineNum}: empty CSS selector`);
                continue;
            }

            const size = parseSize(rawSize);
            if (!size) {
                console.warn(
                    `[image-resizer] Line ${lineNum}: invalid size spec "${rawSize}" — expected e.g. le:250, w:300, 150%`
                );
                continue;
            }

            const filters = parseFilters(rawFilter);

            result.push({ urlPattern, selector, size, filters });
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

    function applyResize(img, size) {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) return; // image not loaded or broken

        // Remove constraining CSS the page may have applied
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

    // WeakMap<img, Set<rule>> — prevents scheduling the same img+rule pair twice
    const applied = new WeakMap();

    function scheduleResize(img, rule) {
        let ruleSet = applied.get(img);
        if (!ruleSet) {
            ruleSet = new Set();
            applied.set(img, ruleSet);
        }
        if (ruleSet.has(rule)) return;
        ruleSet.add(rule);

        const doResize = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            if (!passesFilters(img, rule.filters)) return;
            applyResize(img, rule.size);
        };

        if (img.complete && img.naturalWidth > 0) {
            doResize();
        } else {
            img.addEventListener('load', doResize, { once: true });
        }
    }

    // Process all images in `root` against the active rules
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
                // Selector may target an <img> directly or a wrapper containing one
                const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                if (img) scheduleResize(img, rule);
            }
        }
    }

    // Watch for dynamically added images and lazy src changes
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
                                    /* invalid selector already warned during initial pass */
                                }
                            }
                        }
                    }
                }
                // src set on an already-present img (lazy-loading via JS)
                if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
                    const img = mutation.target;
                    applied.delete(img); // allow fresh resize after src change
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

    /*** Settings panel ***/

    function openSettings() {
        document.getElementById('image-resizer-panel')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'image-resizer-panel';
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
<br><code style="font-size:11px;color:#9cdcfe">url-pattern | css-selector | size [| filter[,filter…]]</code>
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
    <td><code>NNN%</code> · <code>w:NNN</code> · <code>h:NNN</code> · <code>le:NNN</code> (longest edge) · <code>se:NNN</code> (shortest edge) — aspect ratio always preserved</td>
  </tr>
  <tr>
    <td style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top"><b style="color:#ccc">Filter</b></td>
    <td>Optional. <code>min:NNN</code> skip if natural longest edge &lt; NNN px · <code>max:NNN</code> skip if &gt; NNN px · comma-separate multiple</td>
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

        GM.getValue(STORAGE_KEY, null).then((stored) => {
            textarea.value = stored ?? DEFAULT_RULES;
        });

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

        function makeBtn(label, bg, color = '#fff') {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: '6px 14px',
                background: bg,
                color,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
            });
            return btn;
        }

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

        btnCancel.addEventListener('click', () => overlay.remove());

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
            if (e.target === overlay) overlay.remove();
        });

        btnRow.append(btnReset, btnValidate, btnCancel, btnSave, btnSaveReload);
        panel.append(title, hint, textarea, statusLine, btnRow);
        overlay.append(panel);
        (document.body ?? document.documentElement).append(overlay);
        textarea.focus();
    }

    /*** Init ***/

    await loadRules();

    const activeRules = rules.filter(urlMatchesRule);
    if (activeRules.length > 0) {
        processImages(activeRules);
        observeMutations(activeRules);
    }

    GM_registerMenuCommand('Edit Image Resize Rules', openSettings);
})();
