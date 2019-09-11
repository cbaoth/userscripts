// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        My user script JS library
// @version     0.1.3
// @description Some common functions used in user scripts
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js

/**
 * Important:
 * - The above mentioned @required dependencies must be available for
 *   most functions to work.
 * - They must be loaded BEFORE this lib (add this lib as last requirement)
 */

(function (cb, $, _, undefined) {

    /* {{{ = GENERAL ========================================================== */

    /**
     * Return val if non-null else return default.
     */
    cb.nvl = function (val, def) {
        return (val === undefined || val === null) ? def : val;
    };

    /* }}} = GENERAL ========================================================== */


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
    };


    // Calculate a hash code for the given string.
    // source: https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    cb.stringHash = function (str) {
        var hash = 0, i, chr;
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    };


    // Escape HTML in given string
    cb.stringEscape = function (str) {
        return $('<p>').text(str).html();
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
    };


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
        var separator = cb.nvl(options.separator, ".");
        var firstLength = cb.nvl(options.firstLength, 1);
        var lastLength = cb.nvl(options.lastLength, 1);
        var toUpper = cb.nvl(options.toUpper, false);
        var reverse = cb.nvl(options.reverse, false);
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
    };

    /* }}} = STRINGS ========================================================== */


    /* {{{ = CSS STYLES ======================================================= */

    /**
     * Convert an assoc list to a CSS style string.
     *
     * assoc: assoc list containing css styles, like
     *        { 'color': 'red', 'background': 'black' }
     * seloctor: a CSS seloctor
     *
     * Example:
     *   cb.assocToCSS({ 'color': 'red', 'background': 'black' }, 'div.foo, span.bar')
     *   => 'div.foo, span.bar { color: red; background: black; }'
     */
    cb.assocToCSS = function (assoc, selector) {
        var result = "";
        for (var key in assoc) {
            result += key + ': ' + assoc[key] + '; ';
        }
        return (selector === undefined || selector == '') ? result
            : (selector + ' { ' + result + ' } ');
    };


    /**
     * Inject CSS style(s) into the page.
     *
     * styles: either string in form of "selector { style(s); }" (one or many)
     *         or style(s) only with a single selector provided as second argument
     * selector: optional CSS selector(s), if styles doesn't contain one
     *
     * Examples:
     *   cb.addCSS('color: red; background: black;', 'div.foo, span.bar');
     *   cb.addCSS('div.foo, span.bar { color: red; background: black; }');
     */
    const CB_STYLE_TAG_ID = 'cb_css_styles';
    cb.addCSS = function (cssStyles, selector) {
        var styleTag = $('style#' + CB_STYLE_TAG_ID);
        if (styleTag.length <= 0) {
            styleTag = $('<style type="text/css" id="' + CB_STYLE_TAG_ID + '"></style>').appendTo('html > head');
        }
        var styles;
        if (selector === undefined || selector == "") {
            styles = cssStyles;
        } else {
            styles = selector + ' { ' + cssStyles + ' } ';
        }
        styleTag.text(styleTag.text() + ' ' + styles + '\n');
    };


    /**
     * Inject a selector + CSS style(s) into the page.
     *
     * cssAssoc: an assoc list containing the CSS styles
     * selector: CSS selector(s)
     *
     * Example:
     *   cb.addCSSAssoc('div.foo, span.bar', {'color': 'red', 'background': 'black'});
     */
    cb.addCSSAssoc = function (cssAssoc, selector) {
        addCSS(cb.assocToCSS(cssAssoc, selector));
    };


    /* }}} = CSS STYLES ======================================================= */


    /* {{{ = JQUERY =========================================================== */

    /**
     * Find all inner text-nodes.
     *
     * source: https://stackoverflow.com/questions/298750/how-do-i-select-text-nodes-with-jquery
     */
    cb.findTextNodes = function (query) {
        return $(query).find(":not(iframe)").addBack().contents().filter(function () { return this.nodeType == 3; });
    };


    /**
     * Adds CSS styles to all selected elements containing the given text (regex match).
     *
     * arrays:
     *  [<selector>,        [i,0]      - match elements
     *   [                  [i,1]      - multiple patterns per selector are supported
     *    [<pattern>,       [i,1,j,0]  - match regex pattern within the selected element's inner text
     *     {css}], ...j+1   [i,1,j,2]  - css styles applied to all elements matching selector + pattern
     *   ], ...i+1
     *  ]
     *
     * Example:
     * # make (complete) div elements with class=foo containing text "foo bar" red
     * ["div.foo"
     *  [[ /foo bar/i, { "color": "red" } ]]]
     *    -> <div class="foo">Foo <b>bar</b> baz</div>
     *    => <div class="foo" style="color: red;">Foo <b>bar</b> baz</div>
     */
    var _findTextAddCSSClasses = []; // keep global state (don't inject repeatedly)
    cb.findTextAddCSS = function (arrays) {
        if (arrays === undefined) return;
        var cssStyleCode = "";
        $.each(arrays, (i1, selectorArray) => { // loop: selectors
            var selector = selectorArray[0];
            var patternArrays = selectorArray[1];
            $.each(patternArrays, (i2, patternArray) => { // loop: patterns
                var regex = patternArray[0];
                var cssStyle = patternArray[1];
                var cssClass = "findTextAddCSS_" + cb.stringHash(selector + regex);
                // add css class to all elements with a matching text
                $(selector).filter(function () { return regex.test($(this).text()) }).addClass(cssClass);
                // append css to global css style if not yet added
                if (!_findTextAddCSSClasses.includes(cssClass)) {
                    cssStyleCode += cb.assocToCSS(cssStyle, '.' + cssClass);
                    _findTextAddCSSClasses.push(cssClass);
                }
            });
        });
        // inject global css style(s) if non-empty
        if (cssStyleCode != "") {
            $('html > head').append('<style type="text/css">' + cssStyleCode + '</style>');
        }
    };

    /**
     * Substitute texts and inject CSS styles by wrapping text in spans.
     *
     * arrays: a multi dimensional array in the following format
     *  [<selector>,       [i,0]      - match elements
     *   [                 [i,1]      - multiple patterns per selector are supported
     *    [<regexPattern>, [i,1,j,0]  - match regex pattern within the selected element's inner text
     *     <regexSubst>,   [i,1,j,1]  - substitution text
     *     {css}], ...j+1  [i,1,j,2]  - css styles applied to the substituted text
     *   ], ...i+1
     *  ]
     * options: {
     *   fullTextMustMatch: match selected elements inner text first, default: false
     *       if true the processing might be more efficient (no search for individual
     *       text elements if inner text doesn't match) but ^ and $ may not work as
     *       expected since inner text could contain html.
     * }
     *
     * Notes:
     * - Any sub-element of the <selector> will be searched for the given regex <pattern>
     * - To simplify things the regex <pattern> must match a single text-only node
     *   meaning html content is omitted, e.g. /foo bar/ would not match "foo <b>bar</b>"
     *   due to it's html content, but /foo/ and /bar/ would match individually.
     *
     * Examples:
     * # make all text fragments starting with "b", including all following non-space characters, red and add a "!" at the end
     * ["div.foo"
     *  [[ /(b[^ ]+)/, "$1!", { "color": "red" } ]]]
     *    -> <div class="foo">Foo bar baz</div>
     *    => <div class="foo">Foo <span style="color: red;">bar!</span> <span style="color: red;">baz!</span></div>
     *
     *    -> <div class="foo">Foo ra<b>b</b>az</div></div>
     *    => <div class="foo">Foo ra<b><span style="color: red;">b</span></b>az</div></div>
     *       # only "b" matches, not "baz" due to the intermitted "b" tags
     *       # text of <b> is matched, not inner text of selected div
     */
    var _substituteTextWithCSSClasses = []; // keep global state (don't inject repeatedly)
    cb.substituteTextWithCSS = function (arrays, options = {}) {
        if (arrays === undefined) return;
        var fullTextMustMatch = cb.nvl(options.fullTextMustMatch, false);
        var cssStyleCode = "";
        $.each(arrays, (i1, selectorArray) => { // loop: selector
            var selector = selectorArray[0];
            var patternArrays = selectorArray[1];
            $(selector).each((i2, element) => { // loop: matching elements
                $.each(patternArrays, (i3, patternArray) => { // loop: substitutions for current selector
                    var regex = patternArray[0];
                    // check if the inner text of the whole selection matches
                    if (fullTextMustMatch && !regex.test($(element).text())) {
                        return; // no match, skip this iteration
                    }
                    // text content does match
                    var regexSubst = patternArray[1];
                    var cssStyle = patternArray[2];
                    var cssClass = "substituteTextWithCSS_" + cb.stringHash(selector + regex);
                    var spanHTML = '<span class="' + cssClass + '">' + regexSubst + '</span>';
                    // replace text node with substitution wrapped in span
                    cb.findTextNodes($(element)).each((i4, e) => {
                        // replace only if parent is not already span with same class
                        // (from earlier execution), we don't want to add additional
                        // spans with every repeated execution
                        if (!$(e).parent().hasClass(cssClass)) {
                            $(e).replaceWith($(e).text().replace(regex, spanHTML));
                        }
                    });
                    // append css to global css style if not yet added
                    if (!_substituteTextWithCSSClasses.includes(cssClass)) {
                        cssStyleCode += cb.assocToCSS(cssStyle, 'span.' + cssClass);
                        _substituteTextWithCSSClasses.push(cssClass);
                    }
                });
            });
        });
        // inject global css style(s) if non-empty
        if (cssStyleCode != "") {
            $('html > head').append('<style type="text/css">' + cssStyleCode + '</style>');
        }
    };
    /* }}} = JQUERY =========================================================== */


    /* {{{ = EVENTS =========================================================== */

    /* {{{ - KEY EVENTS ------------------------------------------------------- */

    /**
     * Check if key event would affect focused input field / editable content.
     *
     * Should be tested at least for key bindings that use no mod / shift only.
     *
     * e: key event
     */
    function _isKeyEventEditableContent(e) {
        return $(e.target).is(':input, [contenteditable]');
    }

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
     *   skipEditable: skip key event in editable context, default: false
     * }
     */
    function _bindKey(e, keyCode, f, mods = {}, skipEditable=false) {
        var event = e || window.event;
        if (skipEditable && _isKeyEventEditableContent(event)) {
            return; // skip, we seem to be in an input field / editable content
        }
        function _required(m) { return m !== undefined && m; }
        function _notRequired(m) { return m === undefined || !m; }
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
    cb.bindKeyDown = function (keyCode, f, mods = {}, skipEditable=false) {
        $(document).keydown(e => _bindKey(e, keyCode, f, mods, skipEditable));
    };

    // register new keyup binding, see _bindKey for argument details
    cb.bindKeyUp = function (keyCode, f, mods = {}, skipEditable=false) {
        $(document).keyup(e => _bindKey(e, keyCode, f, mods, skipEditable));
    };

    /* }}} - KEY EVENTS ------------------------------------------------------- */

    /* {{{ - MOUSE EVENTS ----------------------------------------------------- */

    /**
     * Constantly track the mouse poiter position (private).
     */
    var cbMouseX = 0;
    var cbMouseY = 0;
    $('body').mousemove((event) => {
        cbMouseX = event.pageX - document.body.scrollLeft;
        cbMouseY = event.pageY - document.body.scrollTop;
    });


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
    };

    /* }}} - MOUSE EVENTS ----------------------------------------------------- */

    /* {{{ - WAIT FOR ELEMENT ------------------------------------------------- */

    // wait for element(s) to appear then call f using _.throttle
    cb.waitAndThrottle = function (query, f, wait = 200, options = {}) {
        waitForKeyElements(query, _.throttle(f, wait, options));
    };


    // wait for element(s) to appear then call f using _.debounce
    cb.waitAndDebounce = function (query, f, wait = 200, immediate = false) {
        waitForKeyElements(query, _.debounce(f, wait, immediate));
    };

    /* }}} - WAIT FOR ELEMENT ------------------------------------------------- */

    /* }}} = EVENTS =========================================================== */


    /* {{{ = COMPONENTS ======================================================= */

    /**
     * Create a tooltip at the current mouse pointer position.
     *
     * html: tooltip html / text
     * timeout: timeout in ms after which the tootlip should vanish
     *          a value <= 0 disables the timout (stays indefinitely)
     * options:
     *   offsetX: +/- x px tooltip offset from mouse pointer, default: 10
     *   offsetY: +/- y px tooltip offset from mouse pointer, default: 10
     *   fadeoutTime: fade out time in ms, <= 0 for none, default: 1000
     *   cssClass: set a css class for the tooltip <div>, default: cb_createMouseTT
     *        changing the class to will remove the default style, except for
     *        element styles like positioning, click-through and cursor style
     * }
     *
     * returns the tooltip <div> (jQuery object)
     *
     * When a tooltip is created, a potentially existing predecessor is removed.
     *
     * Example:
     *   createMouseTT('TEST', 3000, { offsetX: 10, offsetY: 10,
     *     css:{color: 'red', background: 'white', border: '2px solid red'}});
     */
    var _createMouseTTStyleInjected = false;
    var _createMouseTTLastTT;
    cb.createMouseTT = function (html, timeout, options = {}) {
        // parse arguments
        var timeout_ms = cb.nvl(timeout, -1);
        //var css = cb.nvl(options.css, {});
        var offsetX = cb.nvl(options.offsetX, 10);
        var offsetY = cb.nvl(options.offsetY, 10);
        var fadeoutTime = cb.nvl(options.fadeoutTime, 1000);
        var cssClass = cb.nvl(options.cssClass, 'cb_createMouseTT');

        // inject default style, if not already done and no custom class is set
        if (cssClass == 'cb_createMouseTT' && !_createMouseTTStyleInjected) {
            createMouseTTAddDefaultStyle();
            _createMouseTTStyleInjected = true;
        }

        // create tt div
        var div = $('<div class="cb_createMouseTT">' + html + '</div>');
        div.css({
            position: 'absolute', display: 'block', 'z-index': 9999,
            left: cbMouseX + offsetX, top: cbMouseY + offsetY,
            cursor: 'default', 'pointer_events': 'none'
        });
        //div.css(css);

        // show tt and keep it locked to mouse pointer position
        function _tomouse(event) {
            div.css({ left: cbMouseX + offsetX, top: cbMouseY + offsetY });
        }
        $('body').mousemove(_tomouse);

        // delete previous tooltip (if still existing)
        if (_createMouseTTLastTT !== undefined && _createMouseTTLastTT.length > 0) {
            _createMouseTTLastTT.remove();
        }
        div.appendTo('body'); // show it
        _createMouseTTLastTT = div;

        // create auto hide time (if timeout > 0)
        if (timeout_ms > 0) {
            setTimeout(() => div.fadeOut(fadeoutTime, () => div.remove()), timeout_ms);
        }
        return div;
    };


    // inject default mouse tooltip style
    function createMouseTTAddDefaultStyle() {
        cb.addCSS(`div.cb_createMouseTT {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px; /* 0.85em; */
            font-weight: bold;
            background-color: black;
            color: #fff;
            text-align: center;
            padding: 4px 8px; /* 0.2em 0.4em; */
            border-radius: 6px;
        }`)
    }

    /* }}} = COMPONENTS ======================================================= */


}(window.cb = window.cb || {}, jQuery, _));
