// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2015+, userscript@cbaoth.de
//
// @name        Amazon Tweaks
// @version     0.10
// @description Some improvments to amazon shop pages
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/amazon-links.user.js
//
// @include     /^https?://(www\.|smile\.)?amazon\.\w+//
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {
    // constants
    const PAGE_PRODUCT = 1;
    const PAGE_SEARCH = 2;
    const PRICE_SELECTOR = 'span#priceblock_ourprice, span#priceblock_dealprice';
    const PRICE_SELECTOR_SEARCH = `span.a-price-whole, span.a-color-price.a-size-base`;
    const LINK_SELECTOR_SEARCH = `div[data-asin][data-cel-widget] a.a-text-normal[href*="/dp/"],
                                   div[data-asin][data-cel-widget] a.a-link-normal[href*="/dp/"],
                                   li[data-asin] a.s-access-detail-page,
                                   li[data-asin] a.a-text-normal`
    const KEEPA_ICO = 'https://keepa.com/favicon.ico';

    // clean-up product page link (strip all parameters and unnecessary texts)
    function cleanLink(a) {
        var href = $(a).attr('href');
        if (! /\/[dg]p\/\w{10}([/?].+)?$/.test(href)) { // not a product page links?
            return; // do nothing
        }
        var custReview = /#customerReviews/.test(href) ? '#customerReviews' : ''
        if (/^\s*http/.test(href)) { // absolute link?
            $(a).attr('href', href.replace(/(?<=\w)\/.*(\/[dg]p\/\w{10})[/?].+/, '$1/') + custReview);
        } else {
            $(a).attr('href', href.replace(/.*(\/[dg]p\/\w{10})[/?].+/, '$1/') + custReview);
        }
    }

    // add links
    function addAmazonLinks(e, page) {
        // get price tag
        var price = $(e);
        // get the ASIN (product id)
        var asin;
        if (page == PAGE_PRODUCT) {
            asin = $('input#ASIN').val();
        } else if (page == PAGE_SEARCH) {
            if (price.parent().is('a')) { // un-link price tag
                price.unwrap();
            }
            asin = price.closest('li[data-asin], div[data-asin]').attr('data-asin');
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
        var azURL = `https://amazon.${tld}/dp/${asin}`;
        var azICO = `https://www.amazon.${tld}/favicon.ico`;

        // styles
        cb.addCSS(`.cb-opacity-50 img:hover { opacity: .5; }`);

        // keepa.com
        var keepaIds = { "com": 1, "uk": 2, "de": 3, "fr": 4, "jp": 5, "ca": 6, "cn": 7, "it": 8, "es": 9, "in": 10, "mx": 11, "br": 12, "au": 13 };
        var keepaURL = `https://keepa.com/#!product/${keepaIds[tld]}-${asin}`;

        // add kappa link icon and amazon (clean product "share") link icon next to the price
        price.after(`<span style="display: inline-block; vertical-align: middle; margin-bottom: 1px;">
                       <a target="_blank" class="cb-opacity-50" style="text-decoration: none"
                          href="${keepaURL}" title="Keepa price watch (click to open in new tab).">
                         <img style="margin-left: 4px; height: 16px; width: auto;" src=${KEEPA_ICO} />
                       </a>
                       <a href="${azURL}" class="cb-opacity-50" style="style="text-decoration: none" title="Clean product page link (copy to share).">
                         <img style="margin-left: 2px; padding-top: 2px; height: 18px; width: auto;" src="${azICO}" />
                       </a>
                     </span>`);

        // make price a link to keepa (open in new tab/window)
        price.wrapInner(`<a target="_blank" class="a-color-price" href="${keepaURL}" title="Keepa price watch (click to open in new tab)."></a>`);
    }


    function smileRedirect() {
        if (/^(www\.)?amazon.(\w+)/.test(window.location.hostname) && ! /^smile\./.test(window.location.hostname)) {
            var smileURL = window.location.href.replace(/\/\/(www\.)?amazon\.(\w{2})/g, '//smile.amazon.$2');
            if (window.location.href != smileURL) {
                window.location.replace(smileURL);
            }
        }
    }

    if (/\/[dg]p\/(product\/)?\w{10}([/?].+)?$/.test(window.location.pathname)) { // product page
        waitForKeyElements(PRICE_SELECTOR, (e) => addAmazonLinks(e, PAGE_PRODUCT));
        // auto selection of one-time buy option (instead of default: subscription)
        waitForKeyElements("#oneTimeBuyBox .a-accordion-radio", (e) => cb.clickElement(e));
    } else if (/\/s([/?].+)?$/.test(window.location.pathname)) { // search result
        // change price links (normally product link too) to keepa links
        waitForKeyElements(PRICE_SELECTOR_SEARCH, (e) => addAmazonLinks(e, PAGE_SEARCH));
        // replace all product links in search result with clean links
        waitForKeyElements(LINK_SELECTOR_SEARCH, (e) => cleanLink(e));
    }

    smileRedirect();
}());
