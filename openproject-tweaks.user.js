// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        OpenProject Tweaks
// @version     0.2.0
// @description Some tweaks for OpenProject (incl. Markdown Editor improvements)
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
//debugger

/**
 * TODO
 * - Show/Copy ID for parents
 * -
 */

(function () {

    /* {{{ -- SETTINGS / CONSTANTS -------------------------------------------- */
    // show a counter in the top left corner indicating how many times opApplyTweaks
    // was called, this can be helpful in determining which elements to watch for update
    const DEBUG_ENABLE_COUNTER = false;

    const MY_NAME = $('meta[name="current_user"]').attr("data-name"); // highlight this name

    const ENABLE_WORKPACKAGES_TWEAKS = true; // enable tweaks in issue list (+gantt) and details screen
    const ENABLE_BACKLOG_TWEAKS = true; // enable tweaks in backlog screen
    const ENABLE_ROADMAP_TWEAKS = true; // entable tweaks in roadmap screen
    const ENABLE_MARKDOWN_EDITOR_TWEAKS = true; // enable markdown source editor improvements (height, font-size, resize)

    // Markdown Editor Settings (only applies if ENABLE_MARKDOWN_EDITOR_TWEAKS is true)
    const MARKDOWN_EDITOR_HEIGHT = "65vh"; // default editor height (e.g., "65vh", "800px", or "calc(100vh - 300px)")
    const MARKDOWN_EDITOR_FONT_SIZE = "12px"; // font size in markdown source mode
    // FIXME prototype, broken due to scrollbar conflicts (editor height is set to 100% of parent container, which should allow resizing, but scrollbar appears on editor itself instead of parent container, preventing resizing)
    const MARKDOWN_EDITOR_ENABLE_RESIZE = false; // allow vertical resizing via drag at bottom-right corner (currently disabled due to scrollbar conflicts)

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
        // highlight own user name
        SET_CSS_BY_TEXT_MATCH.push(["span.user > a" // activity details comments section
            + ", span.author" // work_packages and activity details
            + ", user-link.user-link > a" // task created by (samll text on top)
            + ", user-link.user-link > a", // task created by (samll text on top)
        [[new RegExp(MY_NAME), { "color": "rgb(11, 73, 191)" }]]]);
        // additional color highlighting in case user name is assignee
        SET_CSS_BY_TEXT_MATCH.push(["span.assignee",
        [[new RegExp(MY_NAME), { "color": "rgb(255, 102, 65)", "animation": "blinker 1.5s linear infinite" }]]]);
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
          [/(\[story\])/gi, "[STORY]", {}], // just upper case (style added with pattern above)
          [/(\[concept\])/gi, "[Concept]", { "color": "rgb(32, 173, 147)" }],
          [/(\[idea\])/gi, "[Idea]", { "color": "gray" }],
          [/(\[graylog\])/gi, "[Graylog]", { "color": "FireBrick" }],
          [/(\[sonar(cube)?\])/gi, "[Sonar]", { "color": "FireBrick" }],
          [/(\[(UI)?Tests?\])/gi, "[$2Test]", { "color": "BlueViolet" }],
          [/\[(new)\]/gi, "[new]", { "color": "#44C94D" }],
          [/(\*[^ ][^*]+[^ ]\*)/g, "$1", { "color": "rgb(255, 102, 65)" }]]], // make *bold* text orange

        // highlight / shorten tracker names (by type)
        ["span.wp-table--cell-span.type",
         [[/(Bug)/gi, "$1", { "color": "#ff6641" }],
          [/(Epic)/gi, "$1", { "color": "navi" }],
          [/(Task|Feature)/gi, "$1", { "color": "white" }], // light mode: black
          [/(Idea)/gi, "$1", { "color": "silver" }],
          [/Application/gi, "APP", {}], // customer tracker only
          [/Change Request/gi, "CR", {}]]], // customer tracker only

        // highlight issues priorities
        ["span.priority",
         [[/(Immediate)/gi, "$1", { "color": "rgb(255, 102, 65)", "font-weight": "bold", "animation": "blinker .7s linear infinite" }],
          [/(Urgent)/gi, "$1", { "color": "rgb(255, 102, 65)", "font-weight": "bold" }],
          [/(High)/gi, "$1", { "color": "rgb(241, 196, 15)", "font-weight": "bold" }],
          [/(Normal)/gi, "$1", { "color": "white" }], // light mode: black
          [/(Low)/gi, "$1", { "color": "silver" }]]],

        // highlight issues statuses
        ["span.status"
         + ", div.status_id", // backlog
         [[/(New)/gi, "$1", { "color": "white" }], // light mode: black
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

    /* }}} -- BASE FUNCTIONS -------------------------------------------------- */
    //generate work package url by id (leading # will be ignored if present)
    function opWorkPackageIdToLink(id) {
        // Remove the leading # if present
        const cleanId = id.startsWith('#') ? id.substring(1) : id;
        return `https://openproject.seeburger.de/work_packages/${cleanId}`;
    }
    /* {{{ -- BASE FUNCTIONS -------------------------------------------------- */

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

    // replace the work package ID span, in work package info row, with a link to said work package
    function opWorkPackageInfoRowIdToLink() {
        // Select the element containing the work package ID
        const workPackageIdElement = document.querySelector('.work-packages--info-row > span:first-child');

        if (workPackageIdElement) {
            // Extract the work package ID
            const workPackageId = workPackageIdElement.textContent;

            // Generate the URL using the first function
            const url = opWorkPackageIdToLink(workPackageId);

            // Create the new link element
            const newLink = document.createElement('a');
            newLink.href = url;
            newLink.textContent = workPackageId;

            // Replace the original span with the new link
            workPackageIdElement.parentNode.replaceChild(newLink, workPackageIdElement);
        }
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

    /* {{{ -- OPENPROJECT CORE ------------------------------------------------ */
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

        // -- MARKDOWN EDITOR IMPROVEMENTS ---------------------------------------
        if (ENABLE_MARKDOWN_EDITOR_TWEAKS) {
            opAddMarkdownEditorCSS();
        }
    }

    /* }}} -- OPENPROJECT CORE ------------------------------------------------ */

    /* {{{ -- MARKDOWN EDITOR IMPROVEMENTS ------------------------------------ */
    // Add CSS styles for improved Markdown source editor
    function opAddMarkdownEditorCSS() {
        GM_addStyle(`
/* === Markdown Source Editor (CodeMirror) Improvements === */

/* Main editor container: increase height */
.CodeMirror {
    min-height: ${MARKDOWN_EDITOR_HEIGHT} !important;
    height: ${MARKDOWN_EDITOR_HEIGHT} !important;
    box-sizing: border-box !important;
}

/* Scroll area should inherit height and handle overflow properly */
.CodeMirror-scroll {
    min-height: inherit !important;
    max-height: inherit !important;
    height: 100% !important;
}

/* Reduce font size and adjust line height for better overview */
.CodeMirror pre,
.CodeMirror .CodeMirror-line,
.CodeMirror .CodeMirror-code {
    font-size: ${MARKDOWN_EDITOR_FONT_SIZE} !important;
    line-height: 1.4 !important;
}

/* Line numbers with smaller font */
.CodeMirror-gutters {
    font-size: ${MARKDOWN_EDITOR_FONT_SIZE} !important;
}

/* Ensure parent containers don't restrict height */
.op-ckeditor--markdown-source,
.wp-editor--container,
.attribute-editor-content,
.op-uc-textarea-wrapper {
    max-height: unset !important;
    height: auto !important;
    overflow: visible !important;
}
        `);
    }

    // Check if element is a CodeMirror instance
    function isCodeMirrorElement(el) {
        return el && el.classList && el.classList.contains("CodeMirror");
    }

    // Find all visible CodeMirror editors
    function findVisibleCodeMirrorEditors(root = document) {
        const editors = Array.from(root.querySelectorAll(".CodeMirror"));
        return editors.filter((el) => el.offsetParent !== null); // only visible elements
    }

    // Refresh CodeMirror instance to properly render after size changes
    function refreshCodeMirror(cmRoot) {
        try {
            // CodeMirror stores its API reference on the root element
            const cm = cmRoot && cmRoot.CodeMirror;
            if (cm && typeof cm.refresh === "function") {
                cm.refresh();
                return true;
            }
            // Fallback: check scroll container
            const scroller = cmRoot.querySelector(".CodeMirror-scroll");
            if (scroller && scroller.CodeMirror && typeof scroller.CodeMirror.refresh === "function") {
                scroller.CodeMirror.refresh();
                return true;
            }
        } catch (e) {
            console.warn("OpenProject Tweaks: Failed to refresh CodeMirror:", e);
        }
        return false;
    }

    // Apply enhancements to all currently visible CodeMirror editors
    function opEnhanceMarkdownEditors() {
        if (!ENABLE_MARKDOWN_EDITOR_TWEAKS) return;

        const editors = findVisibleCodeMirrorEditors();

        editors.forEach((cmRoot) => {
            // Skip if already enhanced (check for marker attribute)
            if (cmRoot.hasAttribute("data-op-enhanced")) return;

            // Mark as enhanced
            cmRoot.setAttribute("data-op-enhanced", "true");

            // Apply initial height
            cmRoot.style.minHeight = MARKDOWN_EDITOR_HEIGHT;
            cmRoot.style.height = MARKDOWN_EDITOR_HEIGHT;

            // Initial refresh to ensure proper rendering
            setTimeout(() => refreshCodeMirror(cmRoot), 100);
        });
    }

    // Observe DOM for new CodeMirror instances (e.g., when switching between WYSIWYG ↔ Markdown)
    function opObserveMarkdownEditors() {
        if (!ENABLE_MARKDOWN_EDITOR_TWEAKS) return;

        const observer = new MutationObserver((mutations) => {
            let relevantChange = false;

            for (const mutation of mutations) {
                // Check for added nodes
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element node
                            if (isCodeMirrorElement(node) || node.querySelector && node.querySelector(".CodeMirror")) {
                                relevantChange = true;
                                break;
                            }
                        }
                    }
                }
                // Check for attribute changes on CodeMirror elements
                if (mutation.type === "attributes" && mutation.target && mutation.target.classList) {
                    if (mutation.target.classList.contains("CodeMirror")) {
                        relevantChange = true;
                    }
                }
                if (relevantChange) break;
            }

            if (relevantChange) {
                // Debounce is applied below
                opEnhanceMarkdownEditorsDebounced();
            }
        });

        // Observe the entire document for CodeMirror instances
        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });
    }
    /* }}} -- MARKDOWN EDITOR IMPROVEMENTS ------------------------------------ */

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
    /* }}} -- OPENPROJECT CORE ------------------------------------------------ */

    /* {{{ -- SPECIAL TWEAKS -------------------------------------------------- */
    function sortUserSelectOptionsByText() {
        var select = $(`select[data-filter-name="user_id"].filter-value`),
            options = $(`select[data-filter-name="user_id"].filter-value option`),
            checked = $(`select[data-filter-name="user_id"].filter-value option:checked`);
        options.sort(function(o1, o2) {
            var t1 = o1.text.toLowerCase(), t2 = o2.text.toLowerCase(); // sort case insensitive
            return o1.text == 'me' ? -1 // special user 'me' should always come first
            : o2.text == 'me' ? 1
            : t1 > t2 ? 1
            : t1 < t2 ? -1
            : 0;
        });
        options.detach();
        options.appendTo(select);
        // FIXME scroll to previous position / selection on single-select
        //select.value = checked.value;
        //options[0].prop('checked', true);
    }
    /* }}} -- SPECIAL TWEAKS -------------------------------------------------- */

    /* {{{ -- EXECUTION ------------------------------------------------------- */
    // add additional (global) CSS styles, one time only and for known screens only
    if (opCurrentScreen != SCREEN_UNKNOWN) {
        opAddCustomCSS();
    }

    // dbounce tweak function (call no more than once every 250ms)
    var opApplyTweaksDebounce = _.debounce(opApplyTweaks, 250);

    // debounce markdown editor enhancements
    var opEnhanceMarkdownEditorsDebounced = _.debounce(opEnhanceMarkdownEditors, 250);

    // Initialize markdown editor improvements
    if (ENABLE_MARKDOWN_EDITOR_TWEAKS) {
        // Apply enhancements to any existing editors
        opEnhanceMarkdownEditors();
        // Start observing for new editors
        opObserveMarkdownEditors();
        // Also watch for CodeMirror elements explicitly
        waitForKeyElements(".CodeMirror", opEnhanceMarkdownEditorsDebounced);
    }

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
                // register work package info row separately so the list screen work package details sidebar is
                // updated on change
                waitForKeyElements(".work-packages--info-row > span:first-child", opWorkPackageInfoRowIdToLink);
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

    // special tweaks: sort (otherwise randomely listed) names in user-name filter (e.g. cost_reports site)
    // FIXME messes up selection
    //waitForKeyElements(`select[data-filter-name="user_id"].filter-value option`, _.debounce(sortUserSelectOptionsByText, 250));
    /* }}} -- EXECUTION ------------------------------------------------------- */

}());
