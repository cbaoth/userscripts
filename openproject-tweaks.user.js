// ==UserScript==
// @name OpenProject Tweaks
// @namespace https://cbaoth.de
// @version 0.1.2
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/openproject-tweaks.user.js
// @description Some tweaks for OpenProject
//
// @include /^https?://openproject\.[^/]+//
//
// @grant GM_addStyle
//
// @require http://code.jquery.com/jquery-latest.min.js
// @require https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
//
// @copyright 2018, dev@cbaoth.de
// ==/UserScript==

// prevent jQuery version conflicts (with page)
this.$ = this.jQuery = jQuery.noConflict(true);

/* {{{ -- SETTINGS / CONSTANTS -------------------------------------------- */
// show a counter in the top left corner indicating how many times opApplyTweaks
// was called, this can be helpful in determining which elements to watch for update
const DEBUG_ENABLE_COUNTER = false;

const MY_NAME = $('meta[name="current_user"]').attr("data-name"); // highlight this name

const ENABLE_WORKPACKAGES_TWEAKS = true; // enable tweaks in issue list (+gantt) and details screen
const ENABLE_BACKLOG_TWEAKS = true; // enable tweaks in backlog screen
const ENABLE_ROADMAP_TWEAKS = true; // entable tweaks in roadmap screen

// shorten target version in issue list (id only, strip subject)
const ENABLE_SHORTEN_VERSION = false;
const MAX_VERSION_LENGTH = 30;// max text length

// shorten author, assignee etc. names (like "Last, F.") in tables for smaller columns
const ENABLE_SHORTEN_NAMES = true;

/* Add CSS to the selected element if the elements (inner) text matches (regex)
 *
 * Array format:
 *  [<selector>,        [i,0]      - match elements
 *   [                  [i,1]      - multiple patterns per selector are supported
 *    [<pattern>,       [i,1,j,0]  - match regex pattern within the selected element's inner text
 *     {css}], ...j+1   [i,1,j,2]  - css styles applied to all elements matching selector + pattern
 *   ], ...i+1
 *  ]
 *
 * Example:
 * // make (complete) div elements with class=foo containing text "foo bar" red
 * ["div.foo"
 *  [[ /foo bar/i, { "color": "red" } ]]]
 *    -> <div class="foo">Foo <b>bar</b> baz</div>
 *    => <div class="foo" style="color: red;">Foo <b>bar</b> baz</div>
 */
const SET_CSS_BY_TEXT_MATCH = [];

// user name found?
if (MY_NAME !== undefined && MY_NAME != '') {
    SET_CSS_BY_TEXT_MATCH.push(["span.user > a" // activity details comments section, FIXME not working all the time
        + ", span.assignee" // work_packages and activity details
        + ", span.author" // work_packages and activity details
        + ", user-link.user-link > a" // task created by (samll text on top)
        + ", user-link.user-link > a", // task created by (samll text on top)
    [[new RegExp(MY_NAME, "g"), { "color": "rgb(11, 73, 191)", "animation": "blinker 1.5s linear infinite" }]]]);
};

/**
 * Substitute texts and/or add CSS to a text fragment of the selected elements.
 * Text fragments will be wrapped in a new span element if needed.
 *
 * To simplify things the regex pattern must match a text node (any child of the slected node)
 * meaning /foo bar/ would not match "foo <b>bar</b>" due to it's html content, only "foo" and
 * "bar" can be matched individually, since HTML can again contain attributes with similar text
 * (e.g. @title) and we don't want to mess with that.
 *
 * Array format:
 *  [<selector>,        [i,0]      - match elements
 *   [                  [i,1]      - multiple patterns per selector are supported
 *    [<pattern>,       [i,1,j,0]  - match regex pattern within the selected element's inner text
 *     <substitution>,  [i,1,j,1]  - substitution text
 *     {css}], ...j+1   [i,1,j,2]  - css styles applied to the substituted text
 *   ], ...i+1
 *  ]
 *
 * Examples:
 * // make all text fragments starting with "b", including all following non-space characters, red and add a "!" at the end
 * ["div.foo"
 *  [[ /(b[^ ]+)/, "$1!", { "color": "red" } ]]]
 *    -> <div class="foo">Foo bar baz</div>
 *    => <div class="foo">Foo <span style="color: red;">bar!</span> <span style="color: red;">baz!</span></div>
 *
 *    -> <div class="foo">Foo ra<b>b</b>az</div></div>
 *    => <div class="foo">Foo ra<b><span style="color: red;">b</span></b>az</div></div>
 *       // only "b" matches, not "baz" due to the intermittend "b" tags
 *       // text of <b> is matched, not inner text of slected div
 */
const TEXT_SUBSTITUTION = [
    // highlight [tags] and *bold* in issue subjects
    ["span.subject"
        + ", .form--fieldset > div > ul > li" // roadmap
        + ", .timeline-element > .containerRight > .labelFarRight > .label-content" // gant diagram
        + ", div.subject", // backlog
    [[/(\[[^\]]+\])/g, "$1", { "color": "rgb(11, 73, 191)" }],
    [/(\[Story\])/gi, "[STORY]", {}], // just upper case (style added with pattern above)
    [/(\*[^ ][^*]+[^ ]\*)/g, "$1", { "color": "rgb(255, 102, 65)" }]]], // make *bold* text orange

    // highlight / shorten tracker names (by type)
    ["span.wp-table--cell-span.type",
        [[/(Bug)/gi, "$1", { "color": "#ff6641" }],
        [/(Task|Feature)/gi, "$1", { "color": "black" }],
        [/(Idea)/gi, "$1", { "color": "silver" }],
        [/Application/gi, "APP", {}], // customer tracker only
        [/Change Request/gi, "CR", {}]]], // customer tracker only

    // highlight issues priorities
    ["span.priority",
        [[/(Immediate)/gi, "$1", { "color": "rgb(255, 102, 65)", "font-weight": "bold", "animation": "blinker .7s linear infinite" }],
        [/(Urgent)/gi, "$1", { "color": "rgb(255, 102, 65)", "font-weight": "bold" }],
        [/(High)/gi, "$1", { "color": "rgb(241, 196, 15)", "font-weight": "bold" }],
        [/(Normal)/gi, "$1", { "color": "black" }],
        [/(Low)/gi, "$1", { "color": "silver" }]]],

    // highlight issues statuses
    ["span.status"
        + ", div.status_id", // backlog
    [[/(New)/gi, "$1", { "color": "black" }],
    [/(Feedback)/gi, "$1", { "color": "#8E44AD" }],
    [/(In Progress)/gi, "$1", { "color": "rgb(11, 73, 191)" }],
    [/(Resolved)/gi, "$1", { "color": "#229954" }],
    [/(Closed)/gi, "$1", { "color": "silver" }],
    [/(Rejected)/gi, "$1", { "color": "silver" }]]]

    // highlight / shorten category names
    //[ "span.category",
    //    [[ /Development/gi, "Dev." ],
    //     [ /Performance/gi, "Perf." ],
    //     [ /Portal7 \/ UMS/gi, "Portal7" ], // customer tracker only
    //     [ /Application/gi, "APP" ]]], // customer tracker only
];

// to simply add global CSS styles see opAddCustomCSS*() below
/* {{{ -- SETTINGS / CONSTANTS -------------------------------------------- */

/* {{{ -- CONSTANTS ------------------------------------------------------- */
// supported screens
const SCREEN_UNKNOWN = 0;
const SCREEN_WORKPACKAGES = 1; // issue overview (+gantt) and details
const SCREEN_BACKLOG = 3; // backlog
const SCREEN_ROADMAP = 4; // roadmap
/* }}} -- CONSTANTS ------------------------------------------------------- */

/* {{{ -- SCREENS --------------------------------------------------------- */
var opCurrentScreen = opGetOPScreen();

// identify current screen type
function opGetOPScreen() {
    if (/\/work_packages(\/|$)/.test(window.location.pathname)) {
        return SCREEN_WORKPACKAGES;
    } else if (/\/backlogs$/.test(window.location.pathname)) {
        return SCREEN_BACKLOG;
    } else if (/\/roadmap$/.test(window.location.pathname)) {
        return SCREEN_ROADMAP;
    }
    return SCREEN_UNKNOWN;
}

// track url changes (e.g. switching between issue list and details is ajax only)
function opUpdateScreenType() {
    opCurrentScreen = opGetOPScreen();
}
/* }}} -- SCREEN ---------------------------------------------------------- */

/* {{{ -- DEBUG ----------------------------------------------------------- */
var opDebugCounter = 1;

// show a counter in the upper left corner indicating tweak function calls
function opAddOrRefreshDebugCounter() {
    if ($('div#opdebugcounter').length) { // exists? then update
        $('div#opdebugcounter')[0].innerText = opDebugCounter++;
    } else { // else create new div
        $('body').prepend(`<div id="opdebugcounter" style="display: block; position: fixed; z-index:9999; opacity: 1; background: yellow; color: black; font-weight: bold; font-size: 18px; text-align: center; vertical-align: middle;">`
            + opDebugCounter++
            + `</div>`);
    }
}
/* {{{ -- DEBUG ----------------------------------------------------------- */

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

// shorten the given string to the last space before given max length is reached adding "..." suffix
function cbShortenString(str, maxLength) {
    if (str === undefined) {
        return str;
    }
    if (maxLength <= 0) {
        throw "maxLength must be > 0, invalid value: " + maxLength;
    }
    var trimStr = str.trim();
    if (trimStr.length > maxLength) {
        var maxStr = trimStr.substr(0, maxLength);
        var newStr = trimStr.substr(0, maxStr.lastIndexOf(" "));
        return newStr.trim() === "" ? maxStr : newStr + " ...";
    }
    return trimStr;
}

/**
 * Covert a given name to it's initials / shortened form
 * examples:
 * - cbNameToInitials("John Doe") -> "JDo"
 * - cbNameToInitials("John Doe", ", ", 1, 15) -> "Doe, J"
 * - cbNameToInitials("Doe, John", ".", 1, 10, true) -> "J.Doe"
 * - cbNameToInitials("j.doe@bar.com") -> "jdo"
 */
function cbNameToInitials(name, opt_separator, opt_fnlen, opt_lnlen, opt_reverse) {
    var separator = (opt_separator === undefined ? "" : opt_separator);
    var fnlen = (opt_fnlen === undefined ? 1 : opt_fnlen);
    var lnlen = (opt_lnlen === undefined ? 2 : opt_lnlen);
    var reverse = (opt_reverse === undefined ? false : opt_reverse);
    var nameClean = name.trim().replace("@.*", "").replace("[,.]", " ").replace("[ ]+", " ");
    var nameParts = nameClean.split(" ");
    var nameFirst = nameParts[0];
    var nameLast = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");
    if (reverse) {
        return (nameLast !== "" ? nameLast.substr(0, lnlen) + separator : "") + nameFirst.substr(0, fnlen);
    } else {
        return nameFirst.substr(0, fnlen) + (nameLast !== "" ? separator + nameLast.substr(0, lnlen) : "");
    }
}
/* }}} -- UTILITIES ------------------------------------------------------- */

/* {{{ -- OPENPROJECTS CORE ----------------------------------------------- */
// apply screen specific custom CSS
function opAddCustomCSSScreenSpecific() {
    switch (opCurrentScreen) {
        case SCREEN_WORKPACKAGES:
            if (!ENABLE_WORKPACKAGES_TWEAKS) {
                return; // stop, tweaks for this screen are disabled
            }
            // remove these green dots in front of status "New" (most open issues are new, not really relevant more distracting)
            GM_addStyle(`[class^='__hl_dot_']::before, [class*=' __hl_dot_']::before { display: none  !important; }`);
            // hide the "Estimates and Time" section from the details view
            //GM_addStyle(`div[data-group-name='Estimates and time'] { display:none; }`);
            break;

        case SCREEN_BACKLOG:
            if (!ENABLE_BACKLOG_TWEAKS) {
                return; // stop, tweaks for this screen are disabled
            }
            // add custom custom ccs styles here ...
            break;
    }
}

// add some custom CSS styles to the page (sufficient to do this one time only)
function opAddCustomCSS() {
    // -- SCREEN SPECIFIC ----------------------------------------------------
    opAddCustomCSSScreenSpecific();

    // -- ALL SCREENS --------------------------------------------------------
    // blink animation e.g. for own name
    // source: https://css-tricks.com/snippets/css/keyframe-animation-syntax/
    GM_addStyle(`@keyframes blinker {  0% { opacity: 1; }
                                      30% { opacity: 0.4; }
                                      60% { opacity: 1; } }`);
}

// apply tweaks (should be called when all relevant elements are loaded and when they are updated)
function opApplyTweaks() {
    // update screen type variable, url may have changed (ajax)
    opUpdateScreenType(); // TODO try to use a hashchange (url changed) listener instead

    // if enabled show and increment a counter with every function all
    if (DEBUG_ENABLE_COUNTER) {
        opAddOrRefreshDebugCounter();
    }

    // == ALL SCREENS ========================================================
    // -- ADD CSS ------------------------------------------------------------
    // process all custom styles from SET_CSS_BY_TEXT_MATCH
    if (SET_CSS_BY_TEXT_MATCH !== undefined) {
        for (var idxSel1 in SET_CSS_BY_TEXT_MATCH) {//debugger; // loop: selectors
            jQuery.each($(SET_CSS_BY_TEXT_MATCH[idxSel1][0]), function (i, e) {//debugger; // loop: selected elements
                for (var idxSub1 in SET_CSS_BY_TEXT_MATCH[idxSel1][1]) {//debugger; // loop: texts to match
                    // does element's text match? then add style
                    if (SET_CSS_BY_TEXT_MATCH[idxSel1][1][idxSub1][0].test($(e).text())) {
                        $(e).css(SET_CSS_BY_TEXT_MATCH[idxSel1][1][idxSub1][1]);
                    }
                }
            });
        }
    }

    // -- TEXT SUBSTITUTION --------------------------------------------------
    if (TEXT_SUBSTITUTION !== undefined) {
        for (var tsIdxSel in TEXT_SUBSTITUTION) {//debugger; // loop: selectors
            var tsSelector = TEXT_SUBSTITUTION[tsIdxSel][0];
            jQuery.each($(tsSelector), function (i, e) {//debugger; // loop: selected elements
                for (var tsIdxSub in TEXT_SUBSTITUTION[tsIdxSel][1]) {//debugger; // loop: substitutions
                    var tsPattern = TEXT_SUBSTITUTION[tsIdxSel][1][tsIdxSub][0];
                    // check if the text of the whole selection matches (limitation, but more efficient)
                    if (!tsPattern.test($(e).text())) {
                        continue; // no match
                    }
                    // text content does match
                    var tsSubstitution = TEXT_SUBSTITUTION[tsIdxSel][1][tsIdxSub][1];
                    var tsCSS = TEXT_SUBSTITUTION[tsIdxSel][1][tsIdxSub][2];
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

    // == LIST SCREEN ========================================================
    // -- SHORTEN VERSION ----------------------------------------------------
    if (opCurrentScreen == SCREEN_WORKPACKAGES && ENABLE_SHORTEN_VERSION) { //debugger;
        $("span.wp-table--cell-span.version").each(function (i, e) {
            var text = e.innerText.trim();
            e.innerText = cbShortenString(text, MAX_VERSION_LENGTH);
            e.title = text;
        });
    }

    // -- SHORTEN NAMES ------------------------------------------------------
    if (opCurrentScreen == SCREEN_WORKPACKAGES && ENABLE_SHORTEN_NAMES) { //debugger;
        $("td span.wp-table--cell-span.assignee, td span.wp-table--cell-span.author").each(function (i, e) {
            var text = e.innerText.trim();
            if (! /, /.test(text)) { // contains no comma (else: most likely already shortened)
                e.innerText = cbNameToInitials(text, ", ", 1, 20, true);
                e.title = text;
            }
        });
    }
}
/* }}} -- OPENPROJECTS CORE ----------------------------------------------- */


/* {{{ -- EXECUTION ------------------------------------------------------- */
// add additional (global) CSS styles, one time only and for known screens only
if (opCurrentScreen != SCREEN_UNKNOWN) {
    opAddCustomCSS();
}

// dbounce tweak function (call no more than once every 250ms)
var opApplyTweaksDebounce = _.debounce(opApplyTweaks, 250);

// (re)apply tweaks after when the selected elements are ready
// choose elements carefully to reduce calls (though debounce should help with this)
switch (opCurrentScreen) {
    case SCREEN_WORKPACKAGES: // work_packages (issue overview) or activity (details), can be single ajax page
        if (ENABLE_WORKPACKAGES_TWEAKS) {
            // watch first record in table (should be sufficient to refresh on sort, fitler, etc.)
            // and for first gant diagram record to appear
            waitForKeyElements(".results-tbody > tr:first-child"
                + ", .wp-table-timeline--header-inner > .wp-timeline--header-element:first-child"
                + ", .work-package-details-activities-activity-contents", // comment section in details
                opApplyTweaksDebounce);
            // issue ditails
            waitForKeyElements(".detail-activity", opApplyTweaksDebounce);
        }
        break;
    case SCREEN_BACKLOG: // backlog
        if (ENABLE_BACKLOG_TWEAKS) {
            // watch all list items (many initial calls, but to update after drag-n-drop)
            waitForKeyElements("li.story > div.id", opApplyTweaksDebounce);
        }
        break;
    case SCREEN_ROADMAP: // roadmap
        if (ENABLE_ROADMAP_TWEAKS) {
            waitForKeyElements("div#roadmap", opApplyTweaksDebounce);
        }
        break;
    default: // unknown screen, currently not supported (no changes necessary)
        break;
}
/* }}} -- EXECUTION ------------------------------------------------------- */
