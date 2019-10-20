// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2018+, userscript@cbaoth.de
//
// @name        Streaming Tweaks
// @version     0.1.9
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
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

    const KEY_ESC = 27
    const KEY_LEFT = 37
    const KEY_RIGHT = 39
    const KEY_PERIOD = 190
    const KEY_COMMA = 188
    const KEY_SLASH = 191
    const KEY_R = 82
    const KEY_S = 83
    const KEY_F = 70

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
        cb.bindKeyDown(KEY_LEFT, (e) => amazonCtrl($('div.fastSeekBack'), e, 6), { mods: { shift: true } });
        cb.bindKeyDown(KEY_RIGHT, (e) => amazonCtrl($('div.fastSeekForward'), e, 6), { mods: { shift: true } });
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, (e) => amazonCtrl($('div.fastSeekBack'), e, 60), { mods: { ctrl: true } });
        cb.bindKeyDown(KEY_RIGHT, (e) => amazonCtrl($('div.fastSeekForward'), e, 60), { mods: { ctrl: true } });

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
        cb.bindKeyDown(KEY_LEFT, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 6), { mods: { shift: true } });
        cb.bindKeyDown(KEY_RIGHT, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 6), { mods: { shift: true } });
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, (e) => netflixCtrl($('button.button-nfplayerBackTen'), e, 60), { mods: { ctrl: true } });
        cb.bindKeyDown(KEY_RIGHT, (e) => netflixCtrl($('button.button-nfplayerFastForward'), e, 60), { mods: { ctrl: true } });

        // TODO add hotkey to toggle auto skip (sometimes not desired / button shown with wrong timing by amazon
        // wait for skip elements (intro/outro) to appear, then skip
        cb.waitAndThrottle(NETFLIX_SEL_SKIP, netflixCtrl, 5000, { tailing: false });
    }


    // register youtube tweaks
    function youtubeTweaksReg() {
        var ytplayer = document.getElementById('movie_player') || document.getElementsByTagName('embed')[0];
        // https://developers.google.com/youtube/iframe_api_reference
        // https://developers.google.com/youtube/player_parameters
        if (ytplayer === undefined) return; // player not found/available

        // keys: shift+left/+right -> skip +/-1min
        cb.bindKeyDown(KEY_LEFT, () => ytplayer.seekTo(Math.max(ytplayer.getCurrentTime() - 60, 0)),
            { mods: { shift: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => ytplayer.seekTo(Math.min(ytplayer.getCurrentTime() + 60, ytplayer.getDuration() - 1)),
            { mods: { shift: true }, skipEditable: true });
        // keys: ctrl+left/+right -> skip +/-10min
        cb.bindKeyDown(KEY_LEFT, () => ytplayer.seekTo(Math.max(ytplayer.getCurrentTime() - 600, 0)),
            { mods: { ctrl: true }, skipEditable: true });
        cb.bindKeyDown(KEY_RIGHT, () => ytplayer.seekTo(Math.min(ytplayer.getCurrentTime() + 600, ytplayer.getDuration() - 1)),
            { mods: { ctrl: true }, skipEditable: true });
        // keys: . -> next video, , -> previous video
        cb.bindKeyDown(KEY_PERIOD, () => ytplayer.nextVideo(), { skipEditable: true });
        cb.bindKeyDown(KEY_COMMA, () => ytplayer.previousVideo(), { skipEditable: true });
        // TODO, don't seem to work / be supported atm.
        // keys: ' or / -> hide / show controls
        //cb.bindKeyDown(KEY_QUOTE, () => ytplayer.hideControls(), { mods: { ctrl: true }, skipEditable: true});
        //cb.bindKeyDown(KEY_SLASH, () => ytplayer.showControls(), { mods: { ctrl: true }, skipEditable: true});
    }


    // register spotify tweaks
    function spotifyTweaksReg() {
        // keys: ./, -> next/previous track
        cb.bindKeyDown(KEY_PERIOD, (e) => cb.clickElement($('.player-controls button[class*="forward"]')), { skipEditable: true });
        cb.bindKeyDown(KEY_COMMA, (e) => cb.clickElement($('.player-controls button[class*="back"]')), { skipEditable: true });
        // keys: s -> toggle shuffle
        cb.bindKeyDown(KEY_S, (e) => cb.clickElement($('.player-controls button[class*="shuffle"]')), { skipEditable: true });
        // keys: r -> switch repeat mode
        cb.bindKeyDown(KEY_R, (e) => cb.clickElement($('.player-controls button[class*="repeat"]')), { skipEditable: true });
        // keys: / -> search
        cb.bindKeyDown(KEY_SLASH, (e) => cb.clickElement($('.navBar div[class*="search-icon"]')), { skipEditable: true, preventDefault: true });
        // keys: ESC -> home screen (works in search field)
        //cb.bindKeyDown(KEY_ESC, (e) => cb.clickElement($('.navBar div[class*="home-icon"]')), { preventDefault: true });
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
