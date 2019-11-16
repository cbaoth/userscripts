// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        IMDB Tweaks
// @version     0.1.11
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
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.min.js
// ==/UserScript==

// TODO update average rating and star style when my ratings change
// TODO add glow to 10 star rating
// TODO consider changing star style inside rating widget

$ = jQuery = jQuery.noConflict(true);

(function () {

    // constants
    const HREF_CLEAN = 'https://' + window.location.hostname + window.location.pathname.replace(/\/*$/, '/');

    // GM_config
    const GM_CONFIG_ID = 'IMDB_Tweaks_Config'
    const GM_CONFIG_FIELDS = {
        'imdb-weaks-eplist-start-compact': {
            'label': 'Start IMDB Episode Lists in Compact Mode',
            'labelPos': 'above',
            'type': 'checkbox',
            'default': true
        }
    }
    GM_config.init(
    {
        'id': GM_CONFIG_ID,
        'title': 'IMDB Tweaks Config',
        'fields': GM_CONFIG_FIELDS,
        'events': {
            'open': function(doc) {
                var config = this;
                doc.getElementById(config.id + '_closeBtn').textContent = 'Cancel';
            },
            'save': function(values) {
                var config = this;
                config.close();
            }
        }
    });


    function svgGlowFilter(svg, {id = "glow", color = "gold", floodOpacity = 0.75, radius = 1.75, stdDeviation = 1.5 } = {}) {
        var defs = `<defs>
            <filter id="${id}" x="-5000%" y="-5000%" width="10000%" height="10000%">
                <feFlood result="flood" flood-color="${color}" flood-opacity="${floodOpacity}"></feFlood>
                <feComposite in="flood" result="mask" in2="SourceGraphic" operator="in"></feComposite>
                <feMorphology in="mask" result="dilated" operator="dilate" radius="${radius}"></feMorphology>
                <feGaussianBlur in="dilated" result="blurred" stdDeviation="${stdDeviation}"></feGaussianBlur>
                <feMerge>
                    <feMergeNode in="blurred"></feMergeNode>
                    <feMergeNode in="SourceGraphic"></feMergeNode>
                </feMerge>
             </filter>
         </defs>`;
        $(svg).prepend($.parseXML(defs).documentElement); // case sensitive
        $(svg).children("path").attr("filter", `url(#${id})`);
    }

    function myStarSetStyle(myStar, myRating) {
        var svg = $(myStar);

        function _fill(color) {
            svg.attr("fill", color);
            svg.css("fill", color);
        }

        switch (Math.floor(myRating)) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4: // red (transparent)
                _fill("#f14242");
                svg.css('opacity', '0.5');
                break;
            case 5:
            case 6: // purple
                _fill("#a765ff");
                break;
            case 7: // blue
                _fill("#4268f1");
                break;
            case 8:
            case 9: // gold
                _fill("#ffa826");
                break;
            case 10: // gold and large
                _fill("#ffa826");
                svg.css("width", "1.75em");
                svg.css("height", "1.75em");
                //svgGlowFilter(myStar); // TODO
                break;
            default:
                break; // unexpected rating: < 0 | > 10
        }
    }


    function updateMyStarStyle() {
        $('label.ipl-rating-interactive__star-container svg.ipl-star-icon').each(function(i, svg) {
            var ratingDiv = $(svg).parent().siblings("span.ipl-rating-star__rating")[0];
            if (ratingDiv === undefined) {
                return;
            }
            var rating = parseInt(ratingDiv.textContent);
            myStarSetStyle(svg, rating);
        });
    }


    function addSeasonAvgRating() {
        var episodeCount = $('div.eplist .list_item').length;
        var userRatings = $('div.ipl-rating-widget > div.ipl-rating-star > span.ipl-rating-star__rating');
        var myRatings = $('label.ipl-rating-interactive__star-container div.ipl-rating-interactive__star span.ipl-rating-star__rating');
        var userRatedEpisodesCount = 0;
        var userRatingsSum = 0;
        var myRatedEpisodesCount = 0;
        var myRatingsSum = 0;

        for (var i in userRatings) {
            var userRating = parseFloat(userRatings[i].textContent);
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

        var header = $('#episode_top');
        header.wrap('<div style="display: table; padding-top: 0.5em;"></div>');
        var ratingDiv = header.parent();
        header.wrap('<span style="display: table-cell;vertical-align:top;"></span>');

        var tDiv = '<div style="display: table-cell; padding-left: 1em; font-size: 1.2em;"><div style="display: table-row;"></div></div>';
        var tSpan = '<span style="display:table-cell; vertical-align:middle;"></span>';
        var starSvg = $('svg.ipl-star-icon')[0];
        var starBorderSvg = $('svg.ipl-star-border-icon')[0];

        var userAvgRating = userRatingsSum / userRatedEpisodesCount;
        var userAvgRatingDiv = $(tDiv);
        var userAvgRatingSpan = $(tSpan);
        var userStar;
        if (userAvgRating > 0) {
            userStar = $(starSvg).clone();
            userStar.css("fill", "#c39400");
            userAvgRatingSpan.append(Number.parseFloat(userAvgRating).toPrecision(2));
            userAvgRatingDiv.children('div').append(userStar);
            userAvgRatingDiv.children('div').append(userAvgRatingSpan);
            if (episodeCount > userRatedEpisodesCount) {
                userAvgRatingDiv.attr('title', 'Inaccurate due to missing ratings');
                userAvgRatingDiv.css('opacity', '0.5');
                userAvgRatingSpan.after('<span style="vertical-align: super; color: red;">*</span>');
            }
        } else {
            userStar = $(starBorderSvg).clone();
            userStar.css("fill", "#c39400");
            userAvgRatingDiv.children('div').append(userStar);
            //userAvgRatingDiv.children('div').append(userAvgRatingSpan);
            //userAvgRatingSpan.append('?');
            userAvgRatingDiv.css('opacity', '0.5');
        }
        ratingDiv.append(userAvgRatingDiv);

        // TODO same stuff as above
        var myAvgRating = myRatingsSum / myRatedEpisodesCount;
        var myAvgRatingDiv = $(tDiv);
        var myAvgRatingSpan = $(tSpan);
        var myStar;
        if (myAvgRating > 0) {
            myStar = $(starSvg).clone();
            myStarSetStyle(myStar, myAvgRating);
            myAvgRatingSpan.append(Number.parseFloat(myAvgRating).toPrecision(2));
            myAvgRatingDiv.children('div').append(myStar);
            myAvgRatingDiv.children('div').append(myAvgRatingSpan);
            if (episodeCount > myRatedEpisodesCount) {
                myAvgRatingDiv.attr('title', 'Inaccurate due to missing ratings');
                myAvgRatingDiv.css('opacity', '0.5');
                myAvgRatingSpan.after('<span style="vertical-align: super; color: red;">*</span>');
            }
        } else {
            myStar = $(starBorderSvg).clone();
            myStar.css('fill', '#4268f1');
            myAvgRatingDiv.children('div').append(myStar);
            //myAvgRatingDiv.children('div').append(myAvgRatingSpan);
            //myAvgRatingSpan.append('?');
            myAvgRatingDiv.css('opacity', '0.5');
        }
        ratingDiv.append(myAvgRatingDiv);
    }


    function episodeListTweaks() {

        // add season selector
        cb.waitAndDebounce('select#bySeason', () => {
            var url = new URL(window.location.href);
            var currentNr = url.searchParams.get("season");
            var anchors = $('select#bySeason > option').map((i, e) => {
                var nr = $(e).val();
                return nr == currentNr ? nr : '<a href="' + HREF_CLEAN + '?season=' + $(e).val() + '">' + nr + '</a>';
            });
            // replace season selection combobox with direct links
            $('select#bySeason').replaceWith('<div style="float: left; padding-top: 3px;">' + Array.join(anchors, "&nbsp;") + '</div>');
            // add direct links on bottom too
            $('div.eplist').parent().append('<div style="float: left; padding: 20px 5px;">Season: &nbsp;'
                + Array.join(anchors, "&nbsp;") + '</div>')
        });

        cb.waitAndDebounce('div.eplist', (e) => {
            // add season average rating
            addSeasonAvgRating();

            // update my rating star style
            updateMyStarStyle();

            // add episode number to title
            $('.eplist .list_item').each((i, e) => {
                var numberDiv = $(e).find('.image .hover-over-image > div');
                var titleA = $(e).find('.info > strong > a');
                if (/\w+[0-9]+[,. ]+\w+[0-9]+/i.test(numberDiv.text())) {
                    titleA.text(numberDiv.text().replace(/[A-Za-z]+([0-9]+)[,. ]+[A-Za-z]+([0-9]+)/i, '$2. ') + titleA.text());
                } else {
                    titleA.text('?. ' + titleA.text());
                }
            });
        });

        // always hide 'watch/buy' ads below episode, TODO: maybe show minimal 'watch' link only .amazon-instant-video
        cb.waitAndDebounce('.wtw-option-standalone', () => $('.wtw-option-standalone').remove());


        // always shorten description text so that the episode details don't get larger than the image height
        cb.waitAndDebounce('div.item_description', () => {
            var elements = $('div.item_description');
            elements.css({ 'padding-bottom': '0px', 'margin-bottom': '0px', 'line-height': '125%' });
            elements.each((i, e) => $(e).text(cb.stringShorten($(e).text(), 200)));
            detailsToggle(GM_config.get('imdb-weaks-eplist-start-compact'));
        });


        // toggle episode description
        var detailsHidden = false;
        var detailsToggle = function (compact) {
            if (compact === void 0) {
                detailsHidden = !detailsHidden; // toggle
            } else {
                detailsHidden = compact
                //GM_config.set('imdb-weaks-eplist-start-compact', detailsHidden); // update settings
            }
            $('.list_item > .image > .hover-over-image > image').toggle(); // image
            // resize images and overlay text (season & episode number)
            if (detailsHidden) {
                $('.list_item .hover-over-image').css({ 'width': '40%', 'height': '40%' });
                $('.list_item .hover-over-image > div').css({ 'width': '89px' });
                $('.add-image-container.episode-list').css({ 'width': '89px', 'height': '50px' });
                $('.list_item img, .list_item .add-image-icon').css({ 'width': '100%', 'height': '100%' });
            } else {
                $('.list_item .hover-over-image').css({ 'width': '100%', 'height': '100%' });
                $('.list_item .hover-over-image > div').css({ 'width': '' });
                $('.add-image-container.episode-list').css({ 'width': '224px', 'height': '126px' });
                $('.list_item img, .list_item .add-image-icon').css({ 'width': '100%', 'height': '65%' });
            }
            $('div.item_description').toggle(!detailsHidden); // toggle description text
        };
        // hot-key "d" to toggle description (skip in case input field is active)
        cb.bindKeyDown(68, () => detailsToggle(void 0), { skipEditable: true });
    }


    // all page tweaks
    function globalTweaks() {
        // enforce dark background
        cb.waitAndDebounce('div#wrapper', () => GM_addStyle(`div#wrapper { background: #17181b !important; }`));
        // hot-key alt-F12 -> Open config dialog.
        cb.bindKeyDown(123, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(27, () => { $('#' + GM_CONFIG_ID).length && GM_config.close() }, { skipEditable: true });
    }

    // all page tweaks
    globalTweaks();

    // episode list tweaks
    if (/title\/[^/]+\/episodes/.test(window.location.pathname)) {
        episodeListTweaks();
    }
})();
