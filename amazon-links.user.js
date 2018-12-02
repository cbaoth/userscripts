// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2015+, userscript@cbaoth.de
//
// @name        Amazon ASIN Links (price tracking)
// @version     0.3.2
// @description Adds links to the price watching page keepa.com as well as a direct link to the Amazon Product (without any URL parameters, for sharing).
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/amazon-links.user.js
//
// @include     /^https?://[^/]*amazon.\w+//
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    // config parameters
    const SHOW_LINK_ICON = 1; // toggle link fav icons
    const LINK_STYLE = "font-weight: bold; font-style: italic;";
    const SHOW_LINK_TEXT = 1; // toggle link text

    // constants
    const PRICE_SELECTOR = 'tr#priceblock_ourprice_row > td:last-child, #priceblock_dealprice_row > td:last-child';

    // create html for link
    function createLink(url, text, color, icon, tooltip) {
        return (SHOW_LINK_ICON ? '<img src="' + icon + '" border="0" align="absmiddle" width="16" height="16" />&nbsp;' : '')
            + '<a target="_blank" href="' + url + '" style="color: ' + color + ';' + LINK_STYLE + '" title="' + tooltip + '">'
            + (SHOW_LINK_TEXT ? text : '')
            + '</a>';
    }

    // add links
    function addAmazonLinks() {
        if (!$('input#ASIN:first').length) {
            return; // this doesn't seem to be a product page
        }

        // get the ASIN (product id)
        var asin = $('input#ASIN:first').val();

        // get top level domain (the simple way)
        var tld = document.domain.split('.').pop();
        if (['au', 'br', 'mx'].indexOf(tld) > -1) { // add .com to some domains
            tld = 'com.' + tld;
        } else if (['uk', 'jp'].indexOf(tld) > -1) { // add .co to others
            tld = 'co.' + tld;
        }

        // direct link
        var azLink = createLink('http://amazon.' + tld + '/dp/' + asin,
            'Amazon',
            '#e47911',
            'http://www.amazon.' + tld + '/favicon.ico',
            (tld == 'de' ? 'Direkter Produktlink' : 'Direct product link'));

        // keepa.com
        var keepaIds = { "com": 1, "uk": 2, "de": 3, "fr": 4, "jp": 5, "ca": 6, "cn": 7, "it": 8, "es": 9, "in": 10, "mx": 11, "br": 12, "au": 13 };
        var keepaLink = createLink('https://keepa.com/#!product/' + keepaIds[tld] + '-' + asin,
            'Keepa',
            '#039',
            'https://keepa.com/favicon.ico',
            (tld == 'de' ? 'Keepa Preishistorie' : 'Keepa price history'));

        // combine links
        var linksHTML = '<span style="margin-left: 2em;">' + azLink + ' &nbsp; ' + keepaLink + '</span><br/>';
        // add the links next to the price information
        var td = $(PRICE_SELECTOR);
        // if there are additional shipping details next to the price, add a line break and instert links before next to the price
        var shipSpan = td.find('#ourprice_shippingmessage');
        if (shipSpan) {
            shipSpan.prepend(linksHTML + '<br/>');
        } else {
            td.append(linksHTML);
        }
    }

    waitForKeyElements(PRICE_SELECTOR, addAmazonLinks);

}());
