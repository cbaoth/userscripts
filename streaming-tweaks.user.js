// ==UserScript==
// @name        Streaming Tweaks
// @namespace   https://cbaoth.de
// @version     0.1.3
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/streaming-tweaks.user.js
// @description Some tweaks for various streaming sites
//
// @include     /^https?://www\.netflix\.com/watch//
// @include     /^https?://(www|smile)\.amazon\.(de|com)/gp/video//
//
// @grant none
//
// @require http://code.jquery.com/jquery-latest.min.js
// @require https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
//
// @copyright 2018, userscript@cbaoth.de
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);


// wait for element(s) to appear then call function no more than once within the given wait period
function waitAndThrottle(selector, f, wait = 200, options = { tailing: false }) {
    waitForKeyElements(selector, _.throttle(f, wait, options));
}

// register new key binding
function bindKey(keyCode, f, mods = { shift: false, ctrl: false, alt: false, meta: false }) {
    $(document).keydown(e => {
        var ev = e || window.event;
        // keyCode pressed?
        if ((ev.keyCode || ev.which) != keyCode) return;
        // any special key expected but not pressed OR not expected but pressed? -> return
        if ((mods.shift !== undefined && mods.shift && !ev.shiftKey)
            || ((mods.shift == undefined || !mods.shift) && ev.shiftKey)) return;
        if ((mods.ctrl !== undefined && mods.ctrl && !ev.ctrlKey)
            || ((mods.ctrl == undefined || !mods.ctrl) && ev.ctrlKey)) return;
        if ((mods.alt !== undefined && mods.alt && !ev.altKey)
            || ((mods.alt == undefined || !mods.alt) && ev.altKey)) return;
        if ((mods.meta !== undefined && mods.meta && !ev.metaKey)
            || ((mods.meta == undefined || !mods.meta) && ev.metaKey)) return;
        // call given function
        f(ev);
        // still here? skip subsequent events (normally triggerd by the page)
        ev.cancelBubble = true;
        ev.stopImmediatePropagation();
    });
}

// click element n-times (default: 1)
function clickElement(selector, times = 1) {
    // recursive click function
    function clickItRec(s, i) {
        $(s)[0].click();
        if (i === undefined || i <= 1) {
            return; // stop it
        } else {
            clickItRec(s, i - 1); // recursive call
        }
    }
    clickItRec(selector, times); // click it
}


// register amazon tweaks
function amazonTweaksReg() {
    // auto skip intro/credits/ads
    const AMAZON_SEL_SKIP = `.skipElement, .countdown, .adSkipButton`;

    // control (click) function
    var amazonCtrl = (elements, event, times = 1, options = { autoplay: true }) => {
        // perform click(s)
        clickElement(elements[0], times);
    };

    // keys: n -> next episode
    bindKey(78, (e) => amazonCtrl($('div.nextTitleButton'), e));
    // keys: shift+left/right -> skip +/-1min
    bindKey(37, (e) => amazonCtrl($('div.fastSeekBack'), e, 6), { shift: true });
    bindKey(39, (e) => amazonCtrl($('div.fastSeekForward'), e, 6), { shift: true });
    // keys: ctrl+left/right -> skip +/-10min
    bindKey(37, (e) => amazonCtrl($('div.fastSeekBack'), e, 60), { ctrl: true });
    bindKey(39, (e) => amazonCtrl($('div.fastSeekForward'), e, 60), { ctrl: true });

    waitAndThrottle(AMAZON_SEL_SKIP, (e) => $(e).click(), 2000);
}


// register netflix tweaks
function netflixTweaksReg() {
    // auto skip intro/credits
    const NETFLIX_SEL_SKIP = `.skip-credits > a > span, .WatchNext-still-container`;

    // control (click) function
    var netflixCtrl = (elements, event, times = 1, options = { autoplay: true }) => {
        // perform click(s)
        clickElement(elements[0], times);
        // playback may be paused, in this case press "play" after 1sec delay
        if (options.autoplay !== undefined && options.autoplay)
            setTimeout(() => {
                var play = $('button.button-nfplayerPlay')[0];
                if (play !== undefined) play.click();
            }, 250);
        // TODO hide controls (auto pop-up)
    };

    // keys: n -> next episode
    bindKey(78, (e) => netflixCtrl($('button.button-nfplayerNextEpisode'), e));
    // keys: shift+left/right -> skip +/-1min
    bindKey(37, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 6), { shift: true });
    bindKey(39, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 6), { shift: true });
    // keys: ctrl+left/right -> skip +/-10min
    bindKey(37, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 60), { ctrl: true });
    bindKey(39, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 60), { ctrl: true });

    // wait for skip elements to appear, then skip
    waitAndThrottle(NETFLIX_SEL_SKIP, netflixCtrl, 5000);
}


// register tweaks depending on page
if (/amazon/.test(window.location.host)) { // Amazon prime video
    amazonTweaksReg();
} else if (/netflix/.test(window.location.host)) { // Netflix
    netflixTweaksReg();
}
