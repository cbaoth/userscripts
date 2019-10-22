// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2019+, userscript@cbaoth.de
//
// @name        TradingView Tweaks
// @version     0.0.1
// @description Some tweaks for various streaming sites
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/tradingview-tweaks.user.js
//
// @include     https://www.tradingview.com/chart/*
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    const KEY_0 = 48

    // register new key bindings
    function registerKeyBindings() {
        // keys: alt+1 -> time frame favorite list entry 1
        for (let i = 1; i <= 10; i++) {
            cb.bindKeyDown(KEY_0 + (i % 10), (e) => cb.clickElement($('div#header-toolbar-intervals > div[class*="button"]:nth-child(' + i + ')')),
                           { mods: { alt: true } });
        }
    }


    // register tweaks depending on page
    registerKeyBindings();

}());
