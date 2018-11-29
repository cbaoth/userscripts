// ==UserScript==
// @name        Gerrit Tweaks
// @namespace   https://cbaoth.de
// @version     0.1
// @downloadURL  https://github.com/cbaoth/userscripts/raw/master/gerrit-tweaks.user.js
// @description  Some tweaks for gerrit
//
// Change URL if needed
// @include     /^https://git\.[^/]+/r//
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @copyright   2017, userscript@cbaoth.de
// ==/UserScript==

/* TODO:
 * - Strike subject when closed / rejected
 * - Highlight bugs
 * - Show tooltip (subject) for parent task link
 * - Update style after drag-drop in backlog + taskboard
 */

this.$ = this.jQuery = jQuery.noConflict(true);

// tweak existing css classes
GM_addStyle(`.gr-diff.section.contextControl { background-color: #eee !important; }`);

// custom css classes
GM_addStyle(`.keyword-return { color: red !important; }`); // #FF6961 pastel
GM_addStyle(`.keyword-throw { color: red !important; }`);
GM_addStyle(`.variable-Preconditions { color: darkred !important; font-weight: bold !important; }`);
GM_addStyle(`.variable-Preconditions-method { color: darkred !important; }`);
GM_addStyle(`.variable-result { color: darkred !important; }`);

// add style classes to selected span.cm-keyword nodes
function updateKeyword(node) {
    var text = node.text();
    switch (true) {
        case /^return$/.test(text):
            node.addClass("keyword-return");
            break;
        case /^throw$/.test(text):
            node.addClass("keyword-throw");
            break;
    }
}
waitForKeyElements(".cm-keyword", _.debounce(updateKeyword, 200)); // old gerrit
waitForKeyElements(".gr-diff.gr-syntax-keyword", _.debounce(updateKeyword, 200)); // new gerrit

// add style classes to selected span.cm-variable nodes
function updateVariable(node) {
    var text = node.text();
    switch (true) {
        case /^Preconditions$/.test(text): // old gerrit
            var nextNode = $(node)[0].nextSibling;
            if (nextNode.nodeType == 3 && nextNode.nodeValue == ".") { // "." -> static call, ";" -> import
                $(node).addClass("variable-Preconditions"); // highlight Preconditoins
                $(node).next("span.cm-variable").addClass("variable-Preconditions-method"); // highlight method
            }
            break;
        case /^[\s\n\r]*Preconditions\..*/.test(text): // new gerrit
            node[0].innerHTML = node[0].innerHTML.replace("Preconditions\.", '<span class="variable-Preconditions">Preconditions</span>.');
            break;
        case /^result$/.test(text): // old gerrit only
            node.addClass("variable-result");
            break;
    }
}
waitForKeyElements(".cm-variable", _.debounce(updateVariable, 200)); // old gerrit
waitForKeyElements(".gr-diff.contentText", _.debounce(updateVariable, 200)); // new gerrit
