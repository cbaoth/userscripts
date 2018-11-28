// ==UserScript==
// @name        Amazon ASIN Links (Preisüberwachung)
// @name:en     Amazon ASIN Links (price tracking)
// @namespace   https://cbaoth.de
// @version     0.3
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/amazon-links.user.js
// @description Fügt auf allen Amazon Produktseiten links zur Preisüberwachungsseite keepa.com sowie ein direkter Amazon Produktlink (ohne unnütze URL Parameter, zum Teilen des Links).
// @description:en Adds links to the price watching page keepa.com as well as a direct link to the Amazon Product (without any URL parameters, for sharing).
//
// @include     /^https?://[^/]*amazon.\w+//
//
// @grant none
//
// @require http://code.jquery.com/jquery-latest.min.js
// @require https://gist.github.com/raw/2625891/waitForKeyElements.js
// ==/UserScript==

// config parameters
const SHOW_LINK_ICON = 1; // toggle link fav icons
const LINK_STYLE = "font-weight: bold; font-style: italic;";
const SHOW_LINK_TEXT = 1; // toggle link text


// constants
const PRICE_SELECTOR = 'tr#priceblock_ourprice_row > td:last-child, #priceblock_dealprice_row > td:last-child';

// add links
function addAmazonLinks() {
    if (! $('input#ASIN:first').length) {
        return; // this doesn't seem to be a product page
    }

    // get the ASIN (product id)
    var asin = $('input#ASIN:first').val();

    // get top level domain (the simple way)
    var tld = document.domain.split('.').pop();
    if ([ 'au', 'br', 'mx' ].indexOf(tld) > -1) { // add .com to some domains
        tld = 'com.'+tld;
    } else if ([ 'uk', 'jp' ].indexOf(tld) > -1) { // add .co to others
        tld = 'co.'+tld;
    }

    // create all new links

    // direct link
    var link1tooltip = (tld == 'de' ? 'Direkter Produktlink' : 'Direct product link');
    var link1url = 'http://amazon.' + tld + '/dp/' + asin;
    var link1 = (SHOW_LINK_ICON ? '<img src="http://www.amazon.'+tld+'/favicon.ico" border="0" align="absmiddle" width="16" height="16" />&nbsp;' : '')
                + '<a target="_blank" href="' + link1url + '" style="color: #e47911;' + LINK_STYLE + '" title="' + link1tooltip + '">'
                + (SHOW_LINK_TEXT ? (tld == 'de' ? 'Direkter Link' : 'Direct Link') : '')
                + '</a>';

    // keepa.com
    var keepaIds = { "com":1, "uk":2, "de":3, "fr":4, "jp":5, "ca":6, "cn":7, "it":8, "es":9, "in":10, "mx":11, "br":12, "au":13 };
    var link2tooltip = (tld == 'de' ? 'Keepa Preishistorie' : 'Keepa price history');
    var link2url = 'https://keepa.com/#!product/' + keepaIds[tld] + '-' + asin;
    var link2 = (SHOW_LINK_ICON ? '<img src="https://keepa.com/favicon.ico" border="0" align="absmiddle" width="16" height="16" />&nbsp;' : '')
                + '<a target="_blank" href="' + link2url + '" style="color: #039;' + LINK_STYLE + '" title="' + link2tooltip + '">'
                + (SHOW_LINK_TEXT ? 'Keepa' : '') + '</a>';

    // add the links as new table row below the price information
    //$('table.product > tbody:last > tr:last, table.a-lineitem > tbody:last > tr:last')
    //  .after('<tr><td></td><td>'+link1+link2+'</td></tr>');
    $(PRICE_SELECTOR)
        .append('<span style="margin-left: 2em;">'+link1+' &nbsp; '+link2+'</span>');
}

waitForKeyElements(PRICE_SELECTOR, addAmazonLinks);
