// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2015+, userscript@cbaoth.de
//
// @name        Amazon Tweaks
// @version     0.16
// @description Some improvments to amazon shop pages
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/amazon-links.user.js
//
// @include     /^https?://(www\.|smile\.)?amazon\.(com|de|co\.uk)//
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
    // constants
    const PAGE_PRODUCT = 1;
    const PAGE_SEARCH = 2;
    const PRICE_SELECTOR = 'div#corePrice_desktop span.a-price.a-text-price span:not(.a-offscreen)';
    const PRICE_SELECTOR_SEARCH = `span.a-price-whole, span.a-color-price.a-size-base`;
    const AVG_RATING_SELECTOR = 'div#averageCustomerReviews_feature_div';
    const LINK_SELECTOR_SEARCH = `div[data-asin][data-cel-widget] a.a-text-normal[href*="/dp/"],
                                   div[data-asin][data-cel-widget] a.a-link-normal[href*="/dp/"],
                                   li[data-asin] a.s-access-detail-page,
                                   li[data-asin] a.a-text-normal`
    const KEEPA_ICO = 'https://keepa.com/favicon.ico'
    const PRICE_TWEAKS_ID = 'cb-price-tweaks'
    const AVG_RATING_TWEAKS_ID = 'cb-avg-rating-tweaks'
    //const HOVER_FADE_CLASS = 'cb-opacity-50'
    //const HOVER_FADE_STYLE = `.cb-opacity-50 img:hover { opacity: .5; }`
    const HOVER_FADE_CLASS = 'cb-opacity-50-span'




    // static styles
    GM_addStyle(`div.order > div.shipment-is-delivered { background: #90ee9050 !important; }`); // delivered order -> green
    GM_addStyle(`div.order > div.shipment:not(.shipment-is-delivered) { background: #ff990030 !important; }`); //  open/shipped -> orange
    // TODO move to lib
    GM_addStyle(`.${HOVER_FADE_CLASS} {
                     -webkit-transition: .25s ease-in-out opacity;
                     -moz-transition: .25s ease-in-out opacity;
                     -o-transition: .25s ease-in-out opacity;
                     transition: .25s ease-in-out opacity;
                 }

                 .${HOVER_FADE_CLASS}:hover {
                     opacity: 0.65;
                 }`); // fade on hover

    var TLD = getTld()

    function getTld() {
        // get top level domain (the simple way)
        var tld = document.domain.split('.').pop();
        if (['au', 'br', 'mx'].indexOf(tld) > -1) { // add .com to some domains
            tld = 'com.' + tld;
        } else if (['uk', 'jp'].indexOf(tld) > -1) { // add .co to others
            tld = 'co.' + tld;
        }
        return tld;
    }

    // clean-up product page link (strip all parameters and unnecessary texts)
    function cleanLink(a) {
        var href = $(a).attr('href');
        if (! /\/[dg]p\/\w{10}([/?].+)?$/.test(href)) { // not a product page links?
            return; // do nothing
        }
        var custReview = /#customerReviews/.test(href) ? '#customerReviews' : ''
        if (/^\s*http/.test(href)) { // absolute link?
            $(a).attr('href', toSmileURL(href).replace(/(?<=\w)\/.*(\/[dg]p\/\w{10})[/?].+/, '$1/') + custReview);
        } else {
            $(a).attr('href', toSmileURL(href).replace(/.*(\/[dg]p\/\w{10})[/?].+/, '$1/') + custReview);
        }
    }

    // add average rating links
    function addRatingLins(e) {
        if ($('#' + AVG_RATING_TWEAKS_ID)[0]) {
            return; // already done
        }
        var div = $(e);

        var asin = $('input#ASIN').val();
        var reviewMetaURL = `https://reviewmeta.com/amazon-${TLD}/${asin}`
        var tweak = `<a target="_blank" class="${HOVER_FADE_CLASS}" style="text-decoration: none; padding-right: .25em;"
                        href="${reviewMetaURL}" title="ReviewMeta (click to open in new tab).">
                       <span style="background: #2173b9; color: white; font-size: .65em; font-weight: bold; vertical-align: text-top; line-height: 16px;
                             padding: .2em .4em .1em .45em; text-align: center; filter: drop-shadow(1px 1px 1px black); border-radius: 2px;">R</span>
                     </a>`
        div.prepend(tweak);

    }

    // add price links
    function addAmazonLinks(e, page) {
        if ($('#' + PRICE_TWEAKS_ID)[0]) {
            return; // already done
        }

        // get price tag
        var price = $(e).hasClass('corePrice_desktop') ? $(e).parent() : $(e);
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

        // direct link
        var azURL = `https://smile.amazon.${TLD}/dp/${asin}`;
        var azICO = `https://www.amazon.${TLD}/favicon.ico`;
        var rmICO = `https://www.amazon.${TLD}/favicon.ico`;

        // keepa.com
        var keepaIds = { "com": 1, "uk": 2, "de": 3, "fr": 4, "jp": 5, "ca": 6, "cn": 7, "it": 8, "es": 9, "in": 10, "mx": 11, "br": 12, "au": 13 };
        var keepaURL = `https://keepa.com/#!product/${keepaIds[TLD]}-${asin}`;

        // add kappa link icon and amazon (clean product "share") link icon next to the price
        price.after(`<span id="${PRICE_TWEAKS_ID}" style="display: inline-block; vertical-align: middle; margin-bottom: 1px;">
                       <a target="_blank" class="${HOVER_FADE_CLASS}" style="text-decoration: none"
                          href="${keepaURL}" title="Keepa price watch (click to open in new tab).">
                         <img style="margin-left: 4px; height: 16px; width: auto;" src="${KEEPA_ICO}" />
                       </a>
                       <a href="${azURL}" class="${HOVER_FADE_CLASS}" style="style="text-decoration: none" title="Clean product page link (copy to share).">
                         <img style="margin-left: 2px; padding-top: 2px; height: 18px; width: auto;" src="${azICO}" />
                       </a>
                     </span>`);

        // make price a link to keepa (open in new tab/window)
        price.wrapInner(`<a target="_blank" class="a-color-price" href="${keepaURL}" title="Keepa price watch (click to open in new tab)."></a>`);
    }

    function toSmileURL(url) {
        return url.replace(/\/\/(www\.)?amazon\.(\w{2})/g, '//smile.amazon.$2');
    }

    function smileRedirect() {
        // are we logged in? if not, don't redirect (won't work, infinite loop)
        if (! $('#nav-link-accountList[data-nav-role="signin"] ~ a[href*="signout"]').length) {
            return;
        }
        if (/^(www\.)?amazon.(\w+)/.test(location.hostname) && ! /^smile\./.test(location.hostname)) {
            var orgURL = window.location.href || window.parent.location.href;
            var smileURL = toSmileURL(orgURL);
            if (orgURL != smileURL) {
                // try replacing location in various ways
                try { Location.replace(smileURL) } catch(e) {}
                try { window.location.replace(smileURL) } catch(e) {}
                try { window.parent.location.replace(smileURL) } catch(e) {}
            }
        }
    }

    // tweak pages, currently only
    // smile rederict only on these pages (to be safe, pages might exist where this will not work)
    if (/\/[dg]p\/(product\/)?\w{10}([/?].+)?$/.test(window.location.pathname)) { // product page
        // redirect to smile (if not already the case)
        smileRedirect();
        waitForKeyElements(PRICE_SELECTOR, (e) => addAmazonLinks(e, PAGE_PRODUCT));
        waitForKeyElements(AVG_RATING_SELECTOR, (e) => addRatingLins(e));
        // auto selection of one-time buy option (instead of default: subscription)
        waitForKeyElements("#oneTimeBuyBox .a-accordion-radio", (e) => cb.clickElement(e));
    } if (/\/s([/?].+)?$/.test(window.location.pathname)) { // search result
        // redirect to smile (if not already the case)
        smileRedirect();
        // change price links (normally product link too) to keepa links
        waitForKeyElements(PRICE_SELECTOR_SEARCH, (e) => addAmazonLinks(e, PAGE_SEARCH));
        // replace all product links in search result with clean links
        waitForKeyElements(LINK_SELECTOR_SEARCH, (e) => cleanLink(e));
    } else if (/\/gp\/cart\//.test(window.location.pathname)) { // shopping cart
        // redirect to smile (if not already the case)
        smileRedirect(); // most important smile redirect (checkout)
    }
}());
