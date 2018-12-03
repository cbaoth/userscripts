// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Copy URL on hover
// @description Copy link and media urls on mouse hover while alt/ctrl is pressed
// @version     0.1.2
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/copy-url-on-hover.user.js
//
// @include     *
//
// @grant       GM_setClipboard
//
// @require     http://code.jquery.com/jquery-latest.min.js
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

    // register mouse events
    function registerEvents() {

        // copy video / image url on hover while ctrl is pressed
        $('video', 'img').mouseenter(function (event) {
            var ev = event || window.event;
            var video = this;
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
                    if ($(video).attr("data")) { // data*
                        newValue = $(video).attr("data");
                    } else if ($(video).attr("data-mp4")) {
                        newValue = $(video).attr("data-mp4");
                    } else if ($(video).attr("data-src")) {
                        newValue = $(video).attr("data-src");
                    } else if ($(video).attr("src")) {
                        newValue = $(video).attr("src");
                    } else { // nothing found
                        $(video).find("source").each(function () { // try to find sources
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

        // copy link url on hover while alt is pressed
        $('a').mouseenter(function (event) {
            var ev = event || window.event;
            var a = this;
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
                    GM_setClipboard($(a)[0].href); // get absolute url
                    tooltip('Copied Link');
                }
            }, POLL_RATE);
        }).mouseleave(function () {
            this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
        });


        // globally register all keydown events of the relevant modifier keys
        // (last one counts)
        $(document).on("keydown", function (event) {
            var ev = event || window.event;
            if (ev.altKey || ev.ctrlKey) {
                currentMod = ev.which;
            }
        });
    }

    registerEvents();

}());
