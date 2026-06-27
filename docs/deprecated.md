# Deprecated & Legacy Scripts

> **These scripts are unmaintained and under review.** They have not had functional
> updates in a long time and may no longer work with the current versions of the
> respective sites. They receive no updates, so the `@updateURL`/`@downloadURL`
> may also be unreachable. Each is tracked for review in [TODO.md](TODO.md) —
> they will be verified, updated, or removed over time.

Linked back from the main [README](../README.md).

---

## Amazon Tweaks

> **Note:** Last updated 2022-01-11. This script may no longer work correctly with the current version of the site.

[amazon-links.user.js](../amazon-links.user.js) improves amazon shop pages.

- **Product page**
  - Auto select _one-time_ buy option (instead of default: subscription)
  - Adds a new _keepa_ icon next to the price, and makes icon and price a link _(open in new tab)_ to the product's [keepa](https://keepa.com) price tracking page.
    - Note that the keepa page will show the default amazon region and language _(top right selection)_ but the price information will match the correct region of the source amazon page.
  - Adds a new _amazon_ icon next to the price with a direct link to the product's page _(short URL, no tracking, affiliation, etc.)_ e.g. for sharing.
  - Adds a new [MetaReview](https://metareview.com) link next to the average rating stars.

  ![](../adoc_assets/amazon-links1.png)

- **Search page**
  - Replaces search result prices with links to the product's [keepa](https://keepa.com) price history page.
  - Replaces search result product links with clean ones _(short URL, no tracking, affiliation, etc.)_.
- **Order overview**
  - Adds light green background to delivered, and orange background to open / shipped orders.

---

## Auto Show Forum Spoilers

> **Note:** Last updated 2021-02-23. This script may no longer work correctly with the current version of the site.

[auto-show-forum-spoilers.user.js](../auto-show-forum-spoilers.user.js) automatically expands spoilers in common forums and collapsed "continue reading .." texts on patreon.com.

---

## IMDB Tweaks

> **Note:** Last updated 2020-10-26. This script may no longer work correctly with the current version of the site.

[imdb-tweaks.user.js](../imdb-tweaks.user.js) improves [imdb](https://www.imdb.com/):

- Enforces a dark background _(a good idea with or without using [Dark Reader](https://chrome.google.com/webstore/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh))_
- Adds new key bindings:

| Keys    | Action |
|---------|--------|
| Alt-F12 | Open script configuration (ESC to close) |

### Episode List

- Adds direct season links to episode list _(top & bottom)_:

  ![](../adoc_assets/imdb-tweaks-seasons1.png)

- Makes the list more compact _(default, configurable)_, adds hotkey `d` to toggle details:

  ![](../adoc_assets/imdb-tweaks-season-list-details.gif)

- Adds average season ratings _(all users and own, faded in case of missing ratings)_:

  ![](../adoc_assets/imdb-tweaks-seasons-rating1.png)

- Adds episode number to episode titles.
- Changes own rating star colors:
  - 1-4 → light gray
  - 5-6 → gray
  - 7 → blue _(average IMDB rating, regular star color)_
  - 8-9 → gold
  - 10 → gold _(larger star)_
- Adds new key bindings:

| Keys         | Action |
|--------------|--------|
| d            | Toggle compact list mode |
| [0-9]        | Navigate to season 0 to 9 _(if available)_ |
| Shift-[0-9]  | Navigate to season 10 to 19 _(if available)_ |
| [            | Navigate to previous season _(if available)_ |
| ]            | Navigate to next season _(if available)_ |

---

## Search Hotkey

> **Note:** Last updated 2022-07-01. This script may no longer work correctly with the current version of the site.

[search-hotkey.user.js](../search-hotkey.user.js) adds the `alt-f` hotkey to some pages for faster searching (focus search input field).

Currently supported pages:

- https://wikipedia.org
- https://fandom.com — entertainment & gaming wikis

---

## Streaming Tweaks

> **Note:** Last updated 2022-11-11. This script may no longer work correctly with the current version of the site.

[streaming-tweaks.user.js](../streaming-tweaks.user.js) improves the user experience of some streaming services.

### Netflix

Improvements to the [Netflix](https://netflix.com) web player:

- Automatically skips the intro _(where supported)_.
- Automatically skips to the next episode _(in closing credits view)_.
- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| Shift-Right   | Fast-forward 1min |
| Shift-Left    | Rewind 1min |
| Ctrl-Right    | Fast-forward 10min |
| Ctrl-Left     | Rewind 10min |
| . _(period)_  | Next episode |
| Alt-F12       | Open script configuration (ESC to close) |

- Configuration for:
  - Auto-skip intro and outro/to next episode (default: true)

### Amazon Prime Video

Improvements to Amazon's [prime video](https://www.primevideo.com/) web player:

- Automatically skips the intro _(where supported)_.
- Automatically skips to the next episode _(in closing credits view)_.
- Automatically skips ads / trailers _(upfront & between episodes)_.
- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| Shift-Right   | Fast-forward 1min |
| Shift-Left    | Rewind 1min |
| Ctrl-Right    | Fast-forward 10min |
| Ctrl-Left     | Rewind 10min |
| . _(period)_  | Next episode |
| Alt-F12       | Open script configuration (ESC to close) |

- Configuration for:
  - Auto-skip intro and outro/to next episode (default: true)
  - Auto-skip ads (default: true)

_Note: If this doesn't work please check the include. Script currently only matches URLs `/^https?://(www|smile)\.amazon\.(de|com)/gp/video/`. Depending on how you reach the player, the `/gp/video/` might be missing in the URL._

### YouTube

Improvements to [YouTube](https://www.youtube.com):

- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| Shift-Right   | Fast-forward 1min |
| Shift-Left    | Rewind 1min |
| Ctrl-Right    | Fast-forward 10min |
| Ctrl-Left     | Rewind 10min |
| . _(period)_  | Next video |
| , _(comma)_   | Previous video _(playlist only)_ |
| =             | Default playback rate (1x) |
| ]             | Increase playback rate (up to 2x) |
| [             | Decrease playback rate (down to 0.25x) |
| Shift-]       | Increase playback rate max (2x) |
| Shift-[       | Decrease playback rate min (0.25x) |
| U             | Toggle thumb up |
| D             | Toggle thumb down |
| Alt-F12       | Open script configuration (ESC to close) |

- Configuration for:
  - Default playback rate (default: 1x)
  - Stop auto-playback (stop playback when page opens, default: true)

### Disney+

Improvements to the [Disney+](https://disneyplus.com) web player:

- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| Shift-Right   | Fast-forward 1min |
| Shift-Left    | Rewind 1min |
| Ctrl-Right    | Fast-forward 10min |
| Ctrl-Left     | Rewind 10min |
| F             | Toggle fullscreen |
| S             | Skip intro/outro (if auto-skip is off) |
| BACKSPACE     | Exit player |
| Alt-F12       | Open script configuration (ESC to close) |

- Configuration for:
  - Auto-skip intro and outro/to next episode (default: true)

### Plex.TV

Improvements to the [Plex](https://plex.tv) web player:

- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| Shift-Right   | Fast-forward 1min |
| Shift-Left    | Rewind 1min |
| Ctrl-Right    | Fast-forward 10min |
| Ctrl-Left     | Rewind 10min |
| F             | Toggle fullscreen |
| M             | Toggle mute |
| BACKSPACE     | Exit player |

### Spotify

Improvements to [Spotify](https://open.spotify.com):

- Adds new key bindings:

| Keys          | Action |
|---------------|--------|
| . _(period)_  | Next track |
| , _(comma)_   | Previous track _(if any)_ |
| r             | Switch Repeat Mode [All, Single, Off] _(playlist only)_ |
| s             | Toggle Shuffle _(playlist only)_ |
| /             | Open search |

### ZDF Mediathek

Improvements to [ZDF](https://www.zdf.de) Mediathek _(including [3sat](https://www.3sat.de))_:

- Adds new key bindings:

| Keys  | Action |
|-------|--------|
| Right | Fast-forward 10sec |
| Left  | Rewind 10sec |
| =     | Default playback rate (1x) |
| ]     | Increase playback rate (up to 2x) |
| [     | Decrease playback rate (down to 0.25x) |
