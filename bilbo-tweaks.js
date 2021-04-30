// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021+, userscript@cbaoth.de
//
// @name        Bilbo Tweaks
// @version     0.1
// @description Some improvments to bilbo time tracking
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/bilbo-tweaks.user.js
//
// @include     /^https?://bilbo.[begrsu]{9}.de/
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    // https://www.w3schools.com/howto/howto_js_scroll_to_top.asp
    //function scrollToTop() {
    //    document.body.scrollTop = 0; // For Safari
    //    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
    //}

    // https://stackoverflow.com/a/41421759/7393995
    function selectOptionAsync(e, value) {
        e[0].dispatchEvent(new Event("click"));
        e.val(value);
        e[0].dispatchEvent(new Event("change"));
    }

    // apply page specific tweaks
    if (/bilbo\/showMyProjects.do(\?.*)?$/.test(window.location.pathname)) { // project list
        // change default "max items per page" value from 20 to 100
        waitForKeyElements("div#controls select", (e) => selectOption(e, 100));
        //sorter.size(100); // actually change the size
        //scrollToTop(); // scroll to top (since size change scrolls down)
    } else if (/bilbo\/reportActivity.do(\?.*)?$/.test(window.location.pathname)) { // report activity
        // change default type from "Work" to "Work From Home"
        waitForKeyElements("table#activityTable select[name='type']:has(option[value='W'])", (e) => selectOptionAsync(e, 'WHO'));
    }
})();
