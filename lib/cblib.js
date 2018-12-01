// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        My user script JS library
// @version     0.1.0
// @description Some common functions used in user scripts
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js

/**
 * Important: The above mentioned @required dependencies must be available for
 * most functions to work.
 */

(function (cb, $, _, undefined) {

    // calculate a hash code for the given string
    // source: https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    cb.stringHash = function (s) {
        var hash = 0, i, chr;
        if (s.length === 0) return hash;
        for (i = 0; i < ss.length; i++) {
            chr = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    };


    // find all inner text-nodes
    // source: https://stackoverflow.com/questions/298750/how-do-i-select-text-nodes-with-jquery
    cb.findTextNodes = function (e) {
        return $(e).find(":not(iframe)").addBack().contents().filter(function () {
            return this.nodeType == 3;
        });
    };


    // wait for element(s) to appear then call function no more than once within the given wait period
    cb.waitAndThrottle = function (selector, f, wait = 200, options = { tailing: false }) {
        waitForKeyElements(selector, _.throttle(f, wait, options));
    }


    // register new key binding
    cb.bindKeyDown = function (keyCode, f, mods = { shift: false, ctrl: false, alt: false, meta: false }) {
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
    cb.clickElement = function (selector, times = 1) {
        // recursive click function
        function clickItRec(s, i) {
            var e = $(s)[0];
            if (e === undefined) return; // nothing to click
            e.click();
            if (i === undefined || i <= 1) {
                return; // stop it
            } else {
                clickItRec(s, i - 1); // recursive call
            }
        }
        clickItRec(selector, times); // click it
    }

}(window.cb = window.cb || {}, jQuery, _));
