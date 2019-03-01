// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        IMDB Tweaks
// @version     0.1.2
// @description Some tweaks for IMDB
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/imdb-tweaks.user.js
//
// @include     /^https?://([^/]+\.)*imdb\.com//
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
    var href_clean = 'https://' + window.location.hostname + window.location.pathname.replace(/\/*$/, '/');

    // tweake episode list
    if (/title\/[^/]+\/episodes/.test(window.location.pathname)) {
        // constants
        const SEASON_LIST_COMPACT_DETAILS = true; // start page with minimized episode details (toggle using 'd')

        // add season selector
        cb.waitAndDebounce('select#bySeason', () => {
            var url = new URL(window.location.href);
            var currentNr = url.searchParams.get("season");
            var anchors = $('select#bySeason > option').map((i, e) => {
                var nr = $(e).val();
                return nr == currentNr ? nr : '<a href="' + href_clean + '?season=' + $(e).val() + '">' + nr + '</a>';
            });
            // replace season selection combobox with direct links
            $('select#bySeason').replaceWith('<div style="float: left; padding-top: 3px;">' + Array.join(anchors, "&nbsp;") + '</div>');
            // add direct links on bottom too
            $('div.eplist').parent().append('<div style="float: left; padding: 20px 5px;">Season: &nbsp;'
                + Array.join(anchors, "&nbsp;") + '</div>')
        });

        // add season average rating
        cb.waitAndDebounce('div.eplist', () => {
            var userRatings = $('div.ipl-rating-widget > div.ipl-rating-star > span.ipl-rating-star__rating');
            var myRatings = $('label.ipl-rating-interactive__star-container div.ipl-rating-interactive__star span.ipl-rating-star__rating');
            var userRatedEpisodesCount = 0;
            var userRatingsSum = 0;
            var myRatedEpisodesCount = 0;
            var myRatingsSum = 0;
            for (i in userRatings) {
                var userRating = parseInt(userRatings[i].textContent);
                if (userRating !== NaN && userRating > 0) {
                    userRatedEpisodesCount++;
                    userRatingsSum += userRating;
                }
                var myRating = parseInt(myRatings[i].textContent);
                if (myRating !== NaN && myRating > 0) {
                    myRatedEpisodesCount++;
                    myRatingsSum += myRating;
                }
            }
            var userAvgRating = userRatingsSum / userRatedEpisodesCount;
            var myAvgRating = myRatingsSum / myRatedEpisodesCount;
            //var header = $('div.subpage_title_block > .header');
            var header = $('#episode_top');
            header.wrap('<div style="display: table; padding-top: 0.5em;"></div>');
            var ratingDiv = header.parent();
            header.wrap('<span style="display: table-cell;vertical-align:top;"></span>');
            var tSpan = '<span style="display:table-cell; vertical-align:middle;">';
            var tDiv = '<div style="display: table-cell; padding-left: 1em;"><div style="display: table-row;">';
            var starSvg = $('div.ipl-rating-star svg.ipl-star-icon')[0];
            var added = false;
            if (userAvgRating > 0) {
                var yellowStar = $(starSvg).clone();
                yellowStar.css("fill", "#c39400");
                ratingDiv.append(tDiv + yellowStar[0].outerHTML + tSpan
                    + Number.parseFloat(userAvgRating).toPrecision(2)
                    + '</span></div></div>');
                added = true;
            }
            if (myAvgRating > 0) {
                var blueStar = $(starSvg).clone();
                blueStar.css("fill", "#4268f1");
                ratingDiv.append(tDiv + blueStar[0].outerHTML + tSpan
                    + Number.parseFloat(myAvgRating).toPrecision(2)
                    + '</span></div>');
                added = true;
            }
        });


        // always hide 'watch/buy' ads below episode, TODO: maybe show minimal 'watch' link only .amazon-instant-video
        cb.waitAndDebounce('.wtw-option-standalone', () => $('.wtw-option-standalone').remove());
        // always shorten description text so that the episode details don't get larger than the image height
        cb.waitAndDebounce('div.item_description', () => {
            var elements = $('div.item_description');
            elements.css({ 'padding-bottom': '0px', 'margin-bottom': '0px', 'line-height': '125%' });
            elements.each((i, e) => $(e).text(cb.stringShorten($(e).text(), 200)));
            if (SEASON_LIST_COMPACT_DETAILS) detailsToggle();
        });

        // toggle episode description
        var detailsHidden = false;
        var detailsToggle = function () {
            detailsHidden = !detailsHidden; // toggle
            $('div.list_item > div.image > div.hover-over-image > image').toggle(); // image
            // resize images and overlay text (season & episode number)
            if (detailsHidden) {
                $('div.list_item div.hover-over-image').css({ 'width': '40%', 'height': '40%' });
                $('div.list_item img').css({ 'width': '100%', 'height': '100%' });
            } else {
                $('div.list_item div.hover-over-image').css({ 'width': '100%', 'height': '100%' });
                $('div.list_item img').css({ 'width': '100%', 'height': '100%' })
            }
            $('div.item_description').toggle(!detailsHidden); // toggle description text
        };
        // hot-key "d" to toggle description
        cb.bindKeyDown(68, detailsToggle);
    }

    // all pages: enforce dark background
    cb.waitAndDebounce('div#wrapper', () => GM_addStyle(`div#wrapper { background: #17181b !important; }`));
})();
