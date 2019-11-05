// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        OpenProject Tweaks
// @version     0.1.5
// @description Some tweaks for OpenProject
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/openproject-tweaks.user.js
//
// @include     /^https?://openproject\.[^/]+//
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

// prevent jQuery version conflicts (with page)
this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

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
        SET_CSS_BY_TEXT_MATCH.push(["span.user > a" // activity details comments section
            + ", span.assignee" // work_packages and activity details
            + ", span.author" // work_packages and activity details
            + ", user-link.user-link > a" // task created by (samll text on top)
            + ", user-link.user-link > a", // task created by (samll text on top)
        [[new RegExp(MY_NAME), { "color": "rgb(11, 73, 191)", "animation": "blinker 1.5s linear infinite" }]]]);
    };

    /**
     * Substitute texts and inject CSS styles by wrapping text in spans.
     *
     * substitutions: a multi dimensional array in the following format
     *  [<selector>,        [i,0]      - match elements
     *   [                  [i,1]      - multiple patterns per selector are supported
     *    [<pattern>,       [i,1,j,0]  - match regex pattern within the selected element's inner text
     *     <substitution>,  [i,1,j,1]  - substitution text
     *     {css}], ...j+1   [i,1,j,2]  - css styles applied to the substituted text
     *   ], ...i+1
     *  ]
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
        [/(Rejected)/gi, "$1", { "color": "silver" }]]],

        // shorten long table headers (to reduce column widht)
        ["th.wp-table--table-header a#storyPoints", [[/Story Points/gi, "SP", {}]]],
        ["th.wp-table--table-header a#priority", [[/Priority/gi, "Prio", {}]]]

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
            cb.findTextAddCSS(SET_CSS_BY_TEXT_MATCH);
        }

        // -- TEXT SUBSTITUTION --------------------------------------------------
        if (TEXT_SUBSTITUTION !== undefined) {
            cb.substituteTextWithCSS(TEXT_SUBSTITUTION);
        }

        // == LIST SCREEN ========================================================
        // -- SHORTEN VERSION ----------------------------------------------------
        if (opCurrentScreen == SCREEN_WORKPACKAGES && ENABLE_SHORTEN_VERSION) { //debugger;
            $("span.wp-table--cell-span.version").each(function (i, e) {
                var text = e.innerText.trim();
                e.innerText = cb.shortenString(text, MAX_VERSION_LENGTH);
                e.title = text;
            });
        }

        // -- SHORTEN NAMES ------------------------------------------------------
        if (opCurrentScreen == SCREEN_WORKPACKAGES && ENABLE_SHORTEN_NAMES) { //debugger;
            $("td span.wp-table--cell-span.assignee, td span.wp-table--cell-span.author").each(function (i, e) {
                var text = e.innerText.trim();
                if (! /, /.test(text)) { // contains no comma (else: most likely already shortened)
                    e.innerText = cb.nameToInitials(text, { separator: ", ", lastLength: 20, reverse: true });
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
                    + ", span.user > a", //user name in details comment section
                    opApplyTweaksDebounce);
                // issue details
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

}());
