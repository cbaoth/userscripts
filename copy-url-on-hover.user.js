// ==UserScript==
// @name         Copy URL on hover
// @namespace    https://cbaoth.de
// @version      0.1
// @downloadURL  https://github.com/cbaoth/userscripts/raw/master/copy-url-on-hover.user.js
// @description  Copy link and media urls on mouse hover while alt/ctrl is pressed
// @author       cbaoth
//
// @include      *
//
// @grant        GM_setClipboard
//
// @require      http://code.jquery.com/jquery-latest.min.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

// constants
const CTRL_CODE = 17;
const ALT_CODE = 18;
const POLL_RATE = 25;

// global variables
var   currentMod = 0;

// register mouse events
function registerEvents() {

    // copy video / image url on hover while ctrl is pressed
    $('video', 'img').mouseenter(function(event) {
        var ev = event || window.event;
        var video = this;
        var lastMod = 0;
        // since keyup is not working properly for mod keys, clear currentMod
        // if mod no longer pressed (key must have been released)
        // key-event will set currentMod variable if pressed again while hovering
        if (!ev.ctrlKey && currentMod == CTRL_CODE) {
            currentMod = 0;
        }
        this.keyPollIntervalId = setInterval(function() {
            if (currentMod == CTRL_CODE && lastMod != CTRL_CODE) {
                if ($(video).attr("data")) { // data*
                    GM_setClipboard($(video).attr("data"));
                } else if ($(video).attr("data-mp4")) {
                    GM_setClipboard($(video).attr("data-mp4"));
                } else if ($(video).attr("data-src")) {
                    GM_setClipboard($(video).attr("data-src"));
                } else if ($(video).attr("src")) {
                    GM_setClipboard($(video).attr("src"));
                } else { // nothing found
                    $(video).find("source").each(function() { // try to find sources
                        var source = this;
                        if ($(source).attr("src")) {
                            GM_setClipboard($(source).attr("src"));
                            // TODO: could be improved in the future, e.g. prefered media type
                            return; // simply take the first find
                        }
                    });
                }
                lastMod = CTRL_CODE;
            }
        }, POLL_RATE);
    }).mouseleave(function() {
        this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
    });

    // copy link url on hover while alt is pressed
    $('a').mouseenter(function(event) {
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
        this.keyPollIntervalId = setInterval(function() {
            if (currentMod == ALT_CODE && lastMod != ALT_CODE) {
                GM_setClipboard($(a)[0].href); // get absolute url
                lastMod = ALT_CODE;
            }
        }, POLL_RATE);
    }).mouseleave(function() {
        this.keyPollIntervalId && clearInterval(this.keyPollIntervalId);
    });


    // globally register all keydown events of the relevant modifier keys
    // (last one counts)
    $(document).on("keydown", function(event) {
        var ev = event || window.event;
        if (ev.altKey || ev.ctrlKey) {
            currentMod = ev.which;
        }
    });
}

registerEvents();
