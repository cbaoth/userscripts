// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Auto Show Forum Spoilers
// @version     0.1.1
// @description Automatically show all spoilers in forum posts
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/auto-show-forum-spoilers.user.js
//
// @include     *://*/showthread.php*
// @include     *://*/forum/*
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

// prevent jQuery version conflicts (with page)
this.$ = this.jQuery = jQuery.noConflict(true);

(function () {
    const CLASS = "autoShowForumSpoilers";
    const SPOILER_SELECTORS = "input[type='button'][class~='folded'][value='Spoiler']:not(." + CLASS + "),"
        + "input[type='button'][title='Show'][value='Show']:not(." + CLASS + "),"
        + "div.pre-spoiler > input[type=button]:not(." + CLASS + ")";
    const MAX_RETRIES = 5;
    const RETRY_AFTER_MS = 500;

    // retry
    var retry = function (f, ms = RETRY_AFTER_MS, retries = MAX_RETRIES) {
        try {
            return f()
        } catch (ex) {
            if (retries <= 0) throw ex;
            return _.delay(retry, ms, f, retries - 1);
        }
    }

    // click button and add blacklist class
    var click = function (e) {
        var button = $(e);
        button.addClass(CLASS);
        // retry max 5 times every 500ms (necessary scripts not yet loaded)
        retry(() => cb.clickElement(button));
    }

    // click spoiler buttons
    waitForKeyElements(SPOILER_SELECTORS, (e) => click(e));
}());
