// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Copy URL on hover
// @description Copy link and media urls on mouse hover while alt/ctrl is pressed
// @version     0.1.4
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

    const POLL_RATE = 25;
    const SHOW_TT = true; // show tooltip?
    const TT_TIMEOUT = 250; // tooltip timeout
    const TT_FADEOUT = 500; // tooltip fadeout time

    // global variables
    var currentMod = 0;

    // create or replace tooltip
    function tooltip(html) {
        if (SHOW_TT) {
            cb.createMouseTT(html, TT_TIMEOUT, { fadeoutTimer: TT_FADEOUT });
        }
    }


    // register global keydown event handling the relevant modifier keys
    $(document).on("keydown keydown", function (event) {
        var ev = event || window.event;
        if (ev.altKey || ev.ctrlKey || ev.shiftKey) {
            currentMod = ev.which; // last mod only
        }
    });


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
        var v = getSrc(e, dict);
        if (v !== undefined) {
            return v; // found?
        }
        if (sel === undefined) { // no selector? don't search
            return undefined;
        }
        // search for matching children (recursively)
        e.find(sel).each(function (i, el) { // try to find sources
            v = getSrc(el, dict);
            if (v !== undefined) return; // found? break look
        });
        return v;
    }


    // register mouse event
    function registerSrcEvent(element, selector, keyCode, dict, ttText = 'Copied ...') {

        // copy video / image url on hover while ctrl is pressed
        $(element).mouseenter(function (event) {
            var ev = event || window.event;
            var e = $(event.target || event.srcElement);

            // since keyup is not working properly for mod keys, clear currentMod
            // if mod key was released
            // key-event will set currentMod variable if pressed again while hovering
            var lastMod = 0;
            if (currentMod == keyCode) {
                if (ev.which != keyCode) { // current mod no longer pressed?
                    currentMod = 0;
                }
            }

            this.keyPollIntervalId = setInterval(function () {
                if (currentMod == keyCode && lastMod != keyCode) {
                    lastMod = keyCode;
                    var newValue = findSrc(e, selector, dict);
                    if (newValue !== undefined) {
                        GM_setClipboard(newValue);
                        tooltip(ttText);
                    }
                }
            }, POLL_RATE);
        }).mouseleave(function () {
            this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
        });
    }


    // FIXME may need to search for parents too (currently not working e.g. in case a contains img)
    waitForKeyElements('a',
        (e) => registerSrcEvent(e, 'a', KCODE_ALT,
            { 'a': ['href'] },
            'Link Copied'));
    waitForKeyElements('img, video',
        (e) => registerSrcEvent(e, 'img, video', KCODE_CTRL,
            { 'img': ['src'], 'video': ['src', 'data', 'data-mp4', 'data-webm', 'data-src'] },
            'Media Source Copied'));
    waitForKeyElements('body, div, span', // style could be global so [style*="background-image"] is not an option
        function (e) {
            if ($(e).css('background-image') == 'none') { // filter
                return;
            }
            registerSrcEvent(e, undefined, KCODE_CTRL,
                { 'body, div, span': ['css:background-image'] }, // special case
                'Media Source Copied');
        });

}());
