// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Streaming Tweaks
// @version     0.1.13
// @description Some tweaks for various streaming sites
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/streaming-tweaks.user.js
//
// @include     /^https?://www\.netflix\.com/watch//
// @include     /^https?://(www|smile)\.amazon\.(de|com)/gp/video/
// @include     /^https?://www\.youtube\.com/watch/
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
    const KEY_EQUAL = 187
    const KEY_R = 82
    const KEY_S = 83
    //const KEY_F = 70
    const KEY_F12 = 123

    // register amazon tweaks
    function amazonTweaksReg() {
        // ignore node warnings for repeated click events
        if (document.emitter !== undefined) document.emitter.setMaxListeners(0);

        // auto skip intro/credits/ads
        const AMAZON_SEL_SKIP = `.skipElement, .countdown, .adSkipButton`;

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

        // TODO add hotkey to toggle auto skip (sometimes not desired / button shown with wrong timing by amazon)
        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(AMAZON_SEL_SKIP, (e) => $(e).click(), 2000, { tailing: false });
    }


    // register netflix tweaks
    function netflixTweaksReg() {
        // auto skip intro/credits
        const NETFLIX_SEL_SKIP = `.skip-credits > a > span, .WatchNext-still-container`;

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

        // TODO add hotkey to toggle auto skip (sometimes not desired / button shown with wrong timing by amazon
        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(NETFLIX_SEL_SKIP, netflixCtrl, 5000, { tailing: false });
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
                }
            } else {
                if (idx > 0) {
                    ytplayer.setPlaybackRate(PLAYBACK_RATES[idx-1]);
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
        // keys: ]/[/= -> playback speed up / down / reset to default (1)
        cb.bindKeyDown(KEY_BRACKET_RIGHT, () => ytRateChange(true), { skipEditable: true });
        cb.bindKeyDown(KEY_BRACKET_LEFT, () => ytRateChange(false), { skipEditable: true });
        cb.bindKeyDown(KEY_EQUAL, () => ytplayer.setPlaybackRate(1), { skipEditable: true });
        // TODO, don't seem to work / be supported atm.
        // keys: ' or / -> hide / show controls
        //cb.bindKeyDown(KEY_QUOTE, () => ytplayer.hideControls(), { mods: { ctrl: true }, skipEditable: true});
        //cb.bindKeyDown(KEY_SLASH, () => ytplayer.showControls(), { mods: { ctrl: true }, skipEditable: true});
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
    } else if (/spotify/.test(window.location.host)) { // Spotify
        spotifyTweaksReg();
    }

}());
