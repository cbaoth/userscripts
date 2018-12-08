// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2015+, userscript@cbaoth.de
//
// @name        Amazon ASIN Links (price tracking)
// @version     0.4
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
    const PAGE_PRODUCT = 1;
    const PAGE_SEARCH = 2;
    const PRICE_SELECTOR = 'span#priceblock_ourprice';
    const PRICE_SELECTOR_SEARCH = 'span.a-color-price';

    function cleanLink(a) {
        var href = $(a).attr('href');
        if (! /\/dp\/\w{10}\//.test(href)) { // not a product page links?
            return; // do nothing
        }
        if (/^\s*http/.test(href)) { // absolute link?
            $(a).attr('href', href.replace(/(?<=\w)\/.*(\/dp\/\w{10}\/).*/, '$1'));
        } else {
            $(a).attr('href', href.replace(/.*(\/dp\/\w{10}\/).*/, '$1'));
        }
    }

    // add links
    function addAmazonLinks(e, page) {
        // get price tag
        var price = $(e);

        // get the ASIN (product id)
        var asin;
        if (page == PAGE_PRODUCT) {
            asin = $('input#ASIN:first').val();
        } else if (page == PAGE_SEARCH) {
            if (price.parent().is('a')) { // un-link price tag
                price.unwrap();
            }
            asin = price.closest("li").attr('data-asin');
        } else {
            return; // unknown page
        }

        // get top level domain (the simple way)
        var tld = document.domain.split('.').pop();
        if (['au', 'br', 'mx'].indexOf(tld) > -1) { // add .com to some domains
            tld = 'com.' + tld;
        } else if (['uk', 'jp'].indexOf(tld) > -1) { // add .co to others
            tld = 'co.' + tld;
        }

        // direct link
        var azURL = 'https://amazon.' + tld + '/dp/' + asin;
        var azICO = 'https://www.amazon.' + tld + '/favicon.ico';

        // keepa.com
        var keepaIds = { "com": 1, "uk": 2, "de": 3, "fr": 4, "jp": 5, "ca": 6, "cn": 7, "it": 8, "es": 9, "in": 10, "mx": 11, "br": 12, "au": 13 };
        var keepaURL = 'https://keepa.com/#!product/' + keepaIds[tld] + '-' + asin;
        //var keepaICO = 'https://keepa.com/favicon.ico';

        // add copy clean amazon link button next to the price
        price.after(`<span style="display: inline-block; vertical-align: middle;">
                     <a href="` + azURL + `">
                       <img style="padding-left: 2px; height: 16px; width: auto;" src="` + azICO + `" />
                     </a></span>`);

        // make price a link to keepa (open in new tab/window)
        price.wrapInner('<a target="_blank" class="a-color-price" href="' + keepaURL + '"></a>');
    }

    if (/\/dp\/\w{10}\//.test(window.location.pathname)) { // product page
        waitForKeyElements(PRICE_SELECTOR, (e) => addAmazonLinks(e, PAGE_PRODUCT));
    } else if (/\/s\//.test(window.location.pathname)) { // search
        // change price links (normally product link too) to keepa links
        waitForKeyElements(PRICE_SELECTOR_SEARCH, (e) => addAmazonLinks(e, PAGE_SEARCH));
        // replace all product links with clean links
        $('div.a-col-left a.a-link-normal,' // search result product image
            + 'div.a-col-right a.s-access-detail-page') // search result product title
            .each((i, a) => cleanLink(a));
    }
}());
