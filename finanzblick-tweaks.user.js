// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021+, userscript@cbaoth.de
//
// @name        Buhl Finanzblick Tweaks
// @version     0.1
// @description Some improvments to the buhl finanzblick page
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/finanzblick-tweaks.user.js
//
// @include     https://finanzblickx.buhl.de/*
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {
  // replace amazon order numbers (in bookings) with links to the amazon.de order history search
  waitForKeyElements(
    "div.bookingCell__purpose, div.detailsGroup__content > div.text",
    (e) => {
      var htmlNew = $(e)
        .html()
        .replace(
          /([0-9]{3}-[0-9]{7}-[0-9]{7})(\s+ama?zo?n)/i,
          `<a href="https://www.amazon.de/gp/your-account/order-history?opt=ab&search=$1" target="_new">$1</a>$2`
        );
      debugger;
      $(e).html(htmlNew);
    }
  );
})();
