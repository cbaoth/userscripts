// ==UserScript==
// @name        Invoke-AI tweaks
// @description Some tweaks for the invoke-ai web tool
// @version     0.1
//
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2023+, userscript@cbaoth.de
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/invoke-ai-tweaks.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/invoke-ai-tweaks.user.js
//
// @match       https://localhost
// @match       http://localhost
// @exclude     http://localhost/*
// @exclude     https://localhost/*
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// @require     https://github.com/sizzlemctwizzle/GM_config/raw/master/gm_config.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function() {

    const KEY_B = 66;
    const SEL_INVOKE_BUTTON = `button.invoke-btn[type=submit]`;
    const SEL_INVOKE_BUTTON_DISABLED = SEL_INVOKE_BUTTON + `[disabled]`;
    const SEL_INVOKE_BUTTON_ENABLED = SEL_INVOKE_BUTTON + `:not([disabled])`;
    const SEL_SAMPLER_SELECT = `div.main-options div:nth-child(3) select`;
    const SAMPLERS = ['ddim', 'plms', 'k_lms', 'k_dpm_2', 'k_dpm_2_a', 'k_dpmpp_2', 'k_dpmpp_2_a', 'k_euler', 'k_euler_a', 'k_heun'];
    const TIMEOUT_INVOCATION = 20000; // 20sec
    const TIMEOUT_INVOCATION_IT = 500; // 500ms between batch iterations

    var batchRunActive = false;
    var batchRunStartedAt = -1;
    var batchRunIterationStartedAt = -1;
    var batchRunSequence = [];

    function batchRun() {
        batchRunSequence = []; // clear previous batch run sequence (if any)
        batchRunStartedAt = Date.now();
        batchRunIterationStartedAt = -1;
        //debugger;
        //SAMPLERS.forEach((sampler, i) => { // loop over all known samplers
        batchRunSequence = SAMPLERS.filter(s => GM_config.get('iai-sampler-' + s));
        // start iteration
        batchRunIterate();
    }

    // FIXME - make sure that batch runs don't overlap (e.g. pass on an id, stop if id differs)
    // FIXME - add an iteration timeout so we don't end up looping (recursing) forever
    // TODO - support prompt variable and iteratiion over prompt text (lines in config)
    function batchRunIterate() {
        if (batchRunSequence.length <= 0) {
            return; // no further itreations
        }
        console.log('batch run: still in queue -> ' + batchRunSequence.length);
        batchRunActive = true
        // wait 100ms just in case the button is not yet disabled from a potential previous iteration
        if ($(SEL_INVOKE_BUTTON_ENABLED).length >= 1) { // button found and enabled?
            batchRunIterationStartedAt = Date.now();
            var sampler = batchRunSequence.pop();
            $(SEL_SAMPLER_SELECT).val(sampler); // select sampler
            $(SEL_INVOKE_BUTTON).click(); // press invoke button
            // todo: random/re-use seed
            // todo: iterate texts
        } else { // no button or disabled -> wait and retry
            // todo: timeouts - if (batchRunIterationStartedAt
        }
        setTimeout(batchRunIterate, TIMEOUT_INVOCATION_IT); // recursion
    }


    function registerTweaks() {
        // GM_config - batch run
        const GM_CONFIG_BATCHRUN_ID = 'InvokeAITweaks_BatchRun_Config'
        const GM_CONFIG_BATCHRUN_FIELDS = {
            'iai-sampler-ddim': {
                type: "checkbox",
                default: false,
                label: "ddim"
            },
            'iai-sampler-plms': {
                type: "checkbox",
                default: false,
                label: "plms"
            },
            'iai-sampler-k_lms': {
                type: "checkbox",
                default: false,
                label: "k_lms"
            },
            'iai-sampler-k_dpm_2': {
                type: "checkbox",
                default: false,
                label: "k_dpm_2"
            },
            'iai-sampler-k_dpm_2_a': {
                type: "checkbox",
                default: false,
                label: "k_dpm_2_a"
            },
            'iai-sampler-k_dpmpp_2': {
                type: "checkbox",
                default: false,
                label: "k_dpmpp_2"
            },
            'iai-sampler-k_dpmpp_2_a': {
                type: "checkbox",
                default: true, // default
                label: "k_dpmpp_2_a"
            },
            'iai-sampler-k_euler': {
                type: "checkbox",
                default: false,
                label: "k_euler"
            },
            'iai-sampler-k_euler_a': {
                type: "checkbox",
                default: true, // default
                label: "k_euler_a"
            },
            'iai-sampler-k_heun': {
                type: "checkbox",
                default: false,
                label: "k_heun"
            }
        }
        GM_config.init({
            'id': GM_CONFIG_BATCHRUN_ID,
            'title': 'Invoke-AI Tweaks - Batch Run Config',
            'fields': GM_CONFIG_BATCHRUN_FIELDS,
            'events': {
                'open': function(doc) {
                    batchRunActive = false;
                    var config = this;
                    doc.getElementById(config.id + '_closeBtn').textContent = 'Cancel';
                },
                'save': function(values) {
                    var config = this;
                    config.close();
                    batchRun();
                }
            }
        });
    }

    // register stuff only in case the invoke button has been found
    waitForKeyElements(SEL_INVOKE_BUTTON, (e) => {
        registerTweaks();
        // add hotkeys
        cb.bindKeyDown(KEY_B, () => GM_config.open()); //{ mods: { alt: true } });
    });

})();
