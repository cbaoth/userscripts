// ==UserScript==
// @name        Streaming Tweaks
// @namespace   https://cbaoth.de
// @version     0.1.2
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


// register amazon tweaks
function amazonTweaksReg() {
    // skip intro/credits/ads
    const AMAZON_SEL_SKIP = `.skipElement, .countdown, .adSkipButton`;
    waitAndThrottle(AMAZON_SEL_SKIP, (e) => $(e).click(), 2000);
}


// register netflix tweaks
function netflixTweaksReg() {
    // skip intro/credits
    const NETFLIX_SEL_SKIP = `.skip-credits > a > span, .WatchNext-still-container`;
    var netflixSkip = (e) => {
        $(e)[0].click();
        // playback may be paused, in this case press "play" after 1sec delay
        setTimeout(() => $("button.button-nfplayerPlay")[0].click(), 1000);
    };
    waitAndThrottle(NETFLIX_SEL_SKIP, netflixSkip, 5000);
}


// register tweaks depending on page
if (/amazon/.test(window.location.host)) { // Amazon prime video
    amazonTweaksReg();
} else if (/netflix/.test(window.location.host)) { // Netflix
    netflixTweaksReg();
}
