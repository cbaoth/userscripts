// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Streaming Tweaks
// @version     0.1.22
// @description Some tweaks for various streaming sites
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/streaming-tweaks.user.js
//
// @include     /^https?://www\.netflix\.com/watch//
// @include     /^https?://(www|smile)\.amazon\.(de|com)/(.*/)*[dg]p//
// @include     /^https?://www\.youtube\.com/watch/
// @include     /^https?://www\.disneyplus\.com//
// @include     https://open.spotify.com/*
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.min.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    const KEY_ESC = 27
    const KEY_LEFT = 37
    const KEY_RIGHT = 39
    const KEY_PERIOD = 190
    const KEY_COMMA = 188
    const KEY_SLASH = 191
    const KEY_BRACKET_LEFT = 219
    const KEY_BRACKET_RIGHT = 221
    const KEY_EQUAL = 61
    const KEY_EQUAL_SIGN = 187
    const KEY_R = 82
    const KEY_S = 83
    const KEY_F = 70
    const KEY_BACKSPACE = 8
    const KEY_F12 = 123

    // register amazon tweaks
    function amazonTweaksReg() {
        // ignore node warnings for repeated click events
        if (document.emitter !== undefined) document.emitter.setMaxListeners(0);

        // auto skip intro/credits/ads
        const AMAZON_SEL_SKIP = `.skipElement, .countdown`;
        const AMAZON_SEL_SKIP_ADS = `.adSkipButton`;

        // GM_config
        const GM_CONFIG_ID = 'StreamingTweaks_AmazonPrimeVideo_Config'
        const GM_CONFIG_FIELDS = {
            'az-auto-skip': {
                'label': 'Auto Skip Intro/Outro (next episode)',
                'type': 'checkbox',
                'default': true
            },
            'az-auto-skip-ads': {
                'label': 'Auto Skip Ads',
                'type': 'checkbox',
                'default': true
            }
        }
        GM_config.init({
            'id': GM_CONFIG_ID,
            'title': 'Streaming Tweaks - Amazon Prime Video Config',
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
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => { $('#' + GM_CONFIG_ID).length && GM_config.close() }, { skipEditable: true });

        // control (click) function
        var amazonCtrl = (elements, event, times = 1) => {
            // perform click(s)
            cb.clickElement(elements[0], times);
        };

        // keys: . -> next episode
        cb.bindKeyDown(KEY_PERIOD, (e) => amazonCtrl($('div.nextTitleButton'), e));
        // keys: shift+left/+right -> skip +/-1min
        cb.bindKeyDown(KEY_LEFT, (e) => amazonCtrl($('div.fastSeekBack'), e, 6), { mods: { shift: true }});
        cb.bindKeyDown(KEY_RIGHT, (e) => amazonCtrl($('div.fastSeekForward'), e, 6), { mods: { shift: true }});
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, (e) => amazonCtrl($('div.fastSeekBack'), e, 60), { mods: { ctrl: true }});
        cb.bindKeyDown(KEY_RIGHT, (e) => amazonCtrl($('div.fastSeekForward'), e, 60), { mods: { ctrl: true }});

        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(AMAZON_SEL_SKIP, (e) => { GM_config.get('az-auto-skip') && $(e).click(); }, 2000, { tailing: false });
        cb.waitAndThrottle(AMAZON_SEL_SKIP_ADS, (e) => { GM_config.get('az-auto-skip-ads') && $(e).click(); }, 2000, { tailing: false });
    }


    // register netflix tweaks
    function netflixTweaksReg() {
        // auto skip intro/credits
        const NETFLIX_SEL_SKIP = `.skip-credits > a > span, .WatchNext-still-container, button[data-uia='next-episode-seamless-button']`;

        // GM_config
        const GM_CONFIG_ID = 'StreamingTweaks_Netflix_Config'
        const GM_CONFIG_FIELDS = {
            'nf-auto-skip': {
                'label': 'Auto Skip Intro/Outro',
                'type': 'checkbox',
                'default': true
            }
        }
        GM_config.init({
            'id': GM_CONFIG_ID,
            'title': 'Streaming Tweaks - Netflix Config (next episode)',
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
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => { $('#' + GM_CONFIG_ID).length && GM_config.close() }, { skipEditable: true });

        // control (click) function
        var netflixCtrl = (elements, event, times = 1, { autoplay } = { autoplay: true }) => {
            // perform click(s)
            cb.clickElement(elements[0], times);
            // playback may be paused, in this case press "play" after 1sec delay
            if (autoplay) {
                setTimeout(() => {
                    var play = $('button.button-nfplayerPlay')[0];
                    if (play !== undefined) play.click();
                }, 250);
            }
            // TODO hide controls (auto pop-up)
        };

        // keys: . -> next episode
        cb.bindKeyDown(KEY_PERIOD, (e) => netflixCtrl($('button.button-nfplayerNextEpisode'), e));
        // keys: shift+left/+right -> skip +/-1min
        cb.bindKeyDown(KEY_LEFT, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 6), { mods: { shift: true }});
        cb.bindKeyDown(KEY_RIGHT, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 6), { mods: { shift: true }});
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 60), { mods: { ctrl: true }});
        cb.bindKeyDown(KEY_RIGHT, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 60), { mods: { ctrl: true }});

        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(NETFLIX_SEL_SKIP, (e) => { GM_config.get('nf-auto-skip') && netflixCtrl(e); }, 5000, { tailing: false });
    }


    // register youtube tweaks
    function youtubeTweaksReg() {
        // GM_config
        const GM_CONFIG_ID = 'StreamingTweaks_YouTube_Config'
        const GM_CONFIG_FIELDS = {
            'yt-default-playback-rate': {
                'label': 'Default Playback Rate',
                'labelPos': 'above',
                'type': 'select',
                'options': ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"],
                'default': '1'
            },
            'yt-prevent-auto-playback': {
                'label': 'Prevent Auto-Playback',
                'type': 'checkbox',
                'default': true
            }
        }
        GM_config.init({
            'id': GM_CONFIG_ID,
            'title': 'Streaming Tweaks - YouTube Config',
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
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => { $('#' + GM_CONFIG_ID).length && GM_config.close() }, { skipEditable: true });

        // tooltip
        function showTT(msg) {
            cb.createTT(msg, 500, { offsetX: 50, offsetY: 100, offsetMouse: false, fadeoutTime: 500, css:{ "font-size": "2em" }});
        }

        var ytplayer = document.getElementById('movie_player') || document.getElementsByTagName('embed')[0];
        const PLAYBACK_RATES = ytplayer.getAvailablePlaybackRates();
        // https://developers.google.com/youtube/iframe_api_reference
        // https://developers.google.com/youtube/player_parameters
        if (ytplayer === undefined) return; // player not found/available

        function ytRateChange(up)
        {
            var idx = PLAYBACK_RATES.indexOf(ytplayer.getPlaybackRate())
            if (up) {
                if (idx < PLAYBACK_RATES.length-1) {
                    ytplayer.setPlaybackRate(PLAYBACK_RATES[idx+1]);
                    showTT('Speed: '+PLAYBACK_RATES[idx+1]+"x");
                }
            } else {
                if (idx > 0) {
                    ytplayer.setPlaybackRate(PLAYBACK_RATES[idx-1]);
                    showTT('Speed: '+PLAYBACK_RATES[idx-1]+"x");
                }
            }
        }

        // set configured default playback rate
        ytplayer.setPlaybackRate(parseFloat(GM_config.get('yt-default-playback-rate')));
        // prevent auto-playback?
        if (GM_config.get('yt-prevent-auto-playback')) {
            ytplayer.pauseVideo();
        }

        // keys: shift+left/+right -> skip +/-1min
        cb.bindKeyDown(KEY_LEFT, () => ytplayer.seekTo(Math.max(ytplayer.getCurrentTime() - 60, 0)),
                       { mods:{ shift: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => ytplayer.seekTo(Math.min(ytplayer.getCurrentTime() + 60, ytplayer.getDuration() - 1)),
                       { mods:{ shift: true }, skipEditable: true });
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, () => ytplayer.seekTo(Math.max(ytplayer.getCurrentTime() - 600, 0)),
                       { mods:{ ctrl: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => ytplayer.seekTo(Math.min(ytplayer.getCurrentTime() + 600, ytplayer.getDuration() - 1)),
                       { mods:{ ctrl: true }, skipEditable: true });
        // keys: . -> next video, , -> previous video
        cb.bindKeyDown(KEY_PERIOD, () => ytplayer.nextVideo(), { skipEditable: true });
        cb.bindKeyDown(KEY_COMMA, () => ytplayer.previousVideo(), { skipEditable: true });
        // keys: ]/[ -> playback speed up / down
        cb.bindKeyDown(KEY_BRACKET_RIGHT, () => ytRateChange(true), { skipEditable: true });
        cb.bindKeyDown(KEY_BRACKET_LEFT, () => ytRateChange(false), { skipEditable: true });
        // keys: shift+]/[ -> playback speed up to max / down to min
        cb.bindKeyDown(KEY_BRACKET_RIGHT, () => { showTT('Speed: '+2+"x"); ytplayer.setPlaybackRate(2); },
                       { mods:{ shift: true }, skipEditable: true });
        cb.bindKeyDown(KEY_BRACKET_LEFT, () => { showTT('Speed: '+0.25+"x"); ytplayer.setPlaybackRate(0.25); },
                       { mods:{ shift: true }, skipEditable: true });
        // keys: = -> playback speed back to default (1)
        cb.bindKeyDown(KEY_EQUAL, () => { showTT('Speed: '+1+"x"); ytplayer.setPlaybackRate(1); },
                       { skipEditable: true });
        cb.bindKeyDown(KEY_EQUAL_SIGN, () => { showTT('Speed: '+1+"x"); ytplayer.setPlaybackRate(1); },
                       { skipEditable: true });
        // TODO, don't seem to work / be supported atm.
        // keys: ' or / -> hide / show controls
        //cb.bindKeyDown(KEY_QUOTE, () => ytplayer.hideControls(), { mods: { ctrl: true }, skipEditable: true});
        //cb.bindKeyDown(KEY_SLASH, () => ytplayer.showControls(), { mods: { ctrl: true }, skipEditable: true});
    }


    // register disney+ tweaks
    function disneyPlusTweaksReg() {
        // auto skip intro/credits
        const DISNEY_FS = `button.fullscreen-icon, button.exit-fullscreen-icon`;
        const DISNEY_RWD = `button.rwd-10sec-icon`;
        const DISNEY_FF = `button.ff-10sec-icon`;
        const DISNEY_RETURN = `button.control-icon-btn.back-arrow`;
        //const DISNEY_SEARCH = `a[data-route="SEARCH"]`
        const DISNEY_SKIP_INTRO = `button.skip__button`;
        const DISNEY_SKIP_NEXT = `div[role=alert] button.play`;
        const DISNEY_SKIP = DISNEY_SKIP_INTRO + ", " + DISNEY_SKIP_NEXT;

        // GM_config
        const GM_CONFIG_ID = 'StreamingTweaks_DisneyPlus_Config'
        const GM_CONFIG_FIELDS = {
            'dn-auto-skip': {
                'label': 'Auto Skip Intro/Outro',
                'type': 'checkbox',
                'default': true
            }
        }
        GM_config.init({
            'id': GM_CONFIG_ID,
            'title': 'Streaming Tweaks - Disney+ Config (next episode)',
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
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => { $('#' + GM_CONFIG_ID).length && GM_config.close() }, { skipEditable: true });


        // keys: f -> toggle fullscreen
        cb.bindKeyDown(KEY_F, () => cb.clickElement($(DISNEY_FS)[0]), { skipEditable: true });
        // keys: shift+left/+right -> skip +/-1min
        cb.bindKeyDown(KEY_LEFT, () => cb.clickElement($(DISNEY_RWD)[0] ,6),
                       { mods:{ shift: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => cb.clickElement($(DISNEY_FF)[0], 6),
                       { mods:{ shift: true }, skipEditable: true });
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, () => cb.clickElement($(DISNEY_RWD)[0], 60),
                       { mods:{ ctrl: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => cb.clickElement($(DISNEY_FF)[0], 60),
                       { mods:{ ctrl: true }, skipEditable: true });
        // keys: BACKSPACE -> exit playback
        cb.bindKeyDown(KEY_BACKSPACE, () => cb.clickElement($(DISNEY_RETURN)[0]), { skipEditable: true });
        // keys: s-> skip (e.g. intro)
        cb.bindKeyDown(KEY_S, () => cb.clickElement($(DISNEY_SKIP)[0]), { skipEditable: true });
        //// keys: s -> search
        //cb.bindKeyDown(KEY_S, () => cb.clickElement($(DISNEY_SEARCH).children()[0]), { skipEditable: true });

        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(DISNEY_SKIP, (e) => { GM_config.get('dn-auto-skip') && $(e).click(); }, 2000, { tailing: false });
    }


    // register spotify tweaks
    function spotifyTweaksReg() {
        // keys: ./, -> next/previous track
        cb.bindKeyDown(KEY_PERIOD, (e) => cb.clickElement($('.player-controls button[class*="forward"]')[0]), { skipEditable: true });
        cb.bindKeyDown(KEY_COMMA, (e) => cb.clickElement($('.player-controls button[class*="back"]')[0]), { skipEditable: true });
        // keys: s -> toggle shuffle
        cb.bindKeyDown(KEY_S, (e) => cb.clickElement($('.player-controls button[class*="shuffle"]')[0]), { skipEditable: true });
        // keys: r -> switch repeat mode
        cb.bindKeyDown(KEY_R, (e) => cb.clickElement($('.player-controls button[class*="repeat"]')[0]), { skipEditable: true});
        // keys: / -> search
        cb.bindKeyDown(KEY_SLASH, (e) => cb.clickElement($('.navBar div[class*="search-icon"]')[0]), { skipEditable: true, preventDefault: true });
        // keys: ESC -> home screen (works in search field)
        //cb.bindKeyDown(KEY_ESC, (e) => cb.clickElement($('.navBar div[class*="home-icon"]')[0]), { preventDefault: true });
    }


    // register tweaks depending on page
    if (/amazon/.test(window.location.host)) { // Amazon prime video
        amazonTweaksReg();
    } else if (/netflix/.test(window.location.host)) { // Netflix
        netflixTweaksReg();
    } else if (/youtube/.test(window.location.host)) { // YouTube
        youtubeTweaksReg();
    } else if (/disneyplus/.test(window.location.host)) { // Disney+
        disneyPlusTweaksReg();
    } else if (/spotify/.test(window.location.host)) { // Spotify
        spotifyTweaksReg();
    }

}());
