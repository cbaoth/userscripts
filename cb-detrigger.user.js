// ==UserScript==
// @name        CB DeTrigger
// @namespace   https://cbaoth.de
// @version     2025-05-26
// @description Filters potentially triggering elements to reduce emotional friction and foster a more serene browsing experience.
// @author      Andreas Weyer
// @license     MIT
//
// @match       https://civitai.com/*
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/cb-detrigger.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/cb-detrigger.user.js
// ==/UserScript==

(function () {
  'use strict';

  /*** Shared / General Utilities (if any) ***/
  // (Put reusable helpers here in the future)


  /*** Site: civitai.com ***/
  const civitai = {
    isMatch: () => location.hostname.match(/(^|\.)civitai\.com$/),

    EMOJIS_TO_HIDE: ['😢', '😂'],

    hideUnwantedEmojis(root = document) {
      const buttons = root.querySelectorAll('button[data-button="true"]');
      for (const btn of buttons) {
        const emoji = btn.querySelector('.mantine-Text-root')?.textContent?.trim();
        if (civitai.EMOJIS_TO_HIDE.includes(emoji)) {
          btn.style.display = 'none';
        }
      }
    },

    run() {
      civitai.hideUnwantedEmojis();

      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              civitai.hideUnwantedEmojis(node);
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
  };


  /*** Entry Point ***/
  const sites = [civitai /*, more sites later */];
  for (const site of sites) {
    if (site.isMatch()) {
      site.run();
      break;
    }
  }

})();
