// ==UserScript==
// @name         PoE Shop Enhancer
// @namespace    https://github.com/cbaoth/userscripts
// @version      2026-10-04
// @description  Sort and filter the item cards on Path of Exile microtransaction shop list pages (categories, specials, watchlist).
// @author       cbaoth235
// @license      MIT
//
// @match        https://*.pathofexile.com/shop/*
//
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
//
// @run-at       document-end
//
// @icon         https://external-content.duckduckgo.com/ip3/pathofexile.com.ico
// @downloadURL  https://github.com/cbaoth/userscripts/raw/master/poe-shop-enhancer.user.js
// ==/UserScript==

(async function () {
    'use strict';

    // Page contract (see the site's Microtransaction.hbt template): the category view renders cards as
    // #mtx-list > .shopItemBase[id]; more cards are appended on scroll (infinite loading), a search empties
    // and refills the list, and single cards get replaced or re-rendered in place (variant select, reload).
    const COUNTER_SEL = '#counter-container';
    const LIST_SEL = '#category-items #mtx-list';
    const CARD_SEL = ':scope > .shopItemBase';
    const STORAGE_KEY = 'state';

    const SORTS = {
        native: 'Native order',
        'name-asc': 'Name (A–Z)',
        'name-desc': 'Name (Z–A)',
        'price-asc': 'Price (low–high)',
        'price-desc': 'Price (high–low)',
    };
    const FILTER_MODES = ['show', 'hide', 'only'];
    const FILTERS = {
        sale: { label: 'On sale', tip: 'Show, hide, or show only items currently on sale (discounted)' },
        owned: { label: 'Owned', tip: 'Show, hide, or show only items marked as already owned' },
        watch: {
            label: 'Watchlist',
            tip: 'Show, hide, or show only items on your watchlist (variant items: only "all variants" is detectable)',
        },
    };
    const DEFAULTS = { sort: 'native', sale: 'show', owned: 'show', watch: 'show' };

    const counter = document.querySelector(COUNTER_SEL);
    if (!counter) return; // not a list page (e.g. main shop page, redeem key)

    const isWatchlistPage = /^\/shop\/watchlist\/?$/.test(location.pathname);
    const collator = new Intl.Collator(document.documentElement.lang || undefined, {
        numeric: true,
        sensitivity: 'base',
    });

    const isValid = (key, value) => (key === 'sort' ? value in SORTS : FILTER_MODES.includes(value));
    const stored = (await GM.getValue(STORAGE_KEY, null)) ?? {};
    let state = Object.fromEntries(
        Object.entries(DEFAULTS).map(([key, def]) => [key, isValid(key, stored[key]) ? stored[key] : def])
    );

    // native order: item id -> sequence number in order of first appearance
    let nativeIndex = new Map();
    let nativeSeq = 0;

    const waitFor = (selector) =>
        new Promise((resolve) => {
            const found = document.querySelector(selector);
            if (found) return resolve(found);
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    resolve(el);
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        });

    // ---- card data ---------------------------------------------------------

    // "180", "160 — 190" (variant price range), or a translated "Free"; ignores the nested .original-cost
    const parsePrice = (priceEl) => {
        if (!priceEl) return null;
        const text = [...priceEl.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join(' ');
        const nums = (text.match(/\d[\d,.]*/g) ?? []).map((s) => Number(s.replace(/[,.]/g, '')));
        if (nums.length) return Math.min(...nums);
        return text.trim() ? 0 : null;
    };

    const cardInfo = (card) => {
        const controls = card.querySelector(':scope > .controls');
        const watchLink = controls?.querySelector('.watchlist');
        return {
            name: card.querySelector('.name-container .name')?.textContent.trim() ?? '',
            price: parsePrice(card.querySelector('.mtx-details .price')),
            sale: !!card.querySelector(':scope > .onSaleIcon, .mtx-details .price .original-cost'),
            owned:
                card.classList.contains('singleItemOwned') ||
                !!controls?.querySelector('.singleOwnedIcon:not(.hidden)'),
            watch: !!watchLink?.classList.contains('added'),
            watchable: !!watchLink,
        };
    };

    // ---- sorting / filtering -----------------------------------------------

    const byPrice = (dir) => (a, b) => {
        if (a.price === b.price) return 0;
        if (a.price === null) return 1; // unknown price always last
        if (b.price === null) return -1;
        return (a.price - b.price) * dir;
    };
    const COMPARATORS = {
        'name-asc': (a, b) => collator.compare(a.name, b.name),
        'name-desc': (a, b) => collator.compare(b.name, a.name),
        'price-asc': byPrice(1),
        'price-desc': byPrice(-1),
    };

    const matches = (mode, value) => mode === 'show' || (mode === 'only') === value;

    let list = null;
    let observer = null;
    let ui = null;

    const apply = () => {
        if (!list) return;
        observer?.disconnect();

        const cards = [...list.querySelectorAll(CARD_SEL)];
        if (cards.length === 0) {
            // search empties the list before refilling it: restart native order tracking
            nativeIndex = new Map();
            nativeSeq = 0;
        }
        const items = cards.map((el) => {
            if (!nativeIndex.has(el.id)) nativeIndex.set(el.id, nativeSeq++);
            return { el, idx: nativeIndex.get(el.id), ...cardInfo(el) };
        });

        // watchlist filter is pointless on the watchlist itself, and unknown when logged out
        const canWatch = !isWatchlistPage && items.some((i) => i.watchable);
        ui?.setWatchAvailable(canWatch);

        let hidden = 0;
        for (const i of items) {
            const visible =
                matches(state.sale, i.sale) &&
                matches(state.owned, i.owned) &&
                (!canWatch || matches(state.watch, i.watch));
            i.el.toggleAttribute('data-pse-hidden', !visible);
            if (!visible) hidden++;
        }
        ui?.setHiddenCount(hidden);

        const cmp = COMPARATORS[state.sort];
        const sorted = [...items].sort((a, b) => cmp?.(a, b) || a.idx - b.idx);
        if (sorted.some((s, n) => s.el !== cards[n])) {
            list.append(...sorted.map((s) => s.el)); // moves only our cards, keeps other children in place
        }

        observer?.takeRecords();
        observer?.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        // fewer visible cards may bring the footer into view: let the site's infinite loader check again
        if (hidden) window.dispatchEvent(new Event('scroll'));
    };

    let applyQueued = false;
    const scheduleApply = () => {
        if (applyQueued) return;
        applyQueued = true;
        requestAnimationFrame(() => {
            applyQueued = false;
            apply();
        });
    };

    const isDefault = () => Object.keys(DEFAULTS).every((k) => state[k] === DEFAULTS[k]);

    const setState = (patch) => {
        state = { ...state, ...patch };
        if (isDefault()) GM.deleteValue(STORAGE_KEY);
        else GM.setValue(STORAGE_KEY, state);
        ui.sync();
        apply();
    };

    // ---- UI ----------------------------------------------------------------

    const STYLE = `
        #mtx-list > [data-pse-hidden] { display: none !important; }
        #counter-container { height: auto; min-height: 20px; flex-wrap: wrap; row-gap: 4px; }
        .pse-bar { display: flex; align-items: center; gap: 6px; margin: 0 16px 0 6px; }
        .pse-bar select, .pse-bar button {
            box-sizing: border-box; height: 20px; margin: 0; padding: 0 4px;
            font: inherit; font-size: 12px; line-height: 18px;
            color: #beb698; background: #2a2a2ae6;
            border: 1px solid #534e45; border-radius: 3px; cursor: pointer;
        }
        .pse-bar select:hover, .pse-bar button:hover:not(:disabled) { border-color: #7d7360; }
        .pse-bar select:focus-visible, .pse-bar button:focus-visible { outline: 1px solid #b19734; }
        .pse-bar select.pse-active { color: #e3c76e; border-color: #b19734; }
        .pse-bar option { background: #1b1b18; color: #beb698; }
        .pse-bar button { width: 20px; padding: 0; font-size: 14px; }
        .pse-bar button:disabled { opacity: 0.4; cursor: default; }
        .pse-bar .pse-hidden-count { font-size: 12px; color: #8f8670; white-space: nowrap; }
    `;

    const el = (tag, props = {}, children = []) => {
        const e = Object.assign(document.createElement(tag), props);
        e.append(...children);
        return e;
    };

    const buildUi = () => {
        document.head.append(el('style', { textContent: STYLE }));

        const sortSel = el(
            'select',
            { title: 'Sort items (ties keep the native order; price ranges sort by their lowest price)' },
            Object.entries(SORTS).map(([value, text]) => el('option', { value, textContent: text }))
        );
        sortSel.addEventListener('change', () => setState({ sort: sortSel.value }));

        const filterSels = Object.fromEntries(
            Object.entries(FILTERS).map(([key, { label, tip }]) => {
                const sel = el(
                    'select',
                    { title: tip },
                    FILTER_MODES.map((mode) => el('option', { value: mode, textContent: `${label}: ${mode}` }))
                );
                sel.addEventListener('change', () => setState({ [key]: sel.value }));
                return [key, sel];
            })
        );

        const resetBtn = el('button', {
            type: 'button',
            textContent: '↺',
            title: 'Reset sorting and filters (also clears the saved settings)',
            ariaLabel: 'Reset sorting and filters',
        });
        resetBtn.addEventListener('click', () => setState(DEFAULTS));

        const hiddenCount = el('span', { className: 'pse-hidden-count', title: 'Items hidden by the filters' });

        const bar = el('div', { className: 'pse-bar' }, [sortSel, ...Object.values(filterSels), resetBtn, hiddenCount]);
        const anchor = counter.querySelector('.search-results-text') ?? counter.querySelector('.counter');
        if (anchor) anchor.after(bar);
        else counter.prepend(bar);

        const sync = () => {
            sortSel.value = state.sort;
            sortSel.classList.toggle('pse-active', state.sort !== DEFAULTS.sort);
            for (const [key, sel] of Object.entries(filterSels)) {
                sel.value = state[key];
                sel.classList.toggle('pse-active', state[key] !== DEFAULTS[key]);
            }
            resetBtn.disabled = isDefault();
        };
        sync();

        return {
            sync,
            setHiddenCount: (n) => (hiddenCount.textContent = n ? `${n} hidden` : ''),
            setWatchAvailable: (available) => (filterSels.watch.hidden = !available),
        };
    };

    // ---- init --------------------------------------------------------------

    ui = buildUi();
    list = await waitFor(LIST_SEL);
    observer = new MutationObserver(scheduleApply);
    apply();
})();
