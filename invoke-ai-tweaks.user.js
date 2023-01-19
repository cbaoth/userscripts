// ==UserScript==
// @name        Invoke-AI tweaks
// @description Some tweaks for the invoke-ai web tool
// @version     0.5
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
    //const SEL_INVOKE_BUTTON_DISABLED = SEL_INVOKE_BUTTON + `[disabled]`;
    const SEL_INVOKE_BUTTON_ENABLED = SEL_INVOKE_BUTTON + `:not([disabled])`;
    const SEL_SAMPLER_SELECT = `div.main-options div:nth-child(3) select`;
    const SEL_PROMPT = `textarea#prompt`;
    const SAMPLERS = ['ddim', 'plms', 'k_lms', 'k_dpm_2', 'k_dpm_2_a', 'k_dpmpp_2', 'k_dpmpp_2_a', 'k_euler', 'k_euler_a', 'k_heun'];
    //const TIMEOUT_INVOCATION = 20000; // 20sec
    const TIMEOUT_INVOCATION_IT = 500; // 500ms between batch iterations

    let batchRunActive;
    //let batchRunStartedAt = -1;
    //let batchRunIterationStartedAt = -1;
    let batchRunSequence;
    let batchRunTotal;
    let originalPrompt;


    // tooltip
    function showTT(msg, color="white", size="0.8em") {
        // use invocation timeout, show tt constantly
        cb.createTT(msg, TIMEOUT_INVOCATION_IT, { offsetX: 250, offsetY: 25, offsetMouse: false, fadeoutTime: 150, css:{ "font-size": size, "color": color }});
    }

    function ttAndLog(msg, color="white") {
        showTT(msg, color);
        console.log(msg);
    }

    function batchRun() {
        batchRunSequence = []; // clear previous batch run sequence (if any)
        // batchRunStartedAt = Date.now();
        // batchRunIterationStartedAt = -1;

        originalPrompt = $(SEL_PROMPT).val();
        let samplers = SAMPLERS.filter(s => GM_config.get('iai-sampler-' + s));
        let prompts = GM_config.get('iai-prompt-use') && GM_config.get('iai-prompt-lines').trim().length > 0
            ? GM_config.get('iai-prompt-lines').split(/\r?\n/)
            : ['']; // empty string, quick solution to iterate at least once in case no prompts are provided

        prompts.slice().reverse().forEach((p, i) => { // not so efficient but shouldn't matter here
            samplers.slice().reverse().forEach((s, j) => {
                batchRunSequence.push([p, s]);
            });
        });
        batchRunTotal = batchRunSequence.length;
        // start iteration
        batchRunActive = true;
        batchRunIterate();
    }

    // https://stackoverflow.com/a/59599339
    // react textArea needs some magic to receive text updates
    function reactSetInputValue($input, val) {
        let lastValue = $input[0].value;
        $input[0].value = val;
        let event = new Event('input', { bubbles: true });
        // hack React15
        event.simulated = true;
        // hack React16
        let tracker = $input[0]._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }
        $input[0].dispatchEvent(event);
    }

    // react combobox needs some magic to receive text updates
    function reactSetSelection($select, val) {
        $select[0].dispatchEvent(new Event("click"));
        $select.val(val);
        let option = Array.from($select[0].options).find(o => o.value === val);
        option.selected = true;
        $select[0].dispatchEvent(new Event("change", {bubbles: true}));
    }

    // FIXME - make sure that batch runs don't overlap (e.g. pass on an id, stop if id differs)
    // FIXME - add an iteration timeout so we don't end up looping (recursing) forever
    // TODO - support prompt variable and iteratiion over prompt text (lines in config)
    function batchRunIterate() {
        if (batchRunSequence.length <= 0) {
            ttAndLog(`Batch Run: Finished (last invokation running)!`, 'lime');
            reactSetInputValue($(SEL_PROMPT), originalPrompt); // reset original prompt
            return; // no further itreations
        }
        if (!batchRunActive) { // stopped?
            ttAndLog(`Batch Run: Stopped!`, 'red');
            reactSetInputValue($(SEL_PROMPT), originalPrompt); // reset original prompt
            return;
        }
        // wait 100ms just in case the button is not yet disabled from a potential previous iteration
        if ($(SEL_INVOKE_BUTTON_ENABLED).length >= 1) { // button found and enabled?
            //batchRunIterationStartedAt = Date.now();
            let tuple = batchRunSequence.pop();
            let idx = batchRunTotal-batchRunSequence.length;
            let doAppend = GM_config.get('iai-prompt-append');
            let prompt = tuple[0].trim();
            let sampler = tuple[1];
            showTT(`Batch Run:  Starting next invocation [${idx}/${batchRunTotal}]`, '#87cefa');
            console.log(`Batch Run: Starting next invocation [${idx}/${batchRunTotal}, sampler: ${sampler}, prompt: ${prompt}]`);
            reactSetSelection($(SEL_SAMPLER_SELECT), sampler); // select sampler
            if (GM_config.get('iai-prompt-use')) { // prompt sequence enabled?
                if (prompt.length <= 0) { // no prompt given (in this line) -> skip
                    // todo: warning that empty line was skipped
                    ttAndLog(`Batch Run: skipping empty prompt line ...`, 'orange');
                    setTimeout(batchRunIterate, TIMEOUT_INVOCATION_IT); // recursion
                } else {
                    reactSetInputValue($(SEL_PROMPT), doAppend ? originalPrompt + ",\n\n" + prompt : prompt);
                }
            }
            $(SEL_INVOKE_BUTTON).click(); // press invoke button
            // todo: random/re-use seed
        } else { // no button or disabled -> wait and retry
            let idx = batchRunTotal-batchRunSequence.length;
            ttAndLog(`Batch Run: Invocation [${idx}/${batchRunTotal}] running ...`);
            // todo: timeouts - if (batchRunIterationStartedAt
        }
        setTimeout(batchRunIterate, TIMEOUT_INVOCATION_IT); // recursion
    }


    function registerTweaks() {
        // GM_config - batch run
        const GM_CONFIG_BATCHRUN_ID = 'InvokeAITweaks_BatchRun_Config'
        const GM_CONFIG_BATCHRUN_FIELDS = {
            'iai-sampler-ddim': {
                section: ['Samplers',
                          'Select one or more samplers to be used in sequence'], // Appears above the field
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
            },
            'iai-prompt-use': {
                section: ['Prompts',
                          'Prompts to be used, one line per invocation (and sampler)'], // Appears above the field
                type: "checkbox",
                default: false,
                label: "Use prompt sequence (else samplers only)"
            },
            'iai-prompt-append': {
                type: "checkbox",
                default: false,
                label: "Append to existing prompt (else replace)"
            },
            'iai-prompt-lines': {
                type: "textarea",
                default: "red apple\ngreen apple\nrotton apple",
                label: "Prompts"
            }
        }
        GM_config.init({
            'id': GM_CONFIG_BATCHRUN_ID,
            'title': 'Invoke-AI Tweaks - Batch Run Config',
            'fields': GM_CONFIG_BATCHRUN_FIELDS,
            'events': {
                'open': function(doc) {
                    batchRunActive = false;
                    let config = this;
                    doc.getElementById(config.id + '_closeBtn').textContent = 'Cancel';
                    doc.getElementById(config.id + '_saveBtn').textContent = 'Batch Invoke';
                    doc.getElementById(config.id + '_field_iai-prompt-lines').cols = 120;
                    doc.getElementById(config.id + '_field_iai-prompt-lines').rows = 10;
                },
                'save': function(values) {
                    let config = this;
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
        cb.bindKeyDown(KEY_B, () => GM_config.open(), { skipEditable: true });  //mods: { alt: true } });
    });

})();
