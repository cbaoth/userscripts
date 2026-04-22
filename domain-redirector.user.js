// ==UserScript==
// @name        Domain Redirector
// @namespace   https://github.com/cbaoth/userscripts
// @version     2026-04-21
// @description Redirect domains based on configurable mappings. Supports simple hostname rules and regex patterns on the full URL.
// @author      cbaoth235
// @license     MIT
//
// @match       *://*/*
//
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM_registerMenuCommand
//
// @run-at      document-start
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/domain-redirector.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/domain-redirector.user.js
// ==/UserScript==

(async function () {
    'use strict';

    const STORAGE_KEY = 'redirectMappings';

    // Format, one rule per line:
    //   Simple:  source.domain -> target.domain
    //            Replaces the hostname exactly; path, query, and hash are preserved.
    //   Regex:   /pattern/flags -> replacement
    //            Matches the full URL; use $1, $2 … to reference capture groups.
    //   Comment: Lines starting with # or //, and empty lines, are ignored.
    const DEFAULT_MAPPINGS = `\
# Simple hostname redirect (path, query, and hash are preserved):
#   source.domain -> target.domain
reddit.com -> old.reddit.com

# Regex redirect (matches full URL, use $1/$2/… for capture groups):
#   /pattern/flags -> replacement
# /^https?:\\/\\/(www\\.)?twitter\\.com(.*)/i -> https://nitter.net$2
`;

    /*** Rule parsing ***/

    function parseRules(text) {
        const result = [];
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
            const arrowIdx = trimmed.indexOf('->');
            if (arrowIdx === -1) continue;
            const src = trimmed.slice(0, arrowIdx).trim();
            const tgt = trimmed.slice(arrowIdx + 2).trim();
            if (!src || !tgt) continue;

            if (src.startsWith('/')) {
                const lastSlash = src.lastIndexOf('/');
                if (lastSlash > 0) {
                    try {
                        const regex = new RegExp(src.slice(1, lastSlash), src.slice(lastSlash + 1) || 'i');
                        result.push({ type: 'regex', regex, target: tgt });
                    } catch (e) {
                        console.warn('[domain-redirector] Invalid regex:', src, e.message);
                    }
                }
            } else {
                result.push({ type: 'host', source: src, target: tgt });
            }
        }
        return result;
    }

    let rules = [];

    async function loadRules() {
        const stored = await GM.getValue(STORAGE_KEY, null);
        rules = parseRules(stored ?? DEFAULT_MAPPINGS);
    }

    /*** Redirect ***/

    function applyRules() {
        const href = location.href;
        const hostname = location.hostname;

        for (const rule of rules) {
            let newHref;
            if (rule.type === 'regex') {
                newHref = href.replace(rule.regex, rule.target);
            } else if (hostname === rule.source) {
                newHref = href.replace(hostname, rule.target);
            }
            if (newHref && newHref !== href) {
                location.replace(newHref);
                return;
            }
        }
    }

    /*** Settings panel ***/

    function openSettings() {
        document.getElementById('domain-redirector-panel')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'domain-redirector-panel';
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
            width: '560px',
            maxWidth: '92vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
        });

        const title = document.createElement('h3');
        title.textContent = 'Domain Redirector — Mappings';
        Object.assign(title.style, { margin: '0 0 6px', color: '#fff', fontSize: '15px' });

        const hint = document.createElement('div');
        hint.innerHTML = `Format, one rule per line:
<ul style="list-style-position:inside;padding-left:0;margin:4px 0 0 0">
    <li>Simple: <code>source.domain -&gt; target.domain</code> — replaces hostname, preserves path/query/hash</li>
    <li>Regex: <code>/pattern/flags -&gt; replacement</code> — matches full URL, <code>$1</code>/<code>$2</code>/… for capture groups</li>
    <li>Comment: Lines starting with <code>#</code> or <code>//</code>, as well as empty lines, are ignored</li>
</ul>`;
        Object.assign(hint.style, { margin: '0 0 10px', color: '#888', fontSize: '11px' });

        const textarea = document.createElement('textarea');
        Object.assign(textarea.style, {
            width: '100%',
            height: '340px',
            background: '#252526',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '4px',
            padding: '8px',
            boxSizing: 'border-box',
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
        });

        GM.getValue(STORAGE_KEY, null).then((stored) => {
            textarea.value = stored ?? DEFAULT_MAPPINGS;
        });

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '12px',
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
        const btnCancel = makeBtn('Cancel', '#333', '#ccc');
        const btnSave = makeBtn('Save', '#1f6fad');
        const btnSaveReload = makeBtn('Save & Reload', '#0e639c');

        btnSave.title = 'Save — new rules apply on next navigation; current page is not re-evaluated';
        btnSaveReload.title = 'Save and reload — re-evaluates rules against the current page immediately';

        btnReset.addEventListener('click', () => {
            textarea.value = DEFAULT_MAPPINGS;
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

        btnRow.append(btnReset, btnCancel, btnSave, btnSaveReload);
        panel.append(title, hint, textarea, btnRow);
        overlay.append(panel);
        (document.body ?? document.documentElement).append(overlay);
        textarea.focus();
    }

    /*** Init ***/

    await loadRules();
    applyRules();

    GM_registerMenuCommand('Edit Redirect Mappings', openSettings);
})();
