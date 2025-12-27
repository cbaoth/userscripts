// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Copy URL on hover
// @description Copy link / media urls on mouse-over while alt-c/-b is pressed
// @version     0.2.0
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/copy-url-on-hover.user.js
//
// @include     *
//
// @grant       GM_setClipboard
// ==/UserScript==

(function () {

    /* {{{ = CONSTANTS AND GLOBALS ======================================== */

    // Key codes
    const KCODE_SHIFT = 16;
    const KCODE_CTRL = 17;
    const KCODE_ALT = 18;
    const KCODE_META = 224;
    const KCODE_B = 66;
    const KCODE_C = 67;

    // Timing constants
    const POLL_RATE = 25;        // Polling interval for key state checks (deprecated)
    const SHOW_TT = true;         // Show tooltip?
    const TT_TIMEOUT = 750;       // Tooltip timeout in ms
    const TT_FADEOUT = 250;       // Tooltip fadeout time in ms

    // Global state
    var currentKeys = { "shift": false, "ctrl": false, "alt": false, "meta": false };
    var lastCopiedUrl = null;

    /* }}} = END: CONSTANTS AND GLOBALS =================================== */

    /* {{{ = UTILITY FUNCTIONS ============================================ */

    /**
     * Wait for elements to appear in the DOM using MutationObserver.
     *
     * @param {string} selector - CSS selector to match elements.
     * @param {Function} callback - Function called for each new element found.
     * @param {Object} options - Options object.
     * @param {Element} [options.target=document.body] - Element to observe.
     * @param {boolean} [options.once=false] - Stop after first match?
     * @param {number} [options.timeout=null] - Auto-disconnect timeout in ms.
     * @returns {MutationObserver} The observer instance.
     */
    function waitForElements(selector, callback, options = {}) {
        const {
            target = document.body,
            once = false,
            timeout = null
        } = options;

        const processedElements = new WeakSet();

        const checkElements = () => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (!processedElements.has(element)) {
                    processedElements.add(element);
                    callback(element);
                }
            });
            return elements.length > 0;
        };

        // Check if elements already exist
        if (checkElements() && once) {
            return;
        }

        // Set up MutationObserver to watch for new elements
        const observer = new MutationObserver(() => {
            if (checkElements() && once) {
                observer.disconnect();
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true
        });

        // Optional timeout
        if (timeout) {
            setTimeout(() => observer.disconnect(), timeout);
        }

        return observer;
    }

    /**
     * Create or replace a tooltip near the mouse cursor.
     *
     * @param {string} html - HTML content for the tooltip.
     */
    function tooltip(html) {
        if (!SHOW_TT) return;

        // Remove existing tooltip if present
        const existingTooltip = document.getElementById('cb-mouse-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }

        // Create tooltip element
        const tt = document.createElement('div');
        tt.id = 'cb-mouse-tooltip';
        tt.innerHTML = html;
        tt.style.cssText = `
            position: fixed;
            z-index: 999999;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            pointer-events: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            word-wrap: break-word;
        `;

        document.body.appendChild(tt);

        // Position tooltip near mouse cursor
        const updatePosition = (e) => {
            tt.style.left = (e.clientX + 10) + 'px';
            tt.style.top = (e.clientY + 10) + 'px';
        };

        // Track mouse for initial positioning
        const initialMouseHandler = (e) => {
            updatePosition(e);
            document.removeEventListener('mousemove', initialMouseHandler);
        };
        document.addEventListener('mousemove', initialMouseHandler);

        // Set initial position at current cursor (if available from last mouse move)
        if (window.lastMouseEvent) {
            updatePosition(window.lastMouseEvent);
        }

        // Fade out and remove after timeout
        setTimeout(() => {
            tt.style.transition = `opacity ${TT_FADEOUT}ms`;
            tt.style.opacity = '0';
            setTimeout(() => tt.remove(), TT_FADEOUT);
        }, TT_TIMEOUT);
    }

    /* }}} = END: UTILITY FUNCTIONS ======================================= */

    /* {{{ = ELEMENT DETECTION AND URL HANDLING =========================== */

    // Track last mouse position for tooltip and element detection
    document.addEventListener('mousemove', (e) => {
        window.lastMouseEvent = e;
    });

    /**
     * Resolve the topmost element currently under the cursor.
     *
     * @returns {Element|null} The element under the cursor, or null if none.
     */
    function getHoveredElement() {
        if (window.lastMouseEvent && typeof document.elementFromPoint === 'function') {
            const el = document.elementFromPoint(window.lastMouseEvent.clientX, window.lastMouseEvent.clientY);
            if (el) return el;
        }
        const hovered = document.querySelectorAll(':hover');
        return hovered.length ? hovered[hovered.length - 1] : null;
    }

    /**
     * Resolve all elements under the cursor as a stack (overlay-safe).
     * Uses elementsFromPoint to penetrate overlays and wrappers.
     *
     * @returns {Element[]} Array of elements under the cursor, topmost first.
     */
    function getElementsUnderCursor() {
        const list = [];
        if (window.lastMouseEvent) {
            const { clientX, clientY } = window.lastMouseEvent;
            if (typeof document.elementsFromPoint === 'function') {
                return document.elementsFromPoint(clientX, clientY) || [];
            }
            const el = document.elementFromPoint && document.elementFromPoint(clientX, clientY);
            if (el) list.push(el);
        }
        const hovered = document.querySelectorAll(':hover');
        if (hovered && hovered.length) {
            list.push(...hovered);
        }
        return list;
    }

    /**
     * Normalize a URL value to a full absolute URL.
     * Handles relative paths, protocol-relative URLs, and ensures proper formatting.
     *
     * @param {string} newValue - Raw URL value from element attribute or CSS.
     * @returns {string|undefined} Normalized absolute URL, or undefined if invalid.
     */
    function normalizeUrl(newValue) {
        if (newValue === undefined || newValue === null || newValue === '' || newValue === 'none') return undefined;
        if (/^\w+:/.test(newValue)) { // already has scheme
            return newValue;
        } else if (/^\/\//.test(newValue)) { // protocol-relative
            return document.location.protocol + newValue;
        } else if (/^\.*\//.test(newValue) || !/^(\w+:\/\/)/.test(newValue)) { // relative or path without scheme
            return document.location.origin + '/' + String(newValue).replace(/^[./]+/, '');
        } else {
            return newValue;
        }
    }

    /**
     * Copy a URL from the element currently under the cursor.
     * Searches through the element stack to find a matching URL and copies it to clipboard.
     * Shows tooltip feedback and deduplicates identical URLs.
     *
     * @param {string} selector - CSS selector for elements to search (e.g., 'a', 'img, video').
     * @param {Object} dict - Dictionary mapping element types to attribute names to check.
     * @param {string} ttText - Tooltip text prefix for successful copy.
     */
    function copyFromHover(selector, dict, ttText) {
        const candidates = getElementsUnderCursor();
        if (!candidates.length) return;
        let url;
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            let v = findSrc(el, selector, dict);
            if ((v === undefined || v === null) && (!selector || selector === 'img, video')) {
                const cssUrl = getUrlFromCSS(el, 'background-image');
                if (cssUrl) v = cssUrl;
            }
            url = normalizeUrl(v);
            if (url) break;
        }
        if (!url) return;
        if (url === lastCopiedUrl) {
            tooltip('<span style="font-size: 0.9em; font-style: italic; color: gray">Unchanged URL (not copied)</span>');
            return;
        }
        GM_setClipboard(url);
        tooltip(ttText + ':<br/><span style="font-size: 0.75em;">' + url + '</span>');
        lastCopiedUrl = url;
    }

    /**
     * Extract URL value from CSS property (e.g., background-image).
     *
     * @param {Element} e - The element to extract from.
     * @param {string} style - CSS property name to read.
     * @returns {string|undefined} The extracted URL, or undefined if not found.
     */
    function getUrlFromCSS(e, style) {
        var bg_img = window.getComputedStyle(e).getPropertyValue(style) || "";
        var src = bg_img.replace(/^url\(['"]?([^'"]*)['" ]?\)/, '$1');
        return src == "" ? undefined : src;
    }

    /**
     * Extract a URL from an element, searching children, siblings, and ancestors.
     *
     * @param {Element} e - The root element to search from.
     * @param {string} sel - CSS selector for target elements (e.g., 'img', 'a').
     * @param {Object} dict - Dictionary mapping selectors to attribute names.
     * @returns {string|undefined} The found URL value, or undefined if not found.
     */
    function findSrc(e, sel, dict = { 'a': ['href'] }) {
        var v = getSrc(e, dict);
        if (v !== undefined) {
            return v;
        }
        if (sel === undefined) {
            return undefined;
        }
        // search for matching children (recursively)
        var children = e.querySelectorAll(sel);
        for (var i = 0; i < children.length; i++) {
            v = getSrc(children[i], dict);
            if (v !== undefined) return v;
        }
        // search for siblings (sometimes sibling divs cover media)
        var parent = e.parentElement;
        if (parent) {
            var siblings = parent.querySelectorAll(sel);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i] !== e) {
                    v = getSrc(siblings[i], dict);
                    if (v !== undefined) return v;
                }
            }
        }
        // search for matching parent (recursively)
        var ancestor = e.parentElement;
        while (ancestor) {
            if (ancestor.matches(sel)) {
                v = getSrc(ancestor, dict);
                if (v !== undefined) return v;
            }
            ancestor = ancestor.parentElement;
        }
        return v;
    }

    /**
     * Extract a URL/source from a single element using an attribute dictionary.
     *
     * @param {Element} e - The element to extract from.
     * @param {Object} dict - Dictionary mapping selectors to attribute names.
     * @param {boolean} [includeBgImg=false] - Deprecated, not used.
     * @returns {string|undefined} The extracted URL value, or undefined if not found.
     */
    function getSrc(e, dict = { 'a': ['href'] }, includeBgImg = false) {
        var v;
        for (var k in dict) {
            if (e.matches(k)) {
                for (var i in dict[k]) {
                    var a = dict[k][i];
                    if (/^css:.*/.test(a)) { // special case for css styles
                        v = getUrlFromCSS(e, a.replace(/^css:/, ''));
                    } else {
                        v = e.getAttribute(a);
                    }
                    if (v !== undefined && v !== null) {
                        return v;
                    }
                }
            }
        }
        return undefined;
    }

    /* }}} = END: ELEMENT DETECTION AND URL HANDLING ====================== */

    /* {{{ = KEY EVENT HANDLING =========================================== */

    /**
     * Check if a keyCode represents a modifier key.
     *
     * @param {number} keyCode - The key code to check.
     * @returns {boolean} True if the key is a modifier key.
     */
    function isModKey(keyCode) {
        return keyCode === KCODE_SHIFT || keyCode === KCODE_CTRL
            || keyCode === KCODE_ALT || keyCode === KCODE_META;
    }


    // register global keydown event
    document.addEventListener("keydown", function (event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        if (isModKey(ev.keyCode)) {
            updateModState(event);
        } else {
            currentKeys.keyCode = ev.keyCode;
        }

        // Handle immediate copy on key press without requiring mouseenter
        if (!ev.repeat) {
            if (ev.altKey && ev.keyCode === KCODE_C) {
                copyFromHover('a', { 'a': ['href'] }, 'Link Copied');
            } else if (ev.altKey && ev.keyCode === KCODE_B) {
                copyFromHover('img, video', {
                    'img': ['src'],
                    'video': ['src', 'data', 'data-mp4', 'data-webm', 'data-src'],
                    'source': ['src', 'data', 'data-mp4', 'data-webm', 'data-src']
                }, 'Media Source Copied');
            }
        }
    });

    /**
     * Update the global modifier key state from a keyboard event.
     *
     * @param {KeyboardEvent} event - The keyboard event.
     */
    function updateModState(event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        currentKeys.shift = ev.shiftKey;
        currentKeys.ctrl = ev.ctrlKey;
        currentKeys.alt = ev.altKey;
        currentKeys.meta = ev.metaKey;
    }

    /**
     * Check if current key state matches the expected modifier key state.
     *
     * @param {Object} keys - Expected key state object.
     * @returns {boolean} True if the current key state matches.
     */
    function checkKeyState(keys) {
        var metaKey = ["shift", "ctrl", "alt", "meta"];
        for (var i in metaKey) {
            if (currentKeys[metaKey[i]] !== (keys[metaKey[i]] || false)) {
                return false;
            }
        }
        return currentKeys.keyCode === keys.keyCode;
    }

    /**
     * Check if event modifier keys match the expected state.
     *
     * @param {KeyboardEvent} event - The keyboard event.
     * @param {Object} keys - Expected key state object with modifier flags.
     * @returns {boolean} True if all modifier keys match the expected state.
     */
    function checkModState(event, keys) {
        var ev = event || window.event;
        if (ev === undefined) {
            return false;
        }

        var shift = ev.shiftKey === (keys.shift || false);
        var ctrl = ev.ctrlKey === (keys.ctrl || false);
        var alt = ev.altKey === (keys.alt || false);
        var meta = ev.metaKey === (keys.meta || false);

        return shift && ctrl && alt && meta;
    }

    // Register global keyup event
    document.addEventListener("keyup", function (event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        // just update mods, no matter the key pressed (keyup unreliable for mods)
        updateModState(event);
        if (!isModKey(ev.keyCode) && currentKeys.keyCode === ev.keyCode) {
            delete currentKeys.keyCode;
        }
    });

    /* }}} = END: KEY EVENT HANDLING ====================================== */

}());
