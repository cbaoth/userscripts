// ==UserScript==
// @name        Invoke-AI tweaks
// @description Some tweaks for the invoke-ai web tool
// @version     0.8
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
    const PROMPT_SUB_VAR = '${prompt}';
    const PROMPT_SUB_RND1_VAR = '${random1}';
    const PROMPT_SUB_RND2_VAR = '${random2}';
    const PROMPT_SUB_RND3_VAR = '${random3}';
    const PROMPT_SUB_RND4_VAR = '${random4}';
    const PROMPT_SUB_RND5_VAR = '${random5}';
    const PROMPT_SUB_RND6_VAR = '${random6}';
    const PROMPT_SUB_RND_VARS = [PROMPT_SUB_RND1_VAR, PROMPT_SUB_RND2_VAR, PROMPT_SUB_RND3_VAR, PROMPT_SUB_RND4_VAR, PROMPT_SUB_RND5_VAR, PROMPT_SUB_RND6_VAR];

    let batchRunActive;
    //let batchRunStartedAt = -1;
    //let batchRunIterationStartedAt = -1;
    let batchRunSequence;
    let batchRunTotal;
    let originalPrompt;
    let batchPrompt;
    let randomIterationMultiplier;

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
        let doSubstitute = GM_config.get('iai-prompt-substitute');
        let samplers = SAMPLERS.filter(s => GM_config.get('iai-sampler-' + s));
        // collect custom promts, remove empty lines
        let customPrompts = GM_config.get('iai-prompt-lines').split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);

        // check pre-conditions
        if (samplers.length <= 0) {
            ttAndLog("ERROR: No sampler(s) selected!", "red");
            return;
        }

        // collect custom prompts (with optional substitutions) or just use the original prompt if none given
        let prompts;
        if (customPrompts.length > 0) { // any custom prompts?
            if (originalPrompt.includes(PROMPT_SUB_VAR)) { // prompt variable there?
                prompts = (doSubstitute ? customPrompts.map(p => originalPrompt.replace(PROMPT_SUB_VAR, p)) : customPrompts); // substitute if necessary
            } else { // missing?
                ttAndLog(`ERROR: Custom prompts provided but <code>${PROMPT_SUB_VAR}</code> missing in original prompt!`, "red");
                return;
            }
        } else {
            prompts = [originalPrompt]; // no custom prompts, use original one only
        }

        let randomIterationMultiplier = GM_config.get('iai-random-iteration-multiplier');
        // generate all prompt/sampler combinations
        prompts.slice().reverse().forEach((p, i) => {
            // repeat random prompt generation multiplier-times
            for (let rmi = 0; rmi < randomIterationMultiplier; rmi++) {
                // get prompt with random values (same one used for all samplers below)
                let prompt = substituteRandomLines(p);
                if (prompt.trim().lenght <= 0) { // empty prompt?
                    continue; // skip empty prompt
                }
                // one entry per sampler for the given prompt
                samplers.slice().reverse().forEach((s, j) => {
                    batchRunSequence.push([prompt, s]);
                });
            }
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
    function batchRunIterate(rndIdx=1) {
        if (batchRunSequence.length <= 0) { // batch run ended?
            ttAndLog(`Batch Run: Finished (last invokation running)!`, 'lime');
            reactSetInputValue($(SEL_PROMPT), originalPrompt); // reset original prompt
            return; // no further itreations
        }
        if (!batchRunActive) { // batch no longer active (interrupted)?
            ttAndLog(`Batch Run: Stopped!`, 'red');
            reactSetInputValue($(SEL_PROMPT), originalPrompt); // reset original prompt
            return;
        }

        if ($(SEL_INVOKE_BUTTON_ENABLED).length >= 1) { // button found and enabled?
            //batchRunIterationStartedAt = Date.now();
            let tuple = batchRunSequence.pop();
            let idx = batchRunTotal-batchRunSequence.length;
            let prompt = tuple[0].trim();
            let sampler = tuple[1];
            showTT(`Batch Run: Starting next invocation [${idx}/${batchRunTotal}]`, '#87cefa');
            console.log(`Batch Run: Starting next invocation [${idx}/${batchRunTotal}, sampler: ${sampler}, prompt: ${prompt}]`);
            reactSetSelection($(SEL_SAMPLER_SELECT), sampler); // select sampler
            reactSetInputValue($(SEL_PROMPT), prompt); // set prompt
            $(SEL_INVOKE_BUTTON).click(); // press invoke button
            // todo: random/re-use seed
        } else { // no button or disabled -> wait a bit and retry
            let idx = batchRunTotal-batchRunSequence.length;
            ttAndLog(`Batch Run: Invocation [${idx}/${batchRunTotal}] running ...`);
            // todo: timeouts - if (batchRunIterationStartedAt
        }
        setTimeout(batchRunIterate, TIMEOUT_INVOCATION_IT); // next itration / retry (recursion)
    }

    function substituteRandomLines(prompt) {
        let result = prompt;
        for (let i=1; i<= PROMPT_SUB_RND_VARS.length; i++) {
            result = substituteRandom(result, i);
        }
        return result;
    }


    function substituteRandom(prompt, n) {
        let val = GM_config.get(`iai-prompt-rnd${n}-lines`).trim();
        if (val.length <= 0) { // no random lines provided?
            if (prompt.includes(PROMPT_SUB_RND_VARS[n-1])) {
                console.log(`Batch Run: $(PROMPT_SUB_RND_VARS[n-1]) found but no lines provided, skipping substitution!`);
                return prompt.replace(PROMPT_SUB_RND_VARS[n-1], ""); // remove unused variable
            }
            return prompt;
        }
        let lines = val.split(/\r?\n/);
        let text = lines[Math.floor(Math.random()*lines.length)];
        return prompt.replace(PROMPT_SUB_RND_VARS[n-1], text);
    }


    function registerTweaks() {
        // GM_config - batch run
        const GM_CONFIG_BATCHRUN_ID = 'InvokeAITweaks_BatchRun_Config'
        const GM_CONFIG_BATCHRUN_FIELDS = {
            'iai-sampler-ddim': {
                section: ['Samplers',
                          'One invocation per sampler'], // Appears above the field
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
            'iai-prompt-lines': {
                section: ['Prompts',
                          'One invocation per sampler and prompt line combination'], // Appears above the field
                type: "textarea",
                default: "most beautiful photo of (${random1}) in ${random2}\n35mm amateur camera photo of (${random1}) in ${random2}\nstylized masterpiece fine art photo of (${random1}) in ${random2}",
                label: "Prompts"
            },
            'iai-prompt-substitute': {
                type: "checkbox",
                default: true,
                label: `Substitute <code>${PROMPT_SUB_VAR}</code> in existing prompt with one below (else use as full prompt)`
            },
            'iai-random-iteration-multiplier': {
                section: ['Random Snippets',
                          'Random prompt snippets to be used, one random line per invocation'], // Appears above the field
                label: "Multiply invocations by the given factor, 1 meaning no additional promts, x>1 meaning x randomized versions per sampler & prompt (regular iterations).",
                type: 'int',
                min: 1,
                max: 100,
                default: 1
            },
            'iai-prompt-rnd1-lines': {
                label: `Random snippets 1, sibsituting <code>${PROMPT_SUB_RND1_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea",
                default: "Bergen Norway\nMarrakesh Morocco\nLausanne Switzerland\nPorto Portugal\nPlovdiv Bulgaria\nReykjavik Iceland\nChiang Mai Thailand\nVictoria Canada\Aalborg Denmark\Trieste Italy\nHaarlem Netherlands\nSalzburg Austria\nBanska Bystrica Slovakia\nHoi An Vietnam"
            },
            'iai-prompt-rnd2-lines': {
                label: `Random snippets 2, sibsituting <code>${PROMPT_SUB_RND2_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea",
                default: "spring\nsummer\nfall\nwinter"
            },
            'iai-prompt-rnd3-lines': {
                label: `Random snippets 3, sibsituting <code>${PROMPT_SUB_RND3_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea"
            },
            'iai-prompt-rnd4-lines': {
                label: `Random snippets 4, sibsituting <code>${PROMPT_SUB_RND4_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea"
            },
            'iai-prompt-rnd5-lines': {
                label: `Random snippets 5, sibsituting <code>${PROMPT_SUB_RND5_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea"
            },
            'iai-prompt-rnd6-lines': {
                label: `Random snippets 6, sibsituting <code>${PROMPT_SUB_RND6_VAR}</code> in existing prompt with a random line from this text field`,
                type: "textarea"
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
                    doc.getElementById(config.id + '_field_iai-prompt-lines').cols = 125;
                    doc.getElementById(config.id + '_field_iai-prompt-lines').rows = 10;
                    for (let i = 1; i <= PROMPT_SUB_RND_VARS.length; i++) {
                        doc.getElementById(config.id + `_field_iai-prompt-rnd${i}-lines`).rows = 4;
                        doc.getElementById(config.id + `_field_iai-prompt-rnd${i}-lines`).cols = 125;
                    }
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
