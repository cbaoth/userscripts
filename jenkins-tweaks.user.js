// ==UserScript==
// @name        Jenkins Tweaks
// @namespace   https://cbaoth.de
// @version     0.1
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/jenkins-tweaks.user.js
// @description Some tweaks for various streaming sites
//
// Change URL as needed
// @include     /^https?://build\.[^/]*/build//
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

/* TODO
 * - move common utility code to library
 */

/* Search and replace + highlight the given patterns in the jenkins job console output
 */
const CONSOLE_SUBSTITUTION = [[ 'pre.console-output',
                               [[ /(?<=^|[ \[])(error)(?=[ \]]|$)/gi, "$1", { "color": "red", "font-weight": "bold" } ],
                                [ /(?<=^|[ \[])(warn(?:ing)?)(?=[ \]]|$)/gi, "$1", { "color": "darkorange", "font-weight": "bold" } ],
                                [ /(?<=^|[ .])(\w*exception|\w*error)(?=[ :]|$)/gi, "$1", { "color": "red", "font-weight": "bold" } ]]
                             ]];

/* {{{ -- UTILITIES ------------------------------------------------------- */
// calculate a hash code for this string
// source: https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
String.prototype.cbHashCode = function () {
    var hash = 0, i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
        chr = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

// find all inner text-nodes
// source: https://stackoverflow.com/questions/298750/how-do-i-select-text-nodes-with-jquery
function cbFindTextNodes(e) {
    return $(e).find(":not(iframe)").addBack().contents().filter(function () {
        return this.nodeType == 3;
    });
};
/* }}} -- UTILITIES ------------------------------------------------------- */

/* }}} -- CONSOLE --------------------------------------------------------- */
// job console output
if (/\/console(Full)?(\/|$)/.test(window.location.pathname)) {
    function logSobsitutions() {
        // -- TEXT SUBSTITUTION --------------------------------------------------
        for (var tsIdxSel in CONSOLE_SUBSTITUTION) {//debugger; // loop: selectors
            var tsSelector = CONSOLE_SUBSTITUTION[tsIdxSel][0];
            jQuery.each($(tsSelector), function (i, e) {//debugger; // loop: selected elements
                for (var tsIdxSub in CONSOLE_SUBSTITUTION[tsIdxSel][1]) {//debugger; // loop: substitutions
                    var tsPattern = CONSOLE_SUBSTITUTION[tsIdxSel][1][tsIdxSub][0];
                    // check if the text of the whole selection matches (limitation, but more efficient)
                    if (!tsPattern.test($(e).text())) {
                        continue; // no match
                    }
                    // text content does match
                    var tsSubstitution = CONSOLE_SUBSTITUTION[tsIdxSel][1][tsIdxSub][1];
                    var tsCSS = CONSOLE_SUBSTITUTION[tsIdxSel][1][tsIdxSub][2];
                    var tsSpanClass = "optsnode_" + (tsSelector + tsPattern).cbHashCode();
                    var tsSubSpan = '<span class="' + tsSpanClass + '">' + tsSubstitution + '</span>';
                    // replace text node with substitution wrapped in span
                    cbFindTextNodes($(e)).each(function (it, et) {
                        // replace only if parent is not already span with same id, e.g. from earlier execution
                        // we don't want to add additional spans with every repeated execution
                        if (!$(et).parent().hasClass(tsSpanClass)) {
                            $(et).replaceWith($(et).text().replace(tsPattern, tsSubSpan));
                        }
                    });
                    //GM_addStyle('span.' + tsSpanClass + ... tsCSS ...); // TODO maybe add global style
                    $(e).find("." + tsSpanClass).css(tsCSS);
                }
            });
        }
    }
    waitForKeyElements("pre.console-output", _.debounce(logSobsitutions, 200));
}
/* {{{ -- CONSOLE --------------------------------------------------------- */
