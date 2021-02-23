// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Auto Show Forum Spoilers
// @version     0.2.0
// @description Automatically show all spoilers in forum posts and expand partially shown articles
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/auto-show-forum-spoilers.user.js
//
// @include     *://*/showthread.php*
// @include     *://*/forum/*
// @include     /https?://([^/.]+\.)*patreon.com/
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
    const SPOILER_SELECTORS = `input[type='button'][class~='folded'][value='Spoiler']:not(.${CLASS}),
        input[type='button'][title='Show'][value='Show']:not(.${CLASS}),
        div.pre-spoiler > input[type=button]:not(.${CLASS})`;
    const PATREON_UNCOLLAPSE_SELECTORS = `div[data-tag=post-content-collapse] > div > button`;
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

    if (/([^/.]+\.)*patreon.com$/.test(window.location.host)) { // Patreon
        waitForKeyElements(PATREON_UNCOLLAPSE_SELECTORS, (e) => click(e));
    } else { // Common forums
        waitForKeyElements(SPOILER_SELECTORS, (e) => click(e));
    }
}());
