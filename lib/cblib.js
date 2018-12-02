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

    /* {{{ = STRINGS ========================================================== */

    /**
     * Capitalize the first char of the given string.
     *
     * str: a string
     * lowerRest: convert the remaining string to lowercase? default: false
     */
    cb.stringCapitalize = function (str, lowerRest = false) {
        return str && str.charAt(0).toUpperCase()
            + (lowerRest ? str.slice(1).toLowerCase() : str.slice(1));
    }


    // Calculate a hash code for the given string.
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


    /**
     * Shorten a string, considering spaces.
     *
     * str: a string
     * maxLength: maximum length of the resulting string, considering spaces
     * suffix: add suffix to the result, default: " ..." (not considered when
     *         calculating max length)
     *
     * Examples:
     * - stringShorten('This is a long string.', 12) -> 'This is a ...'
     * - stringShorten('This is a long string.', 12, '') -> 'This is a'
     * - stringShorten('This is a long string.', 100) -> 'This is a long string.'
     */
    cb.stringShorten = function (str, maxLength, suffix = " ...") {
        if (str === undefined) {
            return str;
        }
        if (maxLength === undefined || maxLength <= 0) {
            throw "maxLength must be > 0, invalid value: " + maxLength;
        }
        var trimStr = str.trim();
        if (trimStr.length > maxLength) {
            var maxStr = trimStr.substr(0, maxLength);
            var newStr = trimStr.substr(0, maxStr.lastIndexOf(" "));
            return newStr.trim() === "" ? maxStr : newStr + suffix;
        }
        return trimStr;
    }


    /**
     * Covert a given name to it's initials / shortened form.
     *
     * name: the name to be converted
     * options: {
     *   separator: separator string, separating first and last lame, default: "."
     *   firstLength: first name max length, default: 1 (initials only)
     *   lastLength: last name max length, default: 1 (initials only)
     *   toUpper: first char of first and last name to upper case and rest to lower? default: false
     *   reverse: reverse initials, default: false
     * }
     *
     * Notes:
     * - Comma and period [,.] will be stripped from the name
     * - Email domains @domain ... will be stripped from the name
     * - Function always assumes first name first, if input is "Last, First" or similar,
     *   consider using option { reverse: true }
     *
     * Examples:
     * - cb.nameToInitials("John Doe") -> "J.D"
     * - cb.nameToInitials("john.doe@bar.com", { toUpper:true }) -> "J.D"
     * - cb.nameToInitials("John Doe", { separator:", ", firstLength:1, lastLength:15 }) -> "Doe, J"
     * - cb.nameToInitials("Doe, John", { firstLength:1, lastLength:10, reverse:true}) -> "J.Doe"
     */
    cb.nameToInitials = function (name, options = {}) {
        // parse options
        var separator = (options.separator === undefined ? "." : options.separator);
        var firstLength = (options.firstLength === undefined ? 1 : options.firstLength);
        var lastLength = (options.lastLength === undefined ? 1 : options.lastLength);
        var toUpper = (options.toUpper === undefined ? false : options.toUpper);
        var reverse = (options.reverse === undefined ? false : options.reverse);
        // process name
        var nameClean = name.trim().replace(/@.*/, "").replace(/[,. ]+/, " ");
        var nameParts = nameClean.split(" ");
        var nameFirst = toUpper ? cb.stringCapitalize(nameParts[0], true) : nameParts[0];
        var nameLast = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");
        if (toUpper) {
            nameLast = cb.stringCapitalize(nameLast, true);
        }
        // return result
        if (reverse) {
            return (nameLast !== "" ? nameLast.substr(0, lastLength) + separator : "")
                + nameFirst.substr(0, firstLength);
        }
        return nameFirst.substr(0, firstLength)
            + (nameLast !== "" ? separator + nameLast.substr(0, lastLength) : "");
    }

    /* }}} = STRINGS ========================================================== */


    /* {{{ = JQUERY =========================================================== */

    /**
     * Find all inner text-nodes.
     *
     * source: https://stackoverflow.com/questions/298750/how-do-i-select-text-nodes-with-jquery
     */
    cb.findTextNodes = function (query) {
        return $(query).find(":not(iframe)").addBack().contents()
            .filter(() => this.nodeType == 3);
    };

    /* }}} = JQUERY =========================================================== */


    /* {{{ = EVENTS =========================================================== */

    /* {{{ - KEY EVENTS ------------------------------------------------------- */

    /**
     * Create key-binding.
     *
     * e: event
     * keyCode: key code
     * f: function, if function returns true then disable page's own binding
     * mods: mod keys {
     *   shift: shift mod key must be pressed?, default: false
     *   ctrl: control mod key must be pressed?, default: false
     *   alt: alt mod key must be pressed?, default: false
     *   meta: meta mod key must be pressed?, default: false
     * }
     */
    function _bindKey(e, keyCode, f, mods = {}) {
        var event = e || window.event;
        function _required(m) { return m !== undefined && m; }
        function _notRequired(m) { return m === undefined && !m; }
        // keyCode pressed?
        if ((event.keyCode || event.which) != keyCode) return;
        // any meta key expected but not pressed OR not expected but pressed? -> return
        if ((_required(mods.shift) && !event.shiftKey)
            || (_notRequired(mods.shift) && event.shiftKey)) return;
        if ((_required(mods.ctrl) && !event.ctrlKey)
            || (_notRequired(mods.ctrl) && event.ctrlKey)) return;
        if ((_required(mods.alt) && !event.altKey)
            || (_notRequired(mods.alt) && event.altKey)) return;
        if ((_required(mods.meta) && !event.metaKey)
            || (_notRequired(mods.meta) && event.metaKey)) return;
        // call given function
        if (f(event)) {
            // still here? skip subsequent events (normally triggerd by the page)
            event.cancelBubble = true;
            event.stopImmediatePropagation();
        }
    }

    // register new keydown binding, see _bindKey for argument details
    cb.bindKeyDown = function (keyCode, f, mods = {}) {
        $(document).keydown(e => _bindKey(e, keyCode, f, mods));
    }

    // register new keyup binding, see _bindKey for argument details
    cb.bindKeyUp = function (keyCode, f, mods = {}) {
        $(document).keyup(e => _bindKey(e, keyCode, f, mods));
    }

    /* }}} - KEY EVENTS ------------------------------------------------------- */

    /* {{{ - MOUSE EVENTS ----------------------------------------------------- */

    // click element(s) n-times (default: 1)
    cb.clickElement = function (query, times = 1) {
        // recursive click function
        function _clickItRec(e, i) {
            e.click();
            if (i === undefined || i <= 1) {
                return; // stop it
            } else {
                _clickItRec(e, i - 1); // recursive call
            }
        }
        // click element(s) n-times

        $(query).each((i, e) => _clickItRec($(e), times)); // click
    }

    /* }}} - MOUSE EVENTS ----------------------------------------------------- */

    /* {{{ - WAIT FOR ELEMENT ------------------------------------------------- */

    // wait for element(s) to appear then call f using _.throttle
    cb.waitAndThrottle = function (query, f, wait = 200, options = {}) {
        waitForKeyElements(query, _.throttle(f, wait, options));
    }


    // wait for element(s) to appear then call f using _.debounce
    cb.waitAndDebounce = function (query, f, wait = 200, immediate = false) {
        waitForKeyElements(query, _.debounce(f, wait, immediate));
    }

    /* }}} - WAIT FOR ELEMENT ------------------------------------------------- */

    /* }}} = EVENTS =========================================================== */

}(window.cb = window.cb || {}, jQuery, _));
