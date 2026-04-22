// ==UserScript==
// @name        Emoji Replacer
// @namespace   https://github.com/cbaoth/userscripts
// @version     2026-04-21
// @description Replace emojis with customizable alternatives (e.g. less triggering, more neutral).
// @author      cbaoth235
// @license     MIT
//
// @match       *://*/*
//
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM_registerMenuCommand
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/emoji-replacer.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/emoji-replacer.user.js
// ==/UserScript==

(async function () {
    'use strict';

    const STORAGE_KEY = 'emojiMappings';

    // Format, one entry per line:
    // Mapping: <code>{replacement emoji}: {emoji 1} {emoji 2} …</code>
    // Comment: Lines starting with <code>#</code> or <code>//</code>, as well as empty lines, are ignored
    const DEFAULT_MAPPINGS = `\
# frown <- nasty, hateful, angry, frowning, ...
🙁 <- 💩 🤮 🤬 😡 👿 😠 😤 ☹️ 😾 🙁 😕 😦 🤨 😒 🫤

# random examples (disabled — uncomment to enable)
//🙁 <- 🙍 🙍‍♀️ 🙍‍♂️ 🙍🏻 🙍🏻‍♀️ 🙍🏻‍♂️ 🙍🏼 🙍🏼‍♀️ 🙍🏼‍♂️ 🙍🏽 🙍🏽‍♀️ 🙍🏽‍♂️ 🙍🏾 🙍🏾‍♀️ 🙍🏾‍♂️ 🙍🏿 🙍🏿‍♀️ 🙍🏿‍♂️
//🤭 <- 😈 👹 👻 💀 ☠️ 👺 🤡 👽 🥸 😏 😼
//😴 <- 🥱 😫 😩 😪 😮‍💨 🫩 🥴 😵‍💫 😵
//😔 <- 😭 😢 😥 😿 😞 😣 😖 😟 😧
//😨 <- 😱 😰 🙀
//🤕 <- 🤢 🤒 🤧 😷
//🩹 <- 💉 🩸
//😲 <- 😮
//😀 <- 😹 🤣 😂 😆 😄 😃 😁
//😛 <- 😝 😜 🤪
//😋 <- 🤤
`;

    /*** Mapping logic ***/

    function parseMappings(text) {
        const map = new Map();
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
            const sepIdx = trimmed.indexOf('<-');
            if (sepIdx === -1) continue;
            const replacement = trimmed.slice(0, sepIdx).trim();
            const emojis = trimmed
                .slice(sepIdx + 2)
                .trim()
                .split(/\s+/)
                .filter(Boolean);
            if (replacement && emojis.length) {
                for (const emoji of emojis) map.set(emoji, replacement);
            }
        }
        return map;
    }

    function buildRegex(map) {
        if (!map.size) return null;
        const pattern = [...map.keys()]
            .sort((a, b) => b.length - a.length)
            .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
        return new RegExp(pattern, 'gu');
    }

    let emojiMap = new Map();
    let emojiRegex = null;

    async function loadMappings() {
        const stored = await GM.getValue(STORAGE_KEY, null);
        emojiMap = parseMappings(stored ?? DEFAULT_MAPPINGS);
        emojiRegex = buildRegex(emojiMap);
    }

    /*** DOM replacement ***/

    function replaceInTextNode(node) {
        if (!emojiRegex) return;
        const original = node.nodeValue;
        const replaced = original.replace(emojiRegex, (match) => emojiMap.get(match) ?? match);
        if (replaced !== original) node.nodeValue = replaced;
    }

    function processRoot(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const tag = node.parentElement?.tagName;
                return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA'
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        let node;
        while ((node = walker.nextNode())) replaceInTextNode(node);
    }

    /*** Settings panel ***/

    function openSettings() {
        document.getElementById('emoji-replacer-panel')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'emoji-replacer-panel';
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
            width: '500px',
            maxWidth: '92vw',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
        });

        const title = document.createElement('h3');
        title.textContent = 'Emoji Replacer — Mappings';
        Object.assign(title.style, { margin: '0 0 6px', color: '#fff', fontSize: '15px' });

        const hint = document.createElement('div');
        hint.innerHTML = `Format, one entry per line:
<ul style="list-style-position:inside;padding-left:0;margin:4px 0 0 0">
    <li>Mapping: <code>{replacement emoji} &lt;- {emoji 1} {emoji 2} …</code></li>
    <li>Comment: Lines starting with <code>#</code> or <code>//</code>, as well as empty lines, are ignored</li>
</ul>`;
        Object.assign(hint.style, { margin: '0 0 10px', color: '#888', fontSize: '11px' });

        const textarea = document.createElement('textarea');
        Object.assign(textarea.style, {
            width: '100%',
            height: '400px',
            background: '#252526',
            color: '#d4d4d4',
            border: '1px solid #444',
            borderRadius: '4px',
            padding: '8px',
            boxSizing: 'border-box',
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '15px',
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

        btnSave.title = 'Save and apply to new content — already-replaced emojis on this page stay as-is';
        btnSaveReload.title = 'Save and reload the page — ensures all emojis are re-processed from scratch';

        btnReset.addEventListener('click', () => {
            textarea.value = DEFAULT_MAPPINGS;
        });

        btnCancel.addEventListener('click', () => overlay.remove());

        btnSave.addEventListener('click', async () => {
            await GM.setValue(STORAGE_KEY, textarea.value);
            overlay.remove();
            await loadMappings();
            processRoot(document.body ?? document.documentElement);
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
        document.body.append(overlay);
        textarea.focus();
    }

    /*** Init ***/

    await loadMappings();
    processRoot(document.body ?? document.documentElement);

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                replaceInTextNode(mutation.target);
            } else {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        replaceInTextNode(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        processRoot(node);
                    }
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    GM_registerMenuCommand('Edit Emoji Mappings', openSettings);
})();
