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

$ = jQuery = jQuery.noConflict(true);

/* Amazon prime video
 * Auto skip: Intro, to next episode (credits), ads between episodes
 */
if (/amazon/.test(window.location.host)) {
    var amazonSelSkip = `.adSkipButton, .countdown`;
    function amazonVideoSkip() { $(amazonSelSkip).click(); }
    waitForKeyElements(amazonSelSkip, _.debounce(amazonVideoSkip, 200));

/* Netflix
 * Auto skip: Intro, to next episode (credits)
 */
} else if (/netflix/.test(window.location.host)) {
    var netflixSelSkip = `.skip-credits > a > span, .WatchNext-still-container`;
    function netflixVideoSkip() { $(netflixSelSkip).click(); }
    waitForKeyElements(netflixSelSkip, _.debounce(netflixVideoSkip, 200));
}
