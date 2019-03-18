// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Copy URL on hover
// @description Copy link / media urls on mouse-over while alt-c/-b is pressed
// @version     0.1.8
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/copy-url-on-hover.user.js
//
// @include     *
//
// @grant       GM_setClipboard
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    // global constants
    const KCODE_SHIFT = 16;
    const KCODE_CTRL = 17;
    const KCODE_ALT = 18;
    const KCODE_META = 224;
    const KCODE_B = 66;
    const KCODE_C = 67;

    const POLL_RATE = 25;
    const SHOW_TT = true; // show tooltip?

    const TT_TIMEOUT = 250; // tooltip timeout
    const TT_FADEOUT = 500; // tooltip fadeout time

    // global variables
    var currentKeys = { "shift": false, "ctrl": false, "alt": false, "meta": false };

    // create or replace tooltip
    function tooltip(html) {
        if (SHOW_TT) {
            cb.createMouseTT(html, TT_TIMEOUT, { fadeoutTimer: TT_FADEOUT });
        }
    }


    function isModKey(keyCode) {
        return keyCode === KCODE_SHIFT || keyCode === KCODE_CTRL
            || keyCode === KCODE_ALT || keyCode === KCODE_META;
    }


    // register global keydown event
    $(document).on("keydown", function (event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        if (isModKey(ev.keyCode)) {
            updateModState(event);
        } else {
            currentKeys["keyCode"] = ev.keyCode;
        }
    });


    // register global keyup event
    $(document).on("keyup", function (event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        // just update mods, no matter the key pressed (keyup unreliable for mods)
        updateModState(event);
        if (!isModKey(ev.keyCode) && currentKeys["keyCode"] === ev.keyCode) {
            delete currentKeys["keyCode"];
        }
    });


    function updateModState(event) {
        var ev = event || window.event;
        if (ev === undefined) {
            return;
        }
        currentKeys["shift"] = ev.shiftKey;
        currentKeys["ctrl"] = ev.ctrlKey;
        currentKeys["alt"] = ev.altKey;
        currentKeys["meta"] = ev.metaKey;
    }


    function checkModState(event, keys) {
        var ev = event || window.event;
        if (ev === undefined) {
            return false;
        }

        var shift = ev.shiftKey === (keys["shift"] || false);
        var ctrl = ev.ctrlKey === (keys["ctrl"] || false);
        var alt = ev.altKey === (keys["alt"] || false);
        var meta = ev.metaKey === (keys["meta"] || false);

        return shift && ctrl && alt && meta;
    }


    function checkKeyState(keys) {
        var metaKey = ["shift", "ctrl", "alt", "meta"];
        for (var i in metaKey) {
            if (currentKeys[metaKey[i]] !== (keys[metaKey[i]] || false)) {
                return false;
            }
        }
        return currentKeys["keyCode"] === keys["keyCode"];
    }


    function getSrc(e, dict = { 'a': ['href'] }, includeBgImg = false) {
        var v;
        for (var k in dict) {
            if (e.is(k)) {
                for (var i in dict[k]) {
                    var a = dict[k][i];
                    if (/^css:.*/.test(a)) { // special case for css styles
                        v = getUrlFromCSS(e, a.replace(/^css:/, ''));
                    } else {
                        v = e.attr(a);
                    }
                    if (v !== undefined) {
                        return v; // found?
                    }
                }
            }
        }
        return undefined;
    }


    function getUrlFromCSS(e, style) {
        var bg_img = e.css(style) || "";
        var src = bg_img.replace(/^url\(['"]?([^'"]*)['"]?\)/, '$1'); // TODO doesn't consider multiple urls
        return src == "" ? undefined : src;
    }


    // find src/data in element e using selector sel
    function findSrc(e, sel, dict = { 'a': ['href'] }) {
        var v = getSrc($(e), dict);
        if (v !== undefined) {
            return v; // found?
        }
        if (sel === undefined) { // no selector? don't search
            return undefined;
        }
        // search for matching children (recursively)
        $(e).find(sel).each(function (i, el) { // try to find sources
            v = getSrc($(el), dict);
            if (v !== undefined) return; // found? break look
        });
        // search for matching parent (recursively)
        $(e).parent().closest(sel).each(function (i, el) { // try to find sources
            v = getSrc($(el), dict);
            if (v !== undefined) return; // found? break look
        });
        return v;
    }


    // register mouse event
    function registerSrcEvent(element, selector, keys, dict, ttText = 'Copied ...') {
        $(element).mouseenter(function (event) {
            var ev = event || window.event;
            var e = $(event.target || event.srcElement);

            // since keyup is not working properly for mod keys, clear currentMod
            // if mod key was released
            // key-event will set currentKeys variable if pressed again while hovering
            var lastKeys = {};
            if (checkModState(ev, keys)) {
                updateModState(ev);
            }

            this.keyPollIntervalId = setInterval(function () {
                // matching keys are pressed and previous event didn't match (else: already triggered)?
                if (checkKeyState(keys) && !checkKeyState(lastKeys)) {
                    lastKeys = currentKeys;
                    var newValue = findSrc(e, selector, dict);
                    if (newValue !== undefined && newValue != "" && newValue != "none") {
                        var url;
                        if (/^.*\//.test(newValue) || ! /^(\w+:\/\/)/.test(newValue)) {
                            url = document.location.origin + '/' + newValue.replace(/^[./]+/, '')
                        } else {
                            url = newValue;
                        }
                        GM_setClipboard(url);
                        tooltip(ttText + ':<br/><span style="font-size: 0.75em;">' + url + '</span>');
                    }
                }
            }, POLL_RATE);
        }).mouseleave(function () {
            this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
        });
    }

    // register elements and key bindings
    waitForKeyElements('a',
        (e) => registerSrcEvent(e, 'a', { alt: true, keyCode: KCODE_C },
            { 'a': ['href'] },
            'Link Copied'));

    waitForKeyElements('img, video, source',
        (e) => registerSrcEvent(e, 'img, video', { alt: true, keyCode: KCODE_B },
            {
                'img': ['src'],
                'video': ['src', 'data', 'data-mp4', 'data-webm', 'data-src'],
                'source': ['src', 'data', 'data-mp4', 'data-webm', 'data-src']
            },
            'Media Source Copied'));

    // style could be global so [style*="background-image"] is not an option
    waitForKeyElements('body, div, span',
        function (e) {
            if ($(e).css('background-image') == 'none') { // filter
                return;
            }
            registerSrcEvent(e, undefined, { alt: true, keyCode: KCODE_B },
                { 'body, div, span': ['css:background-image'] }, // special case
                'Media Source Copied');
        });

}());
