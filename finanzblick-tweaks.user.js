// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021+, userscript@cbaoth.de
//
// @name        Buhl Finanzblick Tweaks
// @version     0.2
// @description Some improvments to the buhl finanzblick page
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/finanzblick-tweaks.user.js
//
// @include     https://finanzblickx.buhl.de/*
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {
  // amazon order number substitution in list view
  // TODO seems to be a bit glitchy, especially for details view (removed)
  const AMAZON_ORDER_SEL = "div.bookingCell__purpose"; // div.detailsGroup__content > div.text
  const AMAZON_REGEX_ORDER =
    /([a-z0-9][0-9]{2}-[0-9]{7}-[0-9]{7})(\s+(am[az]|kindle))/i;
  const AMAZON_REGEX_ORDER_SUB = `<a href="https://www.amazon.de/gp/your-account/order-details?orderID=$1" target="_new">$1</a>$2`;

  // replace amazon order numbers (in bookings) with links to the amazon.de order history
  waitForKeyElements(AMAZON_ORDER_SEL, (e) => {
    $(e).html($(e).html().replace(AMAZON_REGEX_ORDER, AMAZON_REGEX_ORDER_SUB));
  });
})();
