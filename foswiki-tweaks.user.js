// ==UserScript==
// @name        Foswiki Tweaks
// @version     0.1
// @description Some improvements to Foswiki
// @author      Andreas Weyer
// @copyright   2025+, userscript@cbaoth.de
// @namespace   https://cbaoth.de
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/foswiki-tweaks.user.js
// @iconURL     https://foswiki.org/pub/System/ProjectLogos/favicon.ico
//
// @include     /^https?:\/\/\w*wiki\.[^/]+(:\d+)?\/bin\/edit\//
//
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.js
// ==/UserScript==

GM_config.init({
    id: 'FoswikiTweaksConfig',
    title: 'Foswiki Tweaks Configuration',
    fields: {
        editorHeightMultiplier: {
            label: 'Editor Height Multiplier',
            type: 'float',
            default: 2.0
        }
    },
    css: '#FoswikiTweaksConfig { background: #f4f4f4; padding: 20px; }',
    events: {
        save: function() {
            console.log('Config saved');
            GM_config.close();
        }
    }
});

GM_registerMenuCommand('Configure Foswiki Tweaks', () => {
    GM_config.open();
});

window.addEventListener('load', () => {
    // Get the configurable editor height multiplier
    const editorHeightMultiplier = GM_config.get('editorHeightMultiplier');

    // Select the editor elements
    const editor = document.querySelector('.foswikiWysiwygEdit');
    const editorTable = document.querySelector('#topic_tbl');
    const editorIframe = document.querySelector('#topic_ifr');

    // Function to adjust height
    function adjustHeight(element, multiplier) {
        if (element) {
            let currentHeight = parseFloat(window.getComputedStyle(element).height);
            element.style.height = (currentHeight * multiplier) + 'px';
        }
    }

    // Adjust heights
    adjustHeight(editor, editorHeightMultiplier);
    adjustHeight(editorTable, editorHeightMultiplier);
    adjustHeight(editorIframe, editorHeightMultiplier);
});
