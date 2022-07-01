// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021+, userscript@cbaoth.de
//
// @name        Search Hotkey
// @version     0.2
// @description Open / focus the search field via alt-f in some wikis, forums, etc.
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/search-hotkey.user.js
//
// @include     /^https?://\w+\.fandom.com/wiki/.*/
// @include     /^https?://\w+\.wikipedia.org/.*/
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

(function() {
    const KEYCODE_F = 70

    function focusInput(selector) {
        var e = $(selector);
        e.focus();
        // TODO window.scrollTo(x, y);
    }

    if (/fandom/.test(window.location.host)) { // fandom wikis
        cb.bindKeyDown(KEYCODE_F, () => $(`a.wds-button.wiki-tools__search`)[0].click(), { mods: { alt: true } });
    } else if (/wikipedia/.test(window.location.host)) { // wikipedia
        cb.bindKeyDown(KEYCODE_F, () => focusInput(`input#searchInput`), { mods: { alt: true } });
    }
})();
