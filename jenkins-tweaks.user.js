// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Jenkins Tweaks
// @version     0.1.3
// @description Some tweaks for various streaming sites
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/jenkins-tweaks.user.js
//
// @include     /^https?://build\.[^/]*/build//
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    // Search and replace + highlight the given patterns in the jenkins job console output
    const SEL_CONSOLE = "pre.console-output," // job console selector (static)
                        + "pre.console-output > pre:not(.cbSubstituteTextWithCSS)"; // active console, auto update
    const SEL_CONSOLE_BO = "div.test-console, div.log-body," // blue ocean console (static)
                           + "div.log-boxes > span.line:not(.cbSubstituteTextWithCSS)"; // active console, auto update
    const SEL_LOG_BO = "body > pre"; // blue ocean stplain log file view
    const CONSOLE_SUBSTITUTION = [[SEL_CONSOLE + ", " + SEL_CONSOLE_BO, [
        // test progress
        [/(\(0 Failed for now\))/g, "$1", { "color": "cornflowerblue" }],
        [/(\([1-9][0-9]* Failed for now\))/g, "$1", { "color": "red" }],
        // errors, warnings, exceptions, ignoring positive test progress "(0 failed"
        [/(?<=^|[ \[\n\r])(error|(<!\(0 )fail(?:ure|ed)?|abort(?:ed)?)(?=[ \]\n\r!.]|$)/gi, "$1", { "color": "red", "font-weight": "bold" }],
        [/(?<=^|[ .\n\r])(\w*(?:exception|error|Caused by:))(?=[ :\n\r!.]|$)/gi, "$1", { "color": "red", "font-weight": "bold" }],
        [/(?<=^|[ \[\n\r])(warn(?:ing)?|unstable|skip(?:ed|ping)?)(?=[ \]\n\r!.]|$)/gi, "$1", { "color": "#FFC000", "font-weight": "bold" }],
        // unit test summary
        [/((?:errors|failures): [1-9][0-9]*)/gi, "$1", { "color": "red", "font-weight": "bold" }],
        [/((?:skipped): [1-9][0-9]*)/gi, "$1", { "color": "#FFC000", "font-weight": "bold" }],
        [/(?<=^| )(success)(?=[ \n\r]|$)/gi, "$1", { "color": "limegreen", "font-weight": "bold" }]]
    ]];

    /* }}} -- CONSOLE HIGHLIGHTING -------------------------------------------- */
    // job console output
    var subsituteConsoleText = function (s) {
        cb.substituteTextWithCSS(CONSOLE_SUBSTITUTION);
        // quick fix: mark ALL selected elements as processed, ignore regularly updated ones in selectors
        $(s).addClass('cbSubstituteTextWithCSS');
    }

    if (/\/blue\/.*\/(pipeline|tests)(\/|$)/.test(window.location.pathname)) { // blue ocean pipeline / test results
        cb.waitAndThrottle(SEL_CONSOLE_BO, _.debounce(() => subsituteConsoleText(SEL_CONSOLE_BO), 1000));
    } else if (/\/blue\/.*\/log\//.test(window.location.pathname)) { // blue ocean plain log file view
        cb.waitAndThrottle(SEL_LOG_BO, _.debounce(() => subsituteConsoleText(SEL_LOG_BO), 1000));
    } else if (/\/console(Full)?(\/|$)/.test(window.location.pathname)) { // job console log
        cb.waitAndThrottle(SEL_CONSOLE, _.debounce(() => subsituteConsoleText(SEL_CONSOLE), 1000));
    }
    /* {{{ -- CONSOLE HIGHLIGHTING -------------------------------------------- */

}());
