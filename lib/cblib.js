// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        My user script JS library
// @version     0.1.5
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
    //import $, { each } from "jquery";

    /* {{{ = GENERAL ========================================================== */

    /**
     * Return either the given value or the default in case the value is `undefined` or `null`.
     *
     * @param {any} val - Any value.
     * @param {any} def - The default value in case `val` is `undefined` or `null`.
     * @returns `val` if non-null else `dev`.
     */
    cb.nvl = function (val, def) {
        return val === undefined || val === null ? def : val;
    };

    /* }}} = GENERAL ========================================================== */

    /* {{{ = STRINGS ========================================================== */

    /**
     * Capitalize the first char of the given string.
     *
     * @param {string} str - A string.
     * @param {boolean} [lowerRest=false] - Convert the remaining string to lowercase?
     * @returns {string} The capitalized string.
     */
    cb.stringCapitalize = function (str, lowerRest = false) {
        return (
            str &&
            str.charAt(0).toUpperCase() +
            (lowerRest ? str.slice(1).toLowerCase() : str.slice(1))
        );
    };

    /**
     * Calculate a hash code for the given string.
     *
     * @param {string} str - A string.
     * @returns {string} The string's hash value.
     *
     * @see https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
     */
    cb.stringHash = function (str) {
        var hash = 0;
        var i;
        var chr;
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    };


    /**
     * Escape HTML code in given string.
     *
     * @param {string} str - A string.
     * @returns {string} The string with escaped HTML code.
     */
    cb.stringEscape = function (str) {
        return $("<p>")
            .text(str)
            .html();
    };


    /**
     * Shorten a string, considering spaces.
     *
     * @param {string} str - A string.
     * @param {number} maxLength - Maximum length of the resulting string, considering spaces.
     * @param {string} [suffix=...] - The suffix to append to the result (not considered when calculating max length).
     * @returns {string} The shortened string.
     *
     * @example
     * cb.stringShorten('This is a long string.', 12)
     * -> 'This is a ...'
     * cb.stringShorten('This is a long string.', 12, '')
     * -> 'This is a'
     * cb.stringShorten('This is a long string.', 100)
     * -> 'This is a long string.'
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
     * @param {string} name - A name.
     * @param {Object} obj - An object.
     * @param {string} [obj.separator=.] - Separator string, separating first and last lame.
     * @param {number} [obj.firstLength=1] - First name max length (initials only).
     * @param {number} [obj.lastLength=1] - Last name max length (initials only).
     * @param {boolean} [obj.toUpper=false] - First char of first and last name to upper case and rest to lower?
     * @param {boolean} [obj.reverse=false] - Reverse initials?
     * @returns The name's initials.
     *
     * Notes:
     * * Comma and period `[,.]` will be stripped from the name
     * * Email domains `@{domain}` will be stripped from the name
     * * Function always assumes first name first, if input is "Last, First" or similar, consider using option { reverse: true }
     *
     * @example
     * cb.nameToInitials("John Doe")
     * -> "J.D"
     * cb.nameToInitials("john.doe@bar.com", { toUpper:true })
     * -> "J.D"
     * cb.nameToInitials("John Doe", { separator:", ", firstLength:1, lastLength:15 })
     * -> "Doe, J"
     * cb.nameToInitials("Doe, John", { firstLength:1, lastLength:10, reverse:true})
     * -> "J.Doe"
     */
    cb.nameToInitials = function (
        name,
        { separator, firstLength, lastLength, toUpper, reverse } = {}
    ) {
        // parse options
        var _separator = cb.nvl(separator, ".");
        var _firstLength = cb.nvl(firstLength, 1);
        var _lastLength = cb.nvl(lastLength, 1);
        var _toUpper = cb.nvl(toUpper, false);
        var _reverse = cb.nvl(reverse, false);
        // process name
        var nameClean = name
            .trim()
            .replace(/@.*/, "")
            .replace(/[,. ]+/, " ");
        var nameParts = nameClean.split(" ");
        var nameFirst = _toUpper
            ? cb.stringCapitalize(nameParts[0], true)
            : nameParts[0];
        var nameLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
        if (_toUpper) {
            nameLast = cb.stringCapitalize(nameLast, true);
        }
        // return result
        if (_reverse) {
            return (
                (nameLast !== "" ? nameLast.substr(0, _lastLength) + _separator : "") +
                nameFirst.substr(0, _firstLength)
            );
        }
        return (
            nameFirst.substr(0, _firstLength) +
            (nameLast !== "" ? _separator + nameLast.substr(0, _lastLength) : "")
        );
    };

    /* }}} = STRINGS ========================================================== */

    /* {{{ = CSS STYLES ======================================================= */

    /**
     * Convert an assoc list of CSS styles to CSS style code.
     *
     * @param {Object} cssAssoc - An assoc list containing the CSS styles.
     * @param {string} selector - A CSS selector.
     * @retuns {string} The CSS code.
     *
     * @example
     * cb.assocToCSS({ 'color': 'red', 'background': 'black' }, 'div.foo, span.bar')
     * -> 'div.foo, span.bar { color: red; background: black; }'
     */
    cb.assocToCSS = function (cssAssoc, selector) {
        var result = "";
        for (var key in cssAssoc) {
            result += key + ": " + cssAssoc[key] + "; ";
        }
        return selector === undefined || selector == ""
            ? result
            : selector + " { " + result + " } ";
    };


    const CB_STYLE_TAG_ID = "cb_css_styles";

    /**
     * Inject CSS style(s) into the page.
     *
     * @param {string} styles - Either a string in form of `selector { style(s); }` (one or many) or style(s) only with a single selector provided as second argument.
     * @param {string} selector - A CSS selector.
     *
     * @example
     * cb.addCSS('color: red; background: black;', 'div.foo, span.bar');
     * cb.addCSS('div.foo, span.bar { color: red; background: black; }');
     */
    cb.addCSS = function (cssStyles, selector) {
        var styleTag = $("style#" + CB_STYLE_TAG_ID);
        if (styleTag.length <= 0) {
            styleTag = $(
                '<style type="text/css" id="' + CB_STYLE_TAG_ID + '"></style>'
            ).appendTo("html > head");
        }
        var styles;
        if (selector === undefined || selector == "") {
            styles = cssStyles;
        } else {
            styles = selector + " { " + cssStyles + " } ";
        }
        styleTag.text(styleTag.text() + " " + styles + "\n");
    };

    /**
     * Inject a selector + CSS style(s) into the page.
     *
     * @param {Object} cssAssoc - An assoc list containing the CSS styles.
     * @param {string} selector - A CSS selector.
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
     * @param {$|string} jQuery - A jquery or jquery selector string.
     * @returns {$} The jQuery search result.
     *
     * @see https://stackoverflow.com/questions/298750/how-do-i-select-text-nodes-with-jquery
     */
    cb.findTextNodes = function (jQuery) {
        return $(jQuery)
            .find(":not(iframe)")
            .addBack()
            .contents()
            .filter(function () {
                return this.nodeType == 3;
            });
    };


    var _findTextAddCSSClasses = []; // keep global state (don't inject repeatedly)

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
     * @example
     * # make (complete) div elements with class=foo containing text "foo bar" red
     * ["div.foo"
     *  [[ /foo bar/i, { "color": "red" } ]]]
     * -> <div class="foo">Foo <b>bar</b> baz</div>
     * => <div class="foo" style="color: red;">Foo <b>bar</b> baz</div>
     */
    cb.findTextAddCSS = function (arrays) {
        if (arrays === undefined) return;
        var cssStyleCode = "";
        $.each(arrays, (i1, selectorArray) => {
            // loop: selectors
            var selector = selectorArray[0];
            var patternArrays = selectorArray[1];
            $.each(patternArrays, (i2, patternArray) => {
                // loop: patterns
                var regex = patternArray[0];
                var cssStyle = patternArray[1];
                var cssClass = "findTextAddCSS_" + cb.stringHash(selector + regex);
                // add css class to all elements with a matching text
                $(selector)
                    .filter(function () {
                        return regex.test($(this).text());
                    })
                    .addClass(cssClass);
                // append css to global css style if not yet added
                if (!_findTextAddCSSClasses.includes(cssClass)) {
                    cssStyleCode += cb.assocToCSS(cssStyle, "." + cssClass);
                    _findTextAddCSSClasses.push(cssClass);
                }
            });
        });
        // inject global css style(s) if non-empty
        if (cssStyleCode != "") {
            $("html > head").append(
                '<style type="text/css">' + cssStyleCode + "</style>"
            );
        }
    };


    var _substituteTextWithCSSClasses = []; // keep global state (don't inject repeatedly)

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
     * * Any sub-element of the `<selector>` will be searched for the given regex <pattern>
     * * To simplify things the regex `<pattern>` must match a single text-only node meaning html content is omitted, e.g. `/foo bar/` would not match `foo <b>bar</b>` due to it's html content, but /foo/ and /bar/ would match individually.
     *
     * @example
     * # make all text fragments starting with "b", including all following non-space characters, red and add a "!" at the end
     * ["div.foo"
     *  [[ /(b[^ ]+)/, "$1!", { "color": "red" } ]]]
     * -> <div class="foo">Foo bar baz</div>
     * => <div class="foo">Foo <span style="color: red;">bar!</span> <span style="color: red;">baz!</span></div>
     * # and
     * -> <div class="foo">Foo ra<b>b</b>az</div></div>
     * => <div class="foo">Foo ra<b><span style="color: red;">b</span></b>az</div></div>
     * # only "b" matches, not "baz" due to the intermitted "b" tags
     * # text of <b> is matched, not inner text of selected div
     */
    cb.substituteTextWithCSS = function (arrays, { fullTextMustMatch } = { fullTextMustMatch: false }) {
        if (arrays === undefined) return;
        var cssStyleCode = "";
        $.each(arrays, (i1, selectorArray) => {
            // loop: selector
            var selector = selectorArray[0];
            var patternArrays = selectorArray[1];
            $(selector).each((i2, element) => {
                // loop: matching elements
                $.each(patternArrays, (i3, patternArray) => {
                    // loop: substitutions for current selector
                    var regex = patternArray[0];
                    // check if the inner text of the whole selection matches
                    if (fullTextMustMatch && !regex.test($(element).text())) {
                        return; // no match, skip this iteration
                    }
                    // text content does match
                    var regexSubst = patternArray[1];
                    var cssStyle = patternArray[2];
                    var cssClass =
                        "substituteTextWithCSS_" + cb.stringHash(selector + regex);
                    var spanHTML =
                        '<span class="' + cssClass + '">' + regexSubst + "</span>";
                    // replace text node with substitution wrapped in span
                    cb.findTextNodes($(element)).each((i4, e) => {
                        // replace only if parent is not already span with same class
                        // (from earlier execution), we don't want to add additional
                        // spans with every repeated execution
                        if (
                            !$(e)
                                .parent()
                                .hasClass(cssClass)
                        ) {
                            $(e).replaceWith(
                                $(e)
                                    .text()
                                    .replace(regex, spanHTML)
                            );
                        }
                    });
                    // append css to global css style if not yet added
                    if (!_substituteTextWithCSSClasses.includes(cssClass)) {
                        cssStyleCode += cb.assocToCSS(cssStyle, "span." + cssClass);
                        _substituteTextWithCSSClasses.push(cssClass);
                    }
                });
            });
        });
        // inject global css style(s) if non-empty
        if (cssStyleCode != "") {
            $("html > head").append(
                '<style type="text/css">' + cssStyleCode + "</style>"
            );
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
     * @param {Event} e - A key event.
     * @returns {boolean} Are we in an input context?
     */
    function _isKeyEventEditableContent(e) {
        return $(e.target).is(":input, [contenteditable]");
    }

    /**
     * Create a new key binding.
     *
     * @example $(document).keydown(e => _bindKey(e, (70, myFind, { mods: { ctrl:true }, preventDefault:true }))
     * @example $(document).keydown(e => _bindKey(e, (70, myFind, { skipEditable:true }))
     *
     * @param { number } keyCode - A key code.
     * @param { Function } f - The function to call when key binding is pressed.
     * @param { Object } obj - An object.
     * @param { Object } obj.mods - Mod keys state wrapper object.
     * @param { boolean } [obj.mods.shift=false] - Must the`shift` key be pressed?
     * @param { boolean } [obj.mods.alt=false] - Must the`alt` key be pressed?
     * @param { boolean } [obj.mods.meta=false] - Must the`meta` key be pressed?
     * @param { boolean } [obj.mods.ctrl=false] - Must the`control` key be pressed?
     * @param { boolean } [preventDefault=false] - Prevent`key` binding default action?
     * @param { boolean } [skipEditable=false] - Skip key event in editable context?
     * @returns { any } Result of`f` function call.
     */
    function _bindKey(
        e,
        keyCode,
        f, {
            mods: { shift = false, alt = false, meta = false, ctrl = false } = {},
            skipEditable = false,
            preventDefault = false
        } = {}) {
        var event = e || window.event;
        if (skipEditable && _isKeyEventEditableContent(event)) {
            return; // skip, we seem to be in an input field / editable content
        }
        function _required(m) {
            return m !== undefined && m;
        }
        function _notRequired(m) {
            return m === undefined || !m;
        }
        // keyCode pressed?
        if ((event.keyCode || event.which) != keyCode) return;
        // any meta key expected but not pressed OR not expected but pressed? -> return
        if (
            (_required(shift) && !event.shiftKey) ||
            (_notRequired(shift) && event.shiftKey)
        )
            return;
        if (
            (_required(ctrl) && !event.ctrlKey) ||
            (_notRequired(ctrl) && event.ctrlKey)
        )
            return;
        if (
            (_required(alt) && !event.altKey) ||
            (_notRequired(alt) && event.altKey)
        )
            return;
        if (
            (_required(meta) && !event.metaKey) ||
            (_notRequired(meta) && event.metaKey)
        )
            return;
        // prevent key binding default action
        if (preventDefault) {
            // still here? skip subsequent events (normally triggerd by the page)
            event.cancelBubble = true;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
        // call the function
        return f(event)
    }

    /**
     * Register a new `keyDown` key binding.
     *
     * @example cb.bindKeyDown(70, myFind, { mods: { ctrl:true }, preventDefault:true })
     * @example cb.bindKeyDown(70, myFind, { skipEditable:true })
     *
     * @param { number } keyCode - A key code.
     * @param { Function } f - The function to call when key binding is pressed.
     * @param { Object } obj - An object.
     * @param { Object } obj.mods - Mod keys state wrapper object.
     * @param { boolean } [obj.mods.shift=false] - Must the`shift` key be pressed?
     * @param { boolean } [obj.mods.alt=false] - Must the`alt` key be pressed?
     * @param { boolean } [obj.mods.meta=false] - Must the`meta` key be pressed?
     * @param { boolean } [obj.mods.ctrl=false] - Must the`control` key be pressed?
     * @param { boolean } [preventDefault=false] - Prevent`key` binding default action?
     * @param { boolean } [skipEditable=false] - Skip key event in editable context?
     * @returns { any } Result of`f` function call.
     */
    cb.bindKeyDown = function (keyCode, f, {
        mods: { shift = false, alt = false, meta = false, ctrl = false } = {},
        skipEditable = false,
        preventDefault = false
    } = {}) {
        $(document).keydown(e => _bindKey(e, keyCode, f, { mods: { shift, alt, meta, ctrl }, skipEditable, preventDefault }));
    };

    /**
     * Register a new `keyUp` key binding.
     *
     * @example cb.bindKeyUp(70, myFind, { mods: { ctrl:true }, preventDefault:true })
     * @example cb.bindKeyUp(70, myFind, { skipEditable:true })
     *
     * @param { number } keyCode - A key code.
     * @param { Function } f - The function to call when key binding is pressed.
     * @param { Object } obj - An object.
     * @param { Object } obj.mods - Mod keys state wrapper object.
     * @param { boolean } [obj.mods.shift=false] - Must the`shift` key be pressed?
     * @param { boolean } [obj.mods.alt=false] - Must the`alt` key be pressed?
     * @param { boolean } [obj.mods.meta=false] - Must the`meta` key be pressed?
     * @param { boolean } [obj.mods.ctrl=false] - Must the`control` key be pressed?
     * @param { boolean } [preventDefault=false] - Prevent`key` binding default action?
     * @param { boolean } [skipEditable=false] - Skip key event in editable context?
     * @returns { any } Result of`f` function call.
     */
    //{foo = 'Foo', bar: {quux = 'Quux', corge = 'Corge'} = {}}
    cb.bindKeyUp = function (keyCode, f, {
        mods: { shift = false, alt = false, meta = false, ctrl = false } = {},
        skipEditable = false,
        preventDefault = false
    } = {}) {
        $(document).keyup(e => _bindKey(e, keyCode, f, { mods: { shift, alt, meta, ctrl }, skipEditable, preventDefault }));
    };

    /* }}} - KEY EVENTS ------------------------------------------------------- */

    /* {{{ - MOUSE EVENTS ----------------------------------------------------- */

    var _cbMouseX = 0;
    var _cbMouseY = 0;

    /**
     * Constantly track the mouse poiter position (private).
     */
    $("body").mousemove(event => {
        _cbMouseX = event.pageX - document.body.scrollLeft;
        _cbMouseY = event.pageY - document.body.scrollTop;
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
    /**
     * Wait for element(s) to appear then call `f` using `_.throttle`.
     *
     * @param {$} jQuery - A JQuery.
     * @param {Function} f - The function to call in case the element appears.
     * @param {number} wait - Throttle time interval in ms.
     * @param {Object} options - An Object.
     * @param {boolean} [options.leading=false] - Disable execution on the leading edge.
     * @param {boolean} [options.trailing=false] - Disable execution on the trailing edge.
     */
    cb.waitAndThrottle = function (jQuery, f, wait = 200, options = {}) {
        waitForKeyElements(jQuery, _.throttle(f, wait, options));
    };

    /**
     * Wait for element(s) to appear then call `f` using `_.debounce`.
     *
     * @param {$} jQuery - A JQuery.
     * @param {Function} f - The function to call in case the element appears.
     * @param {number} wait - Throttle time interval in ms.
     * @param {Object} options - An Object.
     */
    cb.waitAndDebounce = function (jQuery, f, wait = 200, immediate = false) {
        waitForKeyElements(jQuery, _.debounce(f, wait, immediate));
    };

    /* }}} - WAIT FOR ELEMENT ------------------------------------------------- */

    /* }}} = EVENTS =========================================================== */

    /* {{{ = COMPONENTS ======================================================= */

    var _cbCreateMouseTTStyleInjected = false;
    var _cbCreateMouseTTLastTT;

    /**
     * Create a tooltip at the current mouse pointer position.
     *
     * @param {string} html - Tooltip html / text.
     * @param {number} timeout - Timeout in ms after which the tootlip should vanish. A value <= 0 disables the timout (stays indefinitely).
     * @param {Object} obj - An Object.
     * @param {number} [offsetX=10] - The tooltip's `x` offset from mouse pointer position in pixels.
     * @param {number} [offsetY=10] - The tooltip's `y` offset from mouse pointer position in pixels.
     * @param {number} [fadeoutTime=1000] - Fade out time in ms. A value <= 0 disables the timeout.
     * @param {string} [cssClass=cb_createMouseTT] - Set a css class for the tooltip `<div>`. Changing the class to will remove the default style, except for element styles like positioning, click-through and cursor style.
     * @returns {$} The tooltip's `<div>` (jQuery object)
     *
     * When a tooltip is created, a potentially existing predecessor is removed.
     *
     * @example cb.createMouseTT('TEST', 3000, { offsetX: 10, offsetY: 10,
     *                                           css:{ color: 'red',
     *                                                 background: 'white',
     *                                                 border: '2px solid red'}});
     */
    cb.createMouseTT = function (
        html, timeout,
        { offsetX, offsetY, fadeoutTime, cssClass } = { offsetX: 10, offsetY: 10, fadeoutTime: 1000, cssClass: "cb_createMouseTT" }
    ) {
        // parse arguments
        var timeout_ms = cb.nvl(timeout, -1);
        var _cssClass = cb.nvl(cssClass, "cb_createMouseTT");

        // inject default style, if not already done and no custom class is set
        if (_cssClass == "cb_createMouseTT" && !_cbCreateMouseTTStyleInjected) {
            createMouseTTAddDefaultStyle();
            _cbCreateMouseTTStyleInjected = true;
        }

        // create tt div
        var div = $('<div class="cb_createMouseTT">' + html + "</div>");
        div.css({
            position: "absolute",
            display: "block",
            "z-index": 9999,
            left: cbMouseX + offsetX,
            top: cbMouseY + offsetY,
            cursor: "default",
            pointer_events: "none"
        });
        //div.css(css);

        // show tt and keep it locked to mouse pointer position
        function _tomouse(event) {
            div.css({ left: cbMouseX + offsetX, top: cbMouseY + offsetY });
        }
        $("body").mousemove(_tomouse);

        // delete previous tooltip (if still existing)
        if (_cbCreateMouseTTLastTT !== undefined && _cbCreateMouseTTLastTT.length > 0) {
            _cbCreateMouseTTLastTT.remove();
        }
        div.appendTo("body"); // show it
        _cbCreateMouseTTLastTT = div;

        // create auto hide time (if timeout > 0)
        if (timeout_ms > 0) {
            setTimeout(
                () => div.fadeOut(fadeoutTime, () => div.remove()),
                timeout_ms
            );
        }
        return div;
    };

    /**
     * Inject the default mouse tooltip style.
     */
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
        }`);
    }

    /* }}} = COMPONENTS ======================================================= */
})((window.cb = window.cb || {}), jQuery, _);
