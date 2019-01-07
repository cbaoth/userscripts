// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Copy URL on hover
// @description Copy link and media urls on mouse hover while alt/ctrl is pressed
// @version     0.1.3
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
    const CTRL_CODE = 17;
    const ALT_CODE = 18;
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


    // register globalkeydown event handling the relevant modifier keys
    // (last one counts)
    $(document).on("keydown", function (event) {
        var ev = event || window.event;
        if (ev.altKey || ev.ctrlKey) {
            currentMod = ev.which;
        }
    });


    // register mouse events on media elements
    function registerMediaEvents(element) {

        // copy video / image url on hover while ctrl is pressed
        $(element).mouseenter(function (event) {
            var ev = event || window.event;
            var media = $(element);
            var lastMod = 0;
            // since keyup is not working properly for mod keys, clear currentMod
            // if mod no longer pressed (key must have been released)
            // key-event will set currentMod variable if pressed again while hovering
            if (!ev.ctrlKey && currentMod == CTRL_CODE) {
                currentMod = 0;
            }
            this.keyPollIntervalId = setInterval(function () {
                if (currentMod == CTRL_CODE && lastMod != CTRL_CODE) {
                    lastMod = CTRL_CODE;
                    var newValue;
                    if (media.is('div')) {
                        var bg_img = media.css('background-image') || "";
                        newValue = bg_img.replace(/^url\(['"]?([^'"]*)['"]?\)/, '$1');
                    } else if (media.attr("data")) { // data*
                        newValue = media.attr("data");
                    } else if (media.attr("data-mp4")) {
                        newValue = media.attr("data-mp4");
                    } else if (media.attr("data-src")) {
                        newValue = media.attr("data-src");
                    } else if (media.attr("src")) {
                        newValue = media.attr("src");
                    } else { // nothing found
                        media.find("source").each(function () { // try to find sources
                            var source = this;
                            if ($(source).attr("src")) {
                                newValue = $(source).attr("src");
                                // TODO: could be improved in the future, e.g. prefered media type
                                return; // simply take the first match and break the loop
                            }
                        });
                    }
                    if (newValue !== undefined) {
                        GM_setClipboard(newValue);
                        tooltip('Copied Media URL');
                    }
                }
            }, POLL_RATE);
        }).mouseleave(function () {
            this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
        });
    }


    // register mouse events on link elements
    function registerLinkEvents(element) {

        // copy link url on hover while alt is pressed
        $(element).mouseenter(function (event) {
            var ev = event || window.event;
            var link = $(element);
            var lastMod = 0;
            // since keyup is not working properly for mod keys, clear currentMod
            // if mod no longer pressed (key must have been released)
            // key-event will set currentMod variable if pressed again while hovering
            if ((!ev.altKey && currentMod == ALT_CODE)
                || (!ev.ctrlKey && currentMod == CTRL_CODE)) {
                currentMod = 0;
            }
            this.keyPollIntervalId = setInterval(function () {
                if (currentMod == ALT_CODE && lastMod != ALT_CODE) {
                    lastMod = ALT_CODE;
                    GM_setClipboard(link[0].href); // get absolute url
                    tooltip('Copied Link');
                }
            }, POLL_RATE);
        }).mouseleave(function () {
            this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
        });
    }


    cb.waitAndThrottle('a', (e) => registerLinkEvents(e));
    cb.waitAndThrottle('img, video, div[style*="background-image"]',
                       (e) => registerMediaEvents(e));

}());
