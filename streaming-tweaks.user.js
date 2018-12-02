// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Streaming Tweaks
// @version     0.1.4
// @description Some tweaks for various streaming sites
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/streaming-tweaks.user.js
//
// @include     /^https?://www\.netflix\.com/watch//
// @include     /^https?://(www|smile)\.amazon\.(de|com)/gp/video//
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

    // register amazon tweaks
    function amazonTweaksReg() {
        // ignore node warnings for repeated click events
        if (document.emitter !== undefined) document.emitter.setMaxListeners(0);

        // auto skip intro/credits/ads
        const AMAZON_SEL_SKIP = `.skipElement, .countdown, .adSkipButton`;

        // control (click) function
        var amazonCtrl = (elements, event, times = 1, options = { autoplay: true }) => {
            // perform click(s)
            cb.clickElement(elements[0], times);
        };

        // keys: n -> next episode
        cb.bindKeyDown(78, (e) => amazonCtrl($('div.nextTitleButton'), e));
        // keys: shift+left/right -> skip +/-1min
        cb.bindKeyDown(37, (e) => amazonCtrl($('div.fastSeekBack'), e, 6), { shift: true });
        cb.bindKeyDown(39, (e) => amazonCtrl($('div.fastSeekForward'), e, 6), { shift: true });
        // keys: ctrl+left/right -> skip +/-10min
        cb.bindKeyDown(37, (e) => amazonCtrl($('div.fastSeekBack'), e, 60), { ctrl: true });
        cb.bindKeyDown(39, (e) => amazonCtrl($('div.fastSeekForward'), e, 60), { ctrl: true });

        cb.waitAndThrottle(AMAZON_SEL_SKIP, (e) => $(e).click(), 2000, {tailing: false });
    }


    // register netflix tweaks
    function netflixTweaksReg() {
        // auto skip intro/credits
        const NETFLIX_SEL_SKIP = `.skip-credits > a > span, .WatchNext-still-container`;

        // control (click) function
        var netflixCtrl = (elements, event, times = 1, options = { autoplay: true }) => {
            // perform click(s)
            cb.clickElement(elements[0], times);
            // playback may be paused, in this case press "play" after 1sec delay
            if (options.autoplay !== undefined && options.autoplay) {
                setTimeout(() => {
                    var play = $('button.button-nfplayerPlay')[0];
                    if (play !== undefined) play.click();
                }, 250);
            }
            // TODO hide controls (auto pop-up)
        };

        // keys: n -> next episode
        cb.bindKeyDown(78, (e) => netflixCtrl($('button.button-nfplayerNextEpisode'), e));
        // keys: shift+left/right -> skip +/-1min
        cb.bindKeyDown(37, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 6), { shift: true });
        cb.bindKeyDown(39, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 6), { shift: true });
        // keys: ctrl+left/right -> skip +/-10min
        cb.bindKeyDown(37, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 60), { ctrl: true });
        cb.bindKeyDown(39, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 60), { ctrl: true });

        // wait for skip elements to appear, then skip
        cb.waitAndThrottle(NETFLIX_SEL_SKIP, netflixCtrl, 5000, { tailing: false });
    }


    // register tweaks depending on page
    if (/amazon/.test(window.location.host)) { // Amazon prime video
        amazonTweaksReg();
    } else if (/netflix/.test(window.location.host)) { // Netflix
        netflixTweaksReg();
    }

}());
