// ==UserScript==
// @name        Streaming Tweaks
// @namespace   https://cbaoth.de
// @version     0.1
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

if (/amazon/.test(window.location.host)) { // Amazon prime video
    // Auto skip: Intro, to next episode (credits), ads between episodes
    var amazonSelSkip = `.adSkipButton, .countdown`;
    function amazonVideoSkip() { $(amazonSelSkip).click(); }
    waitForKeyElements(amazonSelSkip, _.debounce(amazonVideoSkip, 200));
} else if (/netflix/.test(window.location.host)) { // Netflix
    // Auto skip: Intro, to next episode (credits)
    var netflixSelSkip = `.skip-credits > a > span, .WatchNext-still-container`;
    function netflixVideoSkip() { $(netflixSelSkip).click(); }
    waitForKeyElements(netflixSelSkip, _.debounce(netflixVideoSkip, 200));
}
