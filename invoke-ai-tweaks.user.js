// ==UserScript==
// @name        Image AI engine tweaks
// @description Some tweaks for the Invoke-AI & Automatic1111 image AI web tools
// @version     0.14
//
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2023+, userscript@cbaoth.de
//
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/imgai-tweaks.user.js
// @updateURL   https://github.com/cbaoth/userscripts/raw/master/imgai-tweaks.user.js
//
// @match       http*://localhost
// @match       http*://*.ngrok.io
//
// @grant       none
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// @require     https://github.com/sizzlemctwizzle/GM_config/raw/master/gm_config.js
// ==/UserScript==

// FIXME - consider negative prompt (custom, +++/---, reset)
// FIXME - common config object
// FIXME - reset on break


this.$ = this.jQuery = jQuery.noConflict(true);

(function() {

    const KEY_ESC = 27
    const KEY_F12 = 123

    const ENGINE_IAI = 'IAI'
    const ENGINE_A1111 = 'A1111'

    const SEL_INVOKE_BUTTON = {IAI: `button.invoke-btn[type=submit]`,
                               A1111: `button#txt2img_generate, button#img2img_generate`};
    const SEL_WIDTH_SELECT = {IAI: `div.main-options-list > div.main-options-row:nth-child(2) > div:nth-child(1) select`,
                              A1111: `#txt2img_width input, #img2img_width input`};
    const SEL_HEIGHT_SELECT = {IAI: `div.main-options-list > div.main-options-row:nth-child(2) > div:nth-child(2) select`,
                               A1111: `#txt2img_height input, #img2img_height input`};
    const SEL_SAMPLER_SELECT = {IAI: `div.main-options-list > div.main-options-row:nth-child(2) > div:nth-child(3) select`,
                                A1111: `#txt2img_sampling select, #img2img_sampling select`};
    const SEL_PROMPT = {IAI: `textarea#prompt`,
                        A1111: `div#txt2img_prompt textarea, div#img2img_prompt textarea`};
    const SEL_PROMPT_NEG = {IAI: `textarea#prompt`, // FIXME
                            A1111: `div#txt2img_neg_prompt textarea, div#img2img_neg_prompt textarea`};

    const SAMPLERS = {IAI: ['ddim', 'plms', 'k_lms', 'k_dpm_2', 'k_dpm_2_a', 'k_dpmpp_2', 'k_dpmpp_2_a', 'k_euler', 'k_euler_a', 'k_heun'],
                      A1111: ['Euler a', 'Euler', 'LMS', 'Heun', 'DPM2', 'DPM2 a', 'DPM++ 2S a', 'DPM++ 2M', 'DPM++ SDE', 'DPM fast', 'DPM adaptive',
                              'LMS Karras', 'DPM2 Karras', 'DPM2 a Karras', 'DPM++ 2S a Karras', 'DPM++ 2M Karras', 'DPM++ SDE Karras']};
    const RESOLUTIONS = { '[unchanged]': [], '512x768': ['512', '768'], '768x512': ['768', '512'], '512x512': ['512', '512'], '768x768': ['768', '768'],
                          '[random: 512x768/768x512]': [['512', '768'], ['768', '512']] };

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

    let engine;

    let batchRunActive;
    //let batchRunStartedAt = -1;
    //let batchRunIterationStartedAt = -1;
    let batchRunSequence;
    let batchRunTotal;
    let originalPrompt;
    let originalPromptNeg;
    let batchPrompt;
    let randomIterationMultiplier;
    let batchResolution;

    // TODO quick hack, consider getting rid of jquery all together
    function $$(s) {
        if (engine == ENGINE_IAI) {
            return $(document)
        } else {
            // in case of A1111 get active tab, only txt2img and img2img are supported
            let doc = document.getElementsByTagName('gradio-app')[0].shadowRoot;
            if (doc == undefined) {
                ttAndLog("ERROR: This web app seems to be invalid, unable to run batch mode!", "red", "1em", 4000);
                return;
            }
            let tab = Array.from(doc.querySelectorAll('#tab_txt2img, #tab_img2img')).filter((e) => { return getComputedStyle(e).display !== undefined && getComputedStyle(e).display != 'none'; })[0];
            if (tab == undefined) {
                ttAndLog("ERROR: Invalid active tab found, only txt2img and img2img are currently supported!", "red", "1em", 4000);
                return;
            }
            return $(tab.querySelectorAll(s));
        }
    }

    // tooltip
    function showTT(msg, color="white", size="0.8em", timeout=500) {
        // use invocation timeout, show tt constantly
        cb.createTT(msg, timeout, { offsetX: 450, offsetY: 25, offsetMouse: false, fadeoutTime: 150, css:{ "font-size": size, "color": color }});
    }

    function ttAndLog(msg, color="white", size="0.8em", timeout=500) {
        showTT(msg, color, size, timeout);
        console.log(msg);
    }

    // pretty basic conversion from inkove-ai's ++/-- notation to numberic and vice versa
    // TODO ugly hack
    function convertPrompt(p) {
        let result = p;
        let r;
        if (engine == ENGINE_IAI) {
            for (let i = 9; i > 0; i--) {
                r = new RegExp(`[)]:${1+0.1*i}`, 'g');
                result = result.replaceAll(r, `)${'+'.repeat(i)}`);
                r = new RegExp(`[)]:${1-0.1*i}`, 'g');
                result = result.replaceAll(r, `)${'-'.repeat(i)}`);
            }
        } else {
            for (let i = 9; i > 0; i--) {
                r = new RegExp(`[)]${'[+]'.repeat(i)}`, 'g');
                result = result.replaceAll(r, `):${1+0.1*i}`);
                r = new RegExp(`[)]${'[-]'.repeat(i)}`, 'g');
                result = result.replaceAll(r, `):${1-0.1*i}`);
            }
        }
        return result;
    }

    function batchRun() {
        batchRunSequence = []; // clear previous batch run sequence (if any)
        // batchRunStartedAt = Date.now();
        // batchRunIterationStartedAt = -1;

        originalPrompt = $$(SEL_PROMPT[engine]).val();
        if (originalPrompt === undefined) {
            ttAndLog("ERROR: Unable to find original prompt field, batch run stopped!", "red", "1em", 4000)
            return;
        }
        originalPromptNeg = $$(SEL_PROMPT_NEG[engine]).val();
        let mainPrompt = GM_config.get('ai-prompt').trim();
        let mainPromptNeg = GM_config.get('ai-prompt-negative').trim();
        let doSubstitute = GM_config.get('ai-prompt-substitute');
        let samplers = SAMPLERS[engine].filter(s => GM_config.get('ai-sampler-' + s));
        // collect custom promts, remove empty lines
        let customPrompts = GM_config.get('ai-prompt-lines').split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);

        // check pre-conditions
        if (samplers.length <= 0) {
            ttAndLog("ERROR: No sampler(s) selected!", "red", "1em", 4000);
            return;
        }

        // collect custom prompts (with optional substitutions) or just use the configured main prompt if none is given
        let prompts;
        // FIXME to many confusing checks, unclear to user
        if (customPrompts.length > 0) { // any custom prompts?
            if (mainPrompt.includes(PROMPT_SUB_VAR)) { // original prompt contains variable?
                prompts = (doSubstitute ? customPrompts.map(p => mainPrompt.replaceAll(PROMPT_SUB_VAR, p)) : customPrompts); // substitute if necessary
            } else if (originalPrompt.includes(PROMPT_SUB_VAR)) { // original prompt contains variable?
                prompts = (doSubstitute ? customPrompts.map(p => originalPrompt.replaceAll(PROMPT_SUB_VAR, p)) : customPrompts); // substitute if necessary
            } else if (mainPrompt.length <= 0 && originalPrompt.trim().length <= 0) { // original and configured main prompt empty?
                prompts = customPromts; // just take custom prompts, no dummy with variable required
            } else if (mainPrompt.length >= 1) { // configured main prompt not empty?
                ttAndLog(`WARNING: Custom prompt variable missing but main prompt configured, using main prompt only!`, "orange", "1em", 4000); // FIXME mode a bit lower
                prompts = [mainPrompt]; // then just us it and ignore custom promts (due to missing variables)
            } else if (originalPrompt.length >= 1) { // original prompt not empty?
                ttAndLog(`WARNING: Custom prompt variable missing but main prompt configured, using main prompt only!`, "orange", "1em", 4000);
                prompts = [originalPrompt.trim()]; // then just us it and ignore custom promts (due to missing variables)
            }
        } else { // no custom prompt?
            if (mainPrompt.length <= 0) { // configured main prompt not empty?
                prompts = [mainPrompt]; // no custom prompts, so use configured main prompt only
            } else if (originalPrompt.trim().length <= 0) { // original prompt not empty?
                prompts = [originalPrompt.trim()]; // no custom prompts, use original one only
            } else {
                ttAndLog(`ERROR: No custom prompts, no configured main, and no original prompt provided, stopping ...!`, "red", "1em", 4000);
            }
        }

        // FIXME in case of IAI append negative prompt in brackets to main prompt
        if (mainPromptNeg.length > 0) { // configured main negative prompt not empty?
            setInputValue($$(SEL_PROMPT_NEG[engine]), mainPromptNeg); // no custom negative prompts, so use configured main prompt only
        } // else: keep the original negative prompt (unchanged, no matter if empty or not)

        let randomIterationMultiplier = GM_config.get('ai-random-iteration-multiplier');
        // generate all prompt/sampler combinations
        prompts.slice().reverse().forEach((p, i) => {
            // repeat random prompt generation multiplier-times
            for (let rmi = 0; rmi < randomIterationMultiplier; rmi++) {
                // get prompt with random values (same one used for all samplers below)
                // TODO make convertPrompt configurable (optional)
                let prompt = convertPrompt(substituteRandomLines(p));
                if (prompt.trim().lenght <= 0) { // empty prompt?
                    continue; // skip empty prompt
                }
                // one entry per sampler for the given prompt
                samplers.slice().reverse().forEach((s, j) => {
                    batchRunSequence.push([prompt, s]);
                });
            }
        });
        // shuffle batch run sequence (if configured)
        if (GM_config.get('ai-prompt-random-iteration-shuffle')) {
            batchRunSequence = shuffle(batchRunSequence);
        }
        batchResolution = RESOLUTIONS[GM_config.get('ai-resolution')];
        // in case of a fixed wheight / width config, set it before starting
        // TODO consider resetting res and sampler when finished
        if (batchResolution.length == 2 && !isMultiDimensional(batchResolution)) {
            if (engine == ENGINE_IAI) {
                setSelection($$(SEL_WIDTH_SELECT[engine]), batchResolution[0]); // select width
                setSelection($$(SEL_HEIGHT_SELECT[engine]), batchResolution[1]); // select heigth
            } else {
                setInputValue($$(SEL_WIDTH_SELECT[engine]), batchResolution[0]); // select width
                setInputValue($$(SEL_HEIGHT_SELECT[engine]), batchResolution[1]); // select heigth
            }
        }
        batchRunTotal = batchRunSequence.length;
        // start iteration
        batchRunActive = true;
        batchRunIterate();
    }


    function shuffle(array) {
        array.forEach((item, i) => {
            let j = Math.floor(Math.random() * array.length);
            [array[i], array[j]] = [array[j], array[i]];
        })
        return array;
    }

    function isMultiDimensional(array) {
        return JSON.stringify(array).startsWith("[[");
    }


    // https://stackoverflow.com/a/59599339
    // react textArea needs some magic to receive text updates
    function setInputValue($input, val) {
        //if (engine == ENGINE_IAI) { // react
        let lastValue = $input[0].value;
        $input[0].value = val;
        let event = new Event('input', { bubbles: true });
        if (engine == ENGINE_IAI) { // react only
            // hack React15
            event.simulated = true;
            // hack React16
            let tracker = $input[0]._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
        }
        $input[0].dispatchEvent(event);
    }

    // react combobox needs some magic to receive text updates
    function setSelection($select, val) {
        $select[0].dispatchEvent(new Event("click"));
        $select.val(val);
        let option = Array.from($select[0].options).find(o => o.value === val);
        option.selected = true;
        $select[0].dispatchEvent(new Event("change", {bubbles: true}));
    }


    function isInvokeReady() {
        if (engine == ENGINE_IAI) {
            return $$(SEL_INVOKE_BUTTON[engine] + `:not([disabled])`).length >= 1
        } else {
            return getComputedStyle($$(`button#txt2img_interrupt, button#img2img_interrupt`)[0]).display == 'none';
        }
    }


    function reset() {
        setInputValue($$(SEL_PROMPT[engine]), originalPrompt); // reset original prompt
        setInputValue($$(SEL_PROMPT_NEG[engine]), originalPromptNeg); // reset original negative prompt
    }

    // FIXME - make sure that batch runs don't overlap (e.g. pass on an id, stop if id differs)
    // FIXME - add an iteration timeout so we don't end up looping (recursing) forever
    // TODO - support prompt variable and iteratiion over prompt text (lines in config)
    function batchRunIterate(rndIdx=1) {
        if (batchRunSequence.length <= 0) { // batch run ended?
            ttAndLog(`Batch Run: Finished (last invokation running)!`, 'lime');
            reset();
            return; // no further itreations
        }
        if (!batchRunActive) { // batch no longer active (interrupted)?
            ttAndLog(`Batch Run: Stopped!`, 'red');
            reset();
            return;
        }

        if (isInvokeReady()) { // button found and enabled?
            //batchRunIterationStartedAt = Date.now();
            let tuple = batchRunSequence.pop();
            let idx = batchRunTotal-batchRunSequence.length;
            let prompt = tuple[0].trim();
            let sampler = tuple[1];
            // in case of random wheight / width config, set it now
            if (batchResolution.length > 1 && isMultiDimensional(batchResolution)) {
                let res = batchResolution[Math.floor(Math.random()*batchResolution.length)];
                if (engine == ENGINE_IAI) {
                    setSelection($$(SEL_WIDTH_SELECT[engine]), res[0]); // select width
                    setSelection($$(SEL_HEIGHT_SELECT[engine]), res[1]); // select heigth
                } else {
                    setInputValue($$(SEL_WIDTH_SELECT[engine]), res[0]); // select width
                    setInputValue($$(SEL_HEIGHT_SELECT[engine]), res[1]); // select heigth
                }
            }
            showTT(`Batch Run: Starting next invocation [${idx}/${batchRunTotal}]`, '#87cefa');
            console.log(`Batch Run: Starting next invocation [${idx}/${batchRunTotal}, sampler: ${sampler}, prompt: ${prompt}]`);
            setSelection($$(SEL_SAMPLER_SELECT[engine]), sampler); // select sampler
            setInputValue($$(SEL_PROMPT[engine]), prompt); // set prompt
            $$(SEL_INVOKE_BUTTON[engine]).click(); // press invoke button
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


    function substituteRandom(prompt, idx) {
        let val = GM_config.get(`ai-prompt-rnd${idx}-lines`).trim();
        if (val.length <= 0) { // no random lines provided?
            if (prompt.includes(PROMPT_SUB_RND_VARS[idx-1])) {
                console.log(`Batch Run: ${PROMPT_SUB_RND_VARS[idx-1]} found but no lines provided, skipping substitution!`);
                return prompt.replaceAll(PROMPT_SUB_RND_VARS[idx-1], ""); // remove unused variable
            }
            return prompt;
        }
        let lines = val.split(/\r?\n/);
        let text = lines[Math.floor(Math.random()*lines.length)];
        return prompt.replaceAll(PROMPT_SUB_RND_VARS[idx-1], text);
    }


    function registerTweaks(eng) {
        engine = eng
        // GM_config - batch run
        const GM_CONFIG_BATCHRUN_ID = engine + 'Tweaks_BatchRun_Config'
        const GM_CONFIG_BATCHRUN_FIELDS = engine == ENGINE_IAI ?
              { // IAI samplers
                  'ai-prompt': {
                      section: ['Core Settings',
                                'Overwrite base values'], // Appears above the field
                      type: "textarea",
                      default: "${prompt}, highest quality, 4k, 8k",
                      label: `Overwrite positive prompt within batch run`
                  },
                  'ai-prompt-negative': {
                      type: "textarea",
                      default: "ugly, bad art, low-res",
                      label: "Overwrite negative prompt within batch run"
                  },
                  'ai-sampler-ddim': {
                      section: ['Samplers',
                                'One invocation per sampler'], // Appears above the field
                      type: "checkbox",
                      default: false,
                      label: "ddim"
                  },
                  'ai-sampler-plms': {
                      type: "checkbox",
                      default: false,
                      label: "plms"
                  },
                  'ai-sampler-k_lms': {
                      type: "checkbox",
                      default: false,
                      label: "k_lms"
                  },
                  'ai-sampler-k_dpm_2': {
                      type: "checkbox",
                      default: false,
                      label: "k_dpm_2"
                  },
                  'ai-sampler-k_dpm_2_a': {
                      type: "checkbox",
                      default: false,
                      label: "k_dpm_2_a"
                  },
                  'ai-sampler-k_dpmpp_2': {
                      type: "checkbox",
                      default: false,
                      label: "k_dpmpp_2"
                  },
                  'ai-sampler-k_dpmpp_2_a': {
                      type: "checkbox",
                      default: true, // default
                      label: "k_dpmpp_2_a"
                  },
                  'ai-sampler-k_euler': {
                      type: "checkbox",
                      default: false,
                      label: "k_euler"
                  },
                  'ai-sampler-k_euler_a': {
                      type: "checkbox",
                      default: true, // default
                      label: "k_euler_a"
                  },
                  'ai-sampler-k_heun': {
                      type: "checkbox",
                      default: false,
                      label: "k_heun"
                  },
                  'ai-resolution': {
                      section: ['Resolution',
                                'Optionally override or randomize the resolution'], // Appears above the field
                      type: "select",
                      options: ["[unchanged]", "512x768", "768x512", "512x512", "768x768", "[random: 512x768/768x512]"],
                      default: "[unchanged]",
                      label: "Resolution"
                  },
                  'ai-prompt-lines': {
                      section: ['Prompts',
                                'One invocation per sampler and prompt line combination'], // Appears above the field
                      type: "textarea",
                      default: "most beautiful photo of (${random1}) in ${random2}\n35mm amateur camera photo of (${random1}) in ${random2}\nstylized masterpiece fine art photo of (${random1}) in ${random2}",
                      label: "Prompts"
                  },
                  'ai-prompt-substitute': {
                      type: "checkbox",
                      default: true,
                      label: `Substitute <code>${PROMPT_SUB_VAR}</code> in existing prompt with one below (else use as full prompt)`
                  },
                  'ai-random-iteration-multiplier': {
                      section: ['Random Snippets',
                                'Random prompt snippets to be used, one random line per invocation'], // Appears above the field
                      label: "Multiply invocations by the given factor, 1 meaning no additional promts, x>1 meaning x randomized versions per sampler & prompt (regular iterations).",
                      type: 'int',
                      min: 1,
                      max: 9999,
                      default: 1
                  },
                  'ai-prompt-random-iteration-shuffle': {
                      type: "checkbox",
                      default: true, // default
                      label: "Shuffle all iterations so that prompts & sampler combinations are executed in a random order instead of running e.g. all ranedom multiplications with prompt a and sampler b first."
                  },
                  'ai-prompt-rnd1-lines': {
                      label: `Random snippets 1, sibsituting <code>${PROMPT_SUB_RND1_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea",
                      default: "Bergen Norway\nMarrakesh Morocco\nLausanne Switzerland\nPorto Portugal\nPlovdiv Bulgaria\nReykjavik Iceland\nChiang Mai Thailand\nVictoria Canada\Aalborg Denmark\Trieste Italy\nHaarlem Netherlands\nSalzburg Austria\nBanska Bystrica Slovakia\nHoi An Vietnam"
                  },
                  'ai-prompt-rnd2-lines': {
                      label: `Random snippets 2, sibsituting <code>${PROMPT_SUB_RND2_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea",
                      default: "spring\nsummer\nfall\nwinter"
                  },
                  'ai-prompt-rnd3-lines': {
                      label: `Random snippets 3, sibsituting <code>${PROMPT_SUB_RND3_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd4-lines': {
                      label: `Random snippets 4, sibsituting <code>${PROMPT_SUB_RND4_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd5-lines': {
                      label: `Random snippets 5, sibsituting <code>${PROMPT_SUB_RND5_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd6-lines': {
                      label: `Random snippets 6, sibsituting <code>${PROMPT_SUB_RND6_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  }
              } : { // A1111 samplers
                  'ai-prompt': {
                      section: ['Core Settings',
                                'Overwrite base values'], // Appears above the field
                      type: "textarea",
                      default: "${prompt}, highest quality, 4k, 8k",
                      label: `Overwrite positive prompt within batch run`
                  },
                  'ai-prompt-negative': {
                      type: "textarea",
                      default: "ugly, bad art, low-res",
                      label: "Overwrite negative prompt within batch run"
                  },
                  'ai-sampler-Euler a': {
                      section: ['Samplers',
                                'One invocation per sampler'], // Appears above the field
                      type: "checkbox",
                      default: true,
                      label: "Euler a"
                  },
                  'ai-sampler-Euler': {
                      type: "checkbox",
                      default: false,
                      label: "Euler"
                  },
                  'ai-sampler-LMS': {
                      type: "checkbox",
                      default: false,
                      label: "LMS"
                  },
                  'ai-sampler-Heun': {
                      type: "checkbox",
                      default: false,
                      label: "Heun"
                  },
                  'ai-sampler-DPM2': {
                      type: "checkbox",
                      default: false,
                      label: "DPM2"
                  },
                  'ai-sampler-DPM2 a': {
                      type: "checkbox",
                      default: false,
                      label: "DPM2 a"
                  },
                  'ai-sampler-DPM++ 2S a': {
                      type: "checkbox",
                      default: false, // default
                      label: "DPM++ 2S a"
                  },
                  'ai-sampler-DPM++ 2M': {
                      type: "checkbox",
                      default: false,
                      label: "DPM++ 2M"
                  },
                  'ai-sampler-DPM++ SDE': {
                      type: "checkbox",
                      default: false, // default
                      label: "DPM++ SDE"
                  },
                  'ai-sampler-DPM fast': {
                      type: "checkbox",
                      default: false,
                      label: "DPM fast"
                  },
                  'ai-sampler-DPM adaptive': {
                      type: "checkbox",
                      default: false,
                      label: "DPM adaptive"
                  },
                  'ai-sampler-LMS Karras': {
                      type: "checkbox",
                      default: false, // default
                      label: "LMS Karras"
                  },
                  'ai-sampler-DPM2 Karras': {
                      type: "checkbox",
                      default: false,
                      label: "DPM2 Karras"
                  },
                  'ai-sampler-DPM2 a Karras': {
                      type: "checkbox",
                      default: false,
                      label: "DPM2 a Karras"
                  },
                  'ai-sampler-DPM++ 2S a Karras': {
                      type: "checkbox",
                      default: true, // default
                      label: "DPM++ 2S a Karras"
                  },
                  'ai-sampler-DPM++ 2M Karras': {
                      type: "checkbox",
                      default: false,
                      label: "DPM++ 2M Karras"
                  },
                  'ai-sampler-DPM++ SDE Karras': {
                      type: "checkbox",
                      default: false,
                      label: "DPM++ SDE Karras"
                  },
                  'ai-resolution': {
                      section: ['Resolution',
                                'Optionally override or randomize the resolution'], // Appears above the field
                      type: "select",
                      options: ["[unchanged]", "512x768", "768x512", "512x512", "768x768", "[random: 512x768/768x512]"],
                      default: "[unchanged]",
                      label: "Resolution"
                  },
                  'ai-prompt-lines': {
                      section: ['Prompts',
                                'One invocation per sampler and prompt line combination'], // Appears above the field
                      type: "textarea",
                      default: "most beautiful photo of (${random1}) in ${random2}\n35mm amateur camera photo of (${random1}) in ${random2}\nstylized masterpiece fine art photo of (${random1}) in ${random2}",
                      label: "Prompts"
                  },
                  'ai-prompt-substitute': {
                      type: "checkbox",
                      default: true,
                      label: `Substitute <code>${PROMPT_SUB_VAR}</code> in existing prompt with one below (else use as full prompt)`
                  },
                  'ai-random-iteration-multiplier': {
                      section: ['Random Snippets',
                                'Random prompt snippets to be used, one random line per invocation'], // Appears above the field
                      label: "Multiply invocations by the given factor, 1 meaning no additional promts, x>1 meaning x randomized versions per sampler & prompt (regular iterations).",
                      type: 'int',
                      min: 1,
                      max: 9999,
                      default: 1
                  },
                  'ai-prompt-random-iteration-shuffle': {
                      type: "checkbox",
                      default: true, // default
                      label: "Shuffle all iterations so that prompts & sampler combinations are executed in a random order instead of running e.g. all ranedom multiplications with prompt a and sampler b first."
                  },
                  'ai-prompt-rnd1-lines': {
                      label: `Random snippets 1, sibsituting <code>${PROMPT_SUB_RND1_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea",
                      default: "Bergen Norway\nMarrakesh Morocco\nLausanne Switzerland\nPorto Portugal\nPlovdiv Bulgaria\nReykjavik Iceland\nChiang Mai Thailand\nVictoria Canada\Aalborg Denmark\Trieste Italy\nHaarlem Netherlands\nSalzburg Austria\nBanska Bystrica Slovakia\nHoi An Vietnam"
                  },
                  'ai-prompt-rnd2-lines': {
                      label: `Random snippets 2, sibsituting <code>${PROMPT_SUB_RND2_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea",
                      default: "spring\nsummer\nfall\nwinter"
                  },
                  'ai-prompt-rnd3-lines': {
                      label: `Random snippets 3, sibsituting <code>${PROMPT_SUB_RND3_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd4-lines': {
                      label: `Random snippets 4, sibsituting <code>${PROMPT_SUB_RND4_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd5-lines': {
                      label: `Random snippets 5, sibsituting <code>${PROMPT_SUB_RND5_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  },
                  'ai-prompt-rnd6-lines': {
                      label: `Random snippets 6, sibsituting <code>${PROMPT_SUB_RND6_VAR}</code> in existing prompt with a random line from this text field`,
                      type: "textarea"
                  }
              }
        GM_config.init({
            'id': GM_CONFIG_BATCHRUN_ID,
            'title': engine == ENGINE_IAI ? 'Invoke-AI Tweaks - Batch Run Config' : 'A1111 Tweaks - Batch Run Config',
            'fields': GM_CONFIG_BATCHRUN_FIELDS,
            'events': {
                'open': function(doc) {
                    batchRunActive = false;
                    let config = this;
                    //document.querySelector(`iframe#${config.id}`).style.width = '60em';
                    doc.getElementById(config.id).style.max_width = '150px';
                    doc.getElementById(config.id + '_closeBtn').textContent = 'Cancel';
                    doc.getElementById(config.id + '_saveBtn').textContent = 'Batch Invoke';
                    doc.getElementById(config.id + '_field_ai-prompt').cols = 125;
                    doc.getElementById(config.id + '_field_ai-prompt').rows = 10;
                    doc.getElementById(config.id + '_field_ai-prompt-negative').cols = 125;
                    doc.getElementById(config.id + '_field_ai-prompt-negative').rows = 10;
                    doc.getElementById(config.id + '_field_ai-prompt-lines').cols = 125;
                    doc.getElementById(config.id + '_field_ai-prompt-lines').rows = 10;
                    for (let i = 1; i <= PROMPT_SUB_RND_VARS.length; i++) {
                        doc.getElementById(config.id + `_field_ai-prompt-rnd${i}-lines`).rows = 4;
                        doc.getElementById(config.id + `_field_ai-prompt-rnd${i}-lines`).cols = 125;
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

    // Invoke-AI
    waitForKeyElements(SEL_INVOKE_BUTTON[ENGINE_IAI], (e) => {
        registerTweaks(ENGINE_IAI);
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => GM_config.close(), { skipEditable: true });//mo
    });

    // Automatic1111
    waitForKeyElements(`gradio-app`, (e) => { // FIXME selector to generic
        registerTweaks(ENGINE_A1111);
        // hot-key alt-F12 / ESC -> Open / close config dialog
        cb.bindKeyDown(KEY_F12, () => GM_config.open(), { mods: { alt: true } });
        cb.bindKeyDown(KEY_ESC, () => GM_config.close(), { skipEditable: true });//mods: { alt: true } });
    });

})();
