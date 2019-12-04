// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2019+, userscript@cbaoth.de
//
// @name        Image Search Tweaks
// @version     0.1
// @description Some tweaks for Google and Yandex Image Search
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/image-search-tweaks.user.js
//
// @include     //https://www.pinterest.de/search/pins/?*q=*
// @include     //https://www.pinterest.com/search/pins/?*q=*
// @include     https://www.google.com/search*tbm=isch*
// @include     https://www.google.de/search*tbm=isch*
// @include     https://yandex.ru/images/search*
// @include     https://yandex.com/images/search*
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function() {

    const KEY_S = 82;

    function shuffleResult(rootSelector, childSelector) {
        var root = $(rootSelector);
        var elements = root.children();
        while (elements.length) {
            root.append(elements.splice(Math.floor(Math.random() * elements.length), 1)[0]);
        }
    }

    // add hotkeys
    //if (/pinterest/.test(window.location.hostname)) {
    //    cb.bindKeyDown(KEY_S, () => shuffleResult('.gridCentered div div div', 'div'), { mods: { alt: true }, skipEditable: true });
    if (/google/.test(window.location.hostname)) {
        cb.bindKeyDown(KEY_S, () => shuffleResult('div[data-async-rclass="search"]', 'div'), { mods: { alt: true }, skipEditable: true });
    } else if (/yandex/.test(window.location.hostname)) {
        cb.bindKeyDown(KEY_S, () => shuffleResult('div.serp-list', 'div'), { mods: { alt: true }, skipEditable: true });
    }

})();
