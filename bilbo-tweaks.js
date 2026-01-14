// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021-2024, userscript@cbaoth.de
//
// @name        Bilbo Tweaks
// @version     0.13
// @description Some improvments to bilbo time tracking
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/bilbo-tweaks.user.js
//
// @include     /^https?://bilbo.[begrsu]{9}.de/
//
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.min.js
// ==/UserScript==

(function () {
    'use strict';

    // GM_config initialization
    const GM_CONFIG_ID = 'BilboTweaksConfig';
    const GM_CONFIG_FIELDS = {
        // TODO / FIXME Review, e.g. differentiate between part time with full/fixed day/time off vs. flexible hours (total work time per week vs. per day)?
        'weekDayHoursMon': {
            section: ['Working Hours per Day', 'Configure required working hours for each weekday (Monday to Friday). Use decimal values for partial hours (e.g., 6.4 for 6:24, every day in case of 80% part time without fixed days).'],
            label: 'Monday',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 24,
            default: 8
        },
        'weekDayHoursTue': {
            label: 'Tuesday',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 24,
            default: 8
        },
        'weekDayHoursWed': {
            label: 'Wednesday',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 24,
            default: 4
        },
        'weekDayHoursThu': {
            label: 'Thursday',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 24,
            default: 4
        },
        'weekDayHoursFri': {
            label: 'Friday',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 24,
            default: 8
        },
        'defaultFromMon': {
            section: ['Default Start Times', 'Default start times for each weekday when clicking the From label. Use decimal values (e.g., 9 for 09:00, 9.5 for 09:30, 8.75 for 08:45).'],
            label: 'Monday From',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 9
        },
        'defaultFromTue': {
            label: 'Tuesday From',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 9
        },
        'defaultFromWed': {
            label: 'Wednesday From',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 9
        },
        'defaultFromThu': {
            label: 'Thursday From',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 9
        },
        'defaultFromFri': {
            label: 'Friday From',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 9
        },
        'defaultToMon': {
            section: ['Default End Times', 'Default end times for each weekday when clicking the To label. Use decimal values (e.g., 18 for 18:00, 18.5 for 18:30, 14.25 for 14:15).'],
            label: 'Monday To',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 18
        },
        'defaultToTue': {
            label: 'Tuesday To',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 18
        },
        'defaultToWed': {
            label: 'Wednesday To',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 14
        },
        'defaultToThu': {
            label: 'Thursday To',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 14
        },
        'defaultToFri': {
            label: 'Friday To',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 18
        },
        'defaultBreakMon': {
            section: ['Default Break Times', 'Default break duration for each weekday when clicking the Breaks label. Use decimal values (e.g., 1 for 1:00, 0.5 for 0:30, 0.75 for 0:45).'],
            label: 'Monday Break',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 1
        },
        'defaultBreakTue': {
            label: 'Tuesday Break',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 1
        },
        'defaultBreakWed': {
            label: 'Wednesday Break',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 0
        },
        'defaultBreakThu': {
            label: 'Thursday Break',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 0
        },
        'defaultBreakFri': {
            label: 'Friday Break',
            labelPos: 'left',
            type: 'float',
            min: 0,
            max: 23.99,
            default: 1
        },
        'allowWeeklyCorrections': {
            section: ['Weekly Corrections', 'Allow manual corrections for special cases (e.g., working on a holiday, partial sick leave).'],
            label: 'Enable weekly time corrections',
            labelPos: 'left',
            type: 'checkbox',
            default: false
        },
        'showDailyRequiredTime': {
            section: ['Daily Time Display', 'Show required working time and delta for each day in the weekly overview table.'],
            label: 'Show daily required time and delta',
            labelPos: 'left',
            type: 'checkbox',
            default: false
        },
        'autoSaveWeeklyOvertime': {
            section: ['Auto-Save', 'Automatically save weekly overtime when all working days are complete.'],
            label: 'Auto-save weekly overtime',
            labelPos: 'left',
            type: 'select',
            options: ['Disabled', 'When complete (unless outdated)', 'Always when complete'],
            default: 'Disabled'
        }
    };

    GM_config.init({
        'id': GM_CONFIG_ID,
        'title': 'Bilbo Tweaks Configuration',
        'fields': GM_CONFIG_FIELDS,
        'css': '#BilboTweaksConfig { background: #f4f4f4; padding: 20px; }',
        'events': {
            'open': function(doc) {
                const config = this;
                doc.getElementById(config.id + '_closeBtn').textContent = 'Cancel';
            },
            'save': function(values) {
                const config = this;
                alert('Settings saved! Please reload the page for changes to take effect.');
                config.close();
            }
        }
    });

    // Register menu command to open config
    GM_registerMenuCommand('Configure Bilbo Tweaks', () => {
        GM_config.open();
    });

    // Helper function to get config arrays
    function getWeekDayHours() {
        return [
            GM_config.get('weekDayHoursMon'),
            GM_config.get('weekDayHoursTue'),
            GM_config.get('weekDayHoursWed'),
            GM_config.get('weekDayHoursThu'),
            GM_config.get('weekDayHoursFri')
        ];
    }

    function getDefaultTo() {
        return [
            GM_config.get('defaultToMon'),
            GM_config.get('defaultToTue'),
            GM_config.get('defaultToWed'),
            GM_config.get('defaultToThu'),
            GM_config.get('defaultToFri')
        ];
    }

    function getDefaultBreak() {
        return [
            GM_config.get('defaultBreakMon'),
            GM_config.get('defaultBreakTue'),
            GM_config.get('defaultBreakWed'),
            GM_config.get('defaultBreakThu'),
            GM_config.get('defaultBreakFri')
        ];
    }

    function getDefaultFrom() {
        return [
            GM_config.get('defaultFromMon'),
            GM_config.get('defaultFromTue'),
            GM_config.get('defaultFromWed'),
            GM_config.get('defaultFromThu'),
            GM_config.get('defaultFromFri')
        ];
    }

    // ========== OVERTIME TRACKING ==========

    const OVERTIME_STORAGE_KEY = 'weeklyOvertimeData';
    const WEEKLY_CORRECTIONS_KEY = 'weeklyCorrections';

    // Parse TSV data to internal format
    function parseOvertimeTSV(tsvText) {
        if (!tsvText || typeof tsvText !== 'string') {
            return { data: {}, errors: [] };
        }

        const lines = tsvText.trim().split('\n');
        const data = {};
        const errors = [];

        lines.forEach((line, index) => {
            line = line.trim();
            if (!line) return; // Skip empty lines

            // Support multiple delimiters: tab, space, semicolon, pipe, comma (one or more)
            const parts = line.split(/[\t\s;|,]+/);

            if (parts.length !== 2) {
                errors.push(`Line ${index + 1}: Invalid format "${line}" (expected 2 columns)`);
                return;
            }

            const [week, time] = parts;

            // Validate week format (e.g., "48/2025")
            if (!/^\d{1,2}\/\d{4}$/.test(week)) {
                errors.push(`Line ${index + 1}: Invalid week format "${week}" (expected WW/YYYY)`);
                return;
            }

            // Validate time format (e.g., "+05:10" or "-01:30")
            if (!/^[+-]\d{2}:\d{2}$/.test(time)) {
                errors.push(`Line ${index + 1}: Invalid time format "${time}" (expected +/-HH:MM)`);
                return;
            }

            data[week] = time;
        });

        return { data, errors };
    }

    // Convert internal format to TSV (sorted by week/year)
    function overtimeToTSV(data) {
        if (!data || typeof data !== 'object') {
            return '';
        }

        // Sort by year, then week
        const entries = Object.entries(data).sort((a, b) => {
            const [weekA, yearA] = a[0].split('/').map(Number);
            const [weekB, yearB] = b[0].split('/').map(Number);
            return (yearA - yearB) || (weekA - weekB);
        });

        return entries.map(([week, time]) => `${week}\t${time}`).join('\n');
    }

    // Convert time string (+/-HH:MM) to minutes
    function overtimeStringToMinutes(timeStr) {
        const match = timeStr.match(/^([+-])(\d{2}):(\d{2})$/);
        if (!match) return 0;

        const [, sign, hours, minutes] = match;
        const totalMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
        return sign === '-' ? -totalMinutes : totalMinutes;
    }

    const COLOR_POSITIVE = '#2c5282';
    const COLOR_NEGATIVE = '#e53e3e';

    // Convert minutes to overtime string (+/-HH:MM), optionally colorized
    // Usage: minutesToOvertimeString(minutes, posColor, negColor)
    // If posColor/negColor are provided, returns a span with color
    function minutesToOvertimeString(minutes, useColor=true, showPlusSign=true) {
        const sign = minutes >= 0 ? '+' : '-';
        const absMinutes = Math.abs(minutes);
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;
        const str = `${(!showPlusSign && minutes > 0) ? "" : sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        if (!useColor) return str;
        if (minutes > 0) {
            return `<span style="color:${COLOR_POSITIVE}">${str}</span>`;
        } else if (minutes < 0) {
            return `<span style="color:${COLOR_NEGATIVE}">${str}</span>`;
        } else {
            // minutes === 0
            return str;
        }
    }

    // Load overtime data from storage
    function loadOvertimeData() {
        try {
            const tsvData = GM_getValue(OVERTIME_STORAGE_KEY, '');
            const { data, errors } = parseOvertimeTSV(tsvData);
            if (errors.length > 0) {
                console.warn('Overtime data parsing errors:', errors);
            }
            return data;
        } catch (e) {
            console.error('Failed to load overtime data:', e);
            return {};
        }
    }

    // Save overtime data to storage
    function saveOvertimeData(data) {
        try {
            const tsvData = overtimeToTSV(data);
            GM_setValue(OVERTIME_STORAGE_KEY, tsvData);
            return true;
        } catch (e) {
            console.error('Failed to save overtime data:', e);
            return false;
        }
    }

    // Load weekly corrections from storage
    function loadWeeklyCorrections() {
        try {
            const data = GM_getValue(WEEKLY_CORRECTIONS_KEY, '{}');
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to load weekly corrections:', e);
            return {};
        }
    }

    // Save weekly corrections to storage
    function saveWeeklyCorrections(data) {
        try {
            GM_setValue(WEEKLY_CORRECTIONS_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Failed to save weekly corrections:', e);
            return false;
        }
    }

    // Get correction for current week
    function getWeeklyCorrectionMinutes(weekString) {
        if (!GM_config.get('allowWeeklyCorrections')) return 0;

        const corrections = loadWeeklyCorrections();
        const correction = corrections[weekString];
        return correction ? correction.minutes : 0;
    }

    // Get current week number and year from page
    function getCurrentWeekAndYear() {
        // Look for "Week XX/YYYY" in the page header
        const weekHeader = document.querySelector('table.activityTable tbody tr:nth-child(1) td:nth-child(1) b');
        if (weekHeader) {
            const match = weekHeader.textContent.match(/Week (\d{1,2})\/(\d{4})/);
            if (match) {
                return {
                    week: parseInt(match[1], 10),
                    year: parseInt(match[2], 10),
                    weekString: `${match[1]}/${match[2]}`
                };
            }
        }
        return null;
    }

    // Get next week/year string
    function getNextWeek(weekString) {
        const [week, year] = weekString.split('/').map(Number);
        if (week >= 52) {
            return `1/${year + 1}`;
        }
        return `${week + 1}/${year}`;
    }

    // Calculate total overtime including current week
    function calculateTotalOvertime() {
        const currentWeek = getCurrentWeekAndYear();
        if (!currentWeek) {
            return null;
        }

        const storedData = loadOvertimeData();
        let total = 0;
        let foundGaps = [];
        let lastWeek = null;
        let weeksCounted = 0;

        // Sort weeks chronologically
        const sortedWeeks = Object.keys(storedData).sort((a, b) => {
            const [wA, yA] = a.split('/').map(Number);
            const [wB, yB] = b.split('/').map(Number);
            return (yA - yB) || (wA - wB);
        });

        // Calculate up to (but not including) current week
        for (const weekStr of sortedWeeks) {
            const [week, year] = weekStr.split('/').map(Number);

            // Stop if we've reached current week
            if (year > currentWeek.year || (year === currentWeek.year && week >= currentWeek.week)) {
                break;
            }

            // Check for gaps (optional warning)
            if (lastWeek) {
                const expectedNext = getNextWeek(lastWeek);
                if (weekStr !== expectedNext) {
                    foundGaps.push({ expected: expectedNext, actual: weekStr });
                }
            }

            total += overtimeStringToMinutes(storedData[weekStr]);
            lastWeek = weekStr;
            weeksCounted++;
        }

        // Get current week's delta from page
        let currentWeekDelta = 0;
        try {
            const totalWeekCell = document.querySelector(TOTAL_WEEK_TIME_SELECTOR);
            if (totalWeekCell) {
                const actualMinutes = timeToMinutes(totalWeekCell.textContent);
                const requiredMinutes = getRequiredMinutes();
                currentWeekDelta = actualMinutes - requiredMinutes;

                // Apply correction if enabled
                const correctionMinutes = getWeeklyCorrectionMinutes(currentWeek.weekString);
                currentWeekDelta += correctionMinutes;
            }
        } catch (e) {
            console.warn('Could not calculate current week delta:', e);
        }

        total += currentWeekDelta;

        return {
            total,
            totalBeforeThisWeek: total - currentWeekDelta,
            currentWeekDelta,
            weeksCounted,
            foundGaps,
            currentWeekString: currentWeek.weekString,
            currentWeekSaved: storedData.hasOwnProperty(currentWeek.weekString)
        };
    }

    // Add custom styles
    GM_addStyle(`
        table#activityTable {
            width: 350px !important;
        }
        .overtime-summary {
            margin: 10px 0;
            padding: 10px;
            background: #f0f8ff;
            border: 1px solid #4682b4;
            border-radius: 4px;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        .overtime-summary h3 {
            margin: 0 0 8px 0;
            color: #2c5282;
        }
        .overtime-total {
            font-size: 18px;
            font-weight: bold;
            color: #2c5282;
            margin: 5px 0;
        }
        .overtime-breakdown {
            font-size: 14px;
            color: #666;
            margin: 3px 0;
        }
        .overtime-actions {
            margin-top: 10px;
        }
        .overtime-button {
            display: inline-block;
            padding: 6px 12px;
            margin-right: 8px;
            background: #4682b4;
            color: white !important;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none !important;
            font-size: 13px;
        }
        .overtime-button:hover {
            background: #3a6ea5;
            text-decoration: none !important;
        }
        .overtime-warning {
            background: #fff7ed;
            border: 1px solid #fed7aa;
            padding: 8px;
            margin: 8px 0;
            border-radius: 4px;
            font-size: 13px;
            color: #d97706;
        }
    `);

    // Utility: Wait for elements to appear in the DOM using MutationObserver
    function waitForElements(selector, callback, options = {}) {
        const {
            target = document.body,
            once = false,
            timeout = null
        } = options;

        const processedElements = new WeakSet();

        const checkElements = () => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (!processedElements.has(element)) {
                    processedElements.add(element);
                    callback(element);
                }
            });
            return elements.length > 0;
        };

        // Check if elements already exist
        if (checkElements() && once) {
            return;
        }

        // Set up MutationObserver to watch for new elements
        const observer = new MutationObserver(() => {
            if (checkElements() && once) {
                observer.disconnect();
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true
        });

        // Optional timeout
        if (timeout) {
            setTimeout(() => observer.disconnect(), timeout);
        }

        return observer;
    }

    // Utility: Select option in a select element
    function selectOption(selectElement, value) {
        if (selectElement && selectElement.value !== value) {
            selectElement.value = value;
            selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // https://www.w3schools.com/howto/howto_js_scroll_to_top.asp
    //function scrollToTop() {
    //    document.body.scrollTop = 0; // For Safari
    //    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
    //}

    const TOTAL_WEEK_TIME_SELECTOR = `table.activityTable tbody tr:nth-child(6) td:nth-child(9)`;

    // get required daily working time based on day-activity type
    function getRequiredMinutesByType(type, configuredHours, isSub) {
        // For split days (sub-activities), use the configured hours as the basis
        const hoursToUse = configuredHours;

        switch (type) {
            case 'P': // public holiday
            case 'H': // holiday
            case 'SPL': // special leave
            case 'S': // sick leave
            case 'E': // education
                return 0; // no time required for these types
            default: // regular work time (W, WHO, etc.)
                return hoursToUse * 60 * (isSub ? 0.5 : 1);
        }
    }

    // get required daily working time based on all primary and optional sub-activity type
    function getRequiredMinutesByActivityTypes(type, hours, hasSub, typeSub) {
        return getRequiredMinutesByType(type, hours, hasSub)
            + (hasSub ? getRequiredMinutesByType(typeSub, hours, true) : 0);
    }

    // get column index of "today", if any (otherwise -1), note that first column are headers, so index for mo-fr are 1-5
    function getColumnNumberToday() {
        const todaySpan = document.querySelector('table.activityTable tbody > tr:nth-child(1) > td span.Today');
        if (!todaySpan) return -1;

        const todayTd = todaySpan.closest('td');
        const allTds = Array.from(document.querySelectorAll('table.activityTable tbody > tr:nth-child(1) > td'));
        return allTds.indexOf(todayTd);
    }

    // Check if today is within the current work week (Mon-Fri) or if week is in the past
    // Returns: true if today is before or on Friday of current week, false if week is in the past
    function isTodayInWorkWeek() {
        const todayCol = getColumnNumberToday();
        // If today is not in any column (1-5 for Mon-Fri), the week is in the past or future
        // If today is in columns 1-5 (Mon-Fri), we're still in the work week
        return todayCol >= 1 && todayCol <= 5;
    }

    // Check if all working days (Mon-Fri) have status "OK"
    // This considers holidays, sick days, etc. as "complete" days
    function isWeekComplete() {
        // Find the Status row dynamically by looking for the row where first cell contains "Status"
        // This is robust against injected rows (like Required/Delta rows)
        const activityTable = document.querySelector('table.activityTable tbody');
        if (!activityTable) return false;

        let statusRow = null;
        const rows = activityTable.querySelectorAll('tr');
        for (const row of rows) {
            const firstCell = row.querySelector('td:first-child');
            if (firstCell && firstCell.textContent.trim() === 'Status') {
                statusRow = row;
                break;
            }
        }

        if (!statusRow) return false;

        // Check Monday to Friday (columns 2-6)
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const statusCell = statusRow.querySelector(`td:nth-child(${i + 2})`);
            if (!statusCell) return false;

            const statusText = statusCell.textContent.trim();
            // Day is complete if status is "OK" (covers work days, holidays, sick days, etc.)
            if (statusText !== 'OK') {
                return false;
            }
        }
        return true;
    }

    // get required weekly work time in minutes (int)
    function getRequiredMinutes(upUntilNow = false) {
        let result = 0;
        const weekDayHours = getWeekDayHours();

        let index = upUntilNow ? getColumnNumberToday() : -1;
        let n = index < 1 || index > 5 ? 4 : index - 1;
        for (let i = 0; i <= n; i++) { // mo-today or mo-fr if today not within current week mo-fr
            const cell = document.querySelector(`table.activityTable tbody tr:nth-child(2) td:nth-child(${i + 2})`);
            if (!cell) continue;

            let types = cell.textContent.split('/');
            let hasSubType = types.length > 1;
            result += getRequiredMinutesByActivityTypes(types[0], weekDayHours[i], hasSubType, hasSubType ? types[1] : 0 );
        }
        return result;
    }

    // time (string "hours:minutes") to minutes (int)
    function timeToMinutes(time) {
        if (! time.includes(':')) {
            return 0;
        }
        let h = Number.parseInt(time.split(':')[0]);
        let m = Number.parseInt(time.split(':')[1]);
        return h * 60 + m;
    }

    // minutes (int) to time (string "hours:minutes")
    function minutesToTime(minutes) {
        const hours = Math.trunc(minutes / 60);
        const mins = Math.abs(minutes) % 60;
        return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    }

    // colorize timeDelta, green for positive, red for negative, unchanged for 0
    function colorizeTimeDelta(minutesDelta) {
        const timeString = minutesToTime(Math.abs(minutesDelta));
        if (minutesDelta > 0) {
            return `<span style="color: darkgreen;">+${timeString}</span>`;
        } else if (minutesDelta < 0) {
            return `<span style="color: darkred;">-${timeString}</span>`;
        } else {
            return timeString;
        }
    }

    // calculate required working time and delta (to actual total time) and add it to the overview table
    function showTimes() {
        const totalWeekCell = document.querySelector(TOTAL_WEEK_TIME_SELECTOR);
        if (!totalWeekCell) return;

        try {
            let actualMinutes = timeToMinutes(totalWeekCell.textContent);

            let requiredMinutes = getRequiredMinutes();
            let requiredTime = minutesToTime(requiredMinutes);
            let requiredMinutesUpUntilNow = getRequiredMinutes(true);
            let requiredTimeUpUntilNow = minutesToTime(requiredMinutesUpUntilNow);

            // Find the Status row dynamically (same approach as isWeekComplete)
            const activityTable = document.querySelector('table.activityTable tbody');
            let statusRow = null;
            if (activityTable) {
                const rows = activityTable.querySelectorAll('tr');
                for (const row of rows) {
                    const firstCell = row.querySelector('td:first-child');
                    if (firstCell && firstCell.textContent.trim() === 'Status') {
                        statusRow = row;
                        break;
                    }
                }
            }

            let timeUpUntilNowCell = statusRow ? statusRow.querySelector('td:nth-child(9)') : null;

            let minutesDelta = actualMinutes - requiredMinutes;
            let minutesDeltaUpUntilNow = actualMinutes - requiredMinutesUpUntilNow;

            // Display work time required up until current day (Status row, last cell)
            // Only show if today is within the work week (Mon-Fri)
            if (timeUpUntilNowCell && isTodayInWorkWeek()) {
                timeUpUntilNowCell.innerHTML = colorizeTimeDelta(minutesDeltaUpUntilNow) + ' (' + requiredTimeUpUntilNow + ')';
                timeUpUntilNowCell.style.textAlign = 'center';
                timeUpUntilNowCell.title = 'Delta actual vs. required time up until today (required time up until today)';
            } else if (timeUpUntilNowCell) {
                // Week is in the past or weekend, show same as whole week
                timeUpUntilNowCell.innerHTML = colorizeTimeDelta(minutesDelta) + ' (' + requiredTime + ')';
                timeUpUntilNowCell.style.textAlign = 'center';
                timeUpUntilNowCell.title = 'Delta actual vs. required time for the whole week (required time this week in total)';
            }

            // Find the empty row after Status row (has colspan="8")
            // Only add weekly total cell if daily required time display is disabled (otherwise it's redundant)
            if (!GM_config.get('showDailyRequiredTime')) {
                const emptyRow = statusRow ? statusRow.nextElementSibling : null;
                if (emptyRow) {
                    // Find the cell with colspan="8"
                    const colspanCell = emptyRow.querySelector('td[colspan="8"]');
                    if (colspanCell) {
                        // Change colspan from 8 to 7
                        colspanCell.setAttribute('colspan', '7');

                        // Create new cell for weekly total delta
                        const weeklyTotalCell = document.createElement('td');
                        weeklyTotalCell.innerHTML = colorizeTimeDelta(minutesDelta) + ' (' + requiredTime + ')';
                        weeklyTotalCell.style.textAlign = 'center';
                        weeklyTotalCell.title = 'Delta actual vs. required time for the whole week (required time this week in total)';

                        // Append the new cell to the row
                        emptyRow.appendChild(weeklyTotalCell);
                    }
                }
            }

            // Optionally show daily required time and delta
            if (GM_config.get('showDailyRequiredTime')) {
                showDailyRequiredTimes();
            }
        } catch (e) {
            // Config not ready yet, try again later
            console.log('Config not ready for showTimes(), will retry:', e.message);
            setTimeout(() => showTimes(), 100);
        }
    }

    // Show daily required time and delta in new rows
    function showDailyRequiredTimes() {
        const weekDayHours = getWeekDayHours();
        const activityTable = document.querySelector('table.activityTable tbody');
        if (!activityTable) return;

        // Check if rows already exist
        if (document.querySelector('.daily-required-row')) {
            return; // Already added
        }

        // Find the "Total (Hours)" row (row 6)
        const totalHoursRow = activityTable.querySelector('tr:nth-child(6)');
        if (!totalHoursRow) return;

        // Create "Required (Hours)" row
        const requiredRow = document.createElement('tr');
        requiredRow.className = 'daily-required-row';

        const requiredLabelCell = document.createElement('td');
        requiredLabelCell.align = 'center';
        requiredLabelCell.className = 'darkColumn';
        requiredLabelCell.textContent = 'Required (Hours)';
        requiredRow.appendChild(requiredLabelCell);

        // Create "Delta (Hours)" row
        const deltaRow = document.createElement('tr');
        deltaRow.className = 'daily-delta-row';

        const deltaLabelCell = document.createElement('td');
        deltaLabelCell.align = 'center';
        deltaLabelCell.className = 'darkColumn';
        deltaLabelCell.textContent = 'Delta (Hours)';
        deltaRow.appendChild(deltaLabelCell);

        // Add cells for each day (Monday-Sunday, 7 days + 1 total column = 8 cells)
        for (let i = 0; i < 8; i++) {
            const requiredCell = document.createElement('td');
            requiredCell.style.textAlign = 'center';

            const deltaCell = document.createElement('td');
            deltaCell.style.textAlign = 'center';

            if (i < 5) { // Monday to Friday
                // Get actual time from "Total (Hours)" row
                const actualCell = totalHoursRow.querySelector(`td:nth-child(${i + 2})`);
                if (actualCell) {
                    const actualText = actualCell.textContent.trim();
                    const actualMinutes = timeToMinutes(actualText);

                    // Get activity types for this day
                    const typeRow = activityTable.querySelector('tr:nth-child(2)');
                    const typeCell = typeRow?.querySelector(`td:nth-child(${i + 2})`);
                    let types = [];
                    if (typeCell) {
                        const typeText = typeCell.textContent.trim();
                        types = typeText.split('/');
                    }

                    // Calculate required minutes for this day
                    let requiredMinutes = 0;
                    if (types.length > 0) {
                        const hasSubType = types.length > 1;
                        requiredMinutes = getRequiredMinutesByActivityTypes(
                            types[0],
                            weekDayHours[i],
                            hasSubType,
                            hasSubType ? types[1] : null
                        );
                    } else {
                        // Default: regular working day
                        requiredMinutes = weekDayHours[i] * 60;
                    }

                    const requiredTime = minutesToTime(requiredMinutes);
                    const deltaMinutes = actualMinutes - requiredMinutes;

                    requiredCell.textContent = requiredTime;
                    deltaCell.innerHTML = colorizeTimeDelta(deltaMinutes);

                    // Use faint color for 00:00 values (no time required/no delta)
                    if (requiredMinutes === 0) {
                        requiredCell.style.color = 'silver';
                    }
                    if (deltaMinutes === 0) {
                        deltaCell.style.color = 'silver';
                    }

                    // Copy hover attributes and identifiers from actual cell
                    const onmouseover = actualCell.getAttribute('onmouseover');
                    const onmouseout = actualCell.getAttribute('onmouseout');
                    const cellId = actualCell.getAttribute('id');
                    const cellName = actualCell.getAttribute('name');

                    if (onmouseover && onmouseout) {
                        requiredCell.setAttribute('onmouseover', onmouseover);
                        requiredCell.setAttribute('onmouseout', onmouseout);
                        deltaCell.setAttribute('onmouseover', onmouseover);
                        deltaCell.setAttribute('onmouseout', onmouseout);
                    }

                    if (cellId) {
                        requiredCell.setAttribute('id', cellId);
                        requiredCell.setAttribute('name', cellId);
                        deltaCell.setAttribute('id', cellId);
                        deltaCell.setAttribute('name', cellId);
                    }
                } else {
                    requiredCell.innerHTML = '&nbsp;';
                    deltaCell.innerHTML = '&nbsp;';
                }
            } else if (i === 7) { // Week Total column
                // Show weekly totals
                requiredCell.textContent = minutesToTime(getRequiredMinutes());
                const actualMinutes = timeToMinutes(totalHoursRow.querySelector('td:nth-child(9)').textContent);
                const deltaMinutes = actualMinutes - getRequiredMinutes();
                deltaCell.innerHTML = colorizeTimeDelta(deltaMinutes);
            } else {
                // Saturday/Sunday - empty but copy hover attributes
                requiredCell.innerHTML = '&nbsp;';
                deltaCell.innerHTML = '&nbsp;';

                // Copy hover attributes from the weekend cells
                const weekendCell = totalHoursRow.querySelector(`td:nth-child(${i + 2})`);
                if (weekendCell) {
                    const onmouseover = weekendCell.getAttribute('onmouseover');
                    const onmouseout = weekendCell.getAttribute('onmouseout');
                    const cellId = weekendCell.getAttribute('id');
                    const cellName = weekendCell.getAttribute('name');

                    if (onmouseover && onmouseout) {
                        requiredCell.setAttribute('onmouseover', onmouseover);
                        requiredCell.setAttribute('onmouseout', onmouseout);
                        deltaCell.setAttribute('onmouseover', onmouseover);
                        deltaCell.setAttribute('onmouseout', onmouseout);
                    }

                    if (cellId) {
                        requiredCell.setAttribute('id', cellId);
                        requiredCell.setAttribute('name', cellId);
                        deltaCell.setAttribute('id', cellId);
                        deltaCell.setAttribute('name', cellId);
                    }
                }
            }

            requiredRow.appendChild(requiredCell);
            deltaRow.appendChild(deltaCell);
        }

        // Insert rows after "Total (Hours)" row
        totalHoursRow.after(requiredRow);
        requiredRow.after(deltaRow);
    }


    // Display overtime summary on weekly overview page
    function showOvertimeSummary() {
        const overtime = calculateTotalOvertime();
        if (!overtime) {
            console.log('Could not calculate overtime - not on weekly overview page');
            return;
        }

        // Find the table to insert summary after
        const activityTable = document.querySelector('table.activityTable');
        if (!activityTable) return;

        // Check if summary already exists
        let summaryDiv = document.querySelector('.overtime-summary');
        if (!summaryDiv) {
            summaryDiv = document.createElement('div');
            summaryDiv.className = 'overtime-summary';
            activityTable.parentElement.appendChild(summaryDiv);
        }

        // Match the width of the activity table
        const tableWidth = activityTable.offsetWidth;
        if (tableWidth > 0) {
            summaryDiv.style.width = `${tableWidth}px`;
        }


        // Calculate current week only: now and whole week
        let actualMinutesUpToToday = 0;
        let requiredMinutesUpToToday = 0;
        let minutesDeltaUpToToday = 0;
        try {
            const requiredUpToToday = getRequiredMinutes(true);
            requiredMinutesUpToToday = requiredUpToToday;
            // Actual up to today: sum all actual times for days up to today
            const todayCol = getColumnNumberToday();
            if (todayCol >= 1 && todayCol <= 5) {
                for (let i = 1; i <= todayCol; i++) {
                    const cell = document.querySelector(`table.activityTable tbody tr:nth-child(6) td:nth-child(${i + 1})`);
                    if (cell) actualMinutesUpToToday += timeToMinutes(cell.textContent);
                }
            }
            minutesDeltaUpToToday = actualMinutesUpToToday - requiredMinutesUpToToday;
        } catch (e) {
            console.warn('Could not calculate overtime up to today:', e);
        }

        // Previous weeks total
        const previousWeeksMinutes = overtime.totalBeforeThisWeek;
        const previousWeeksStr = minutesToOvertimeString(previousWeeksMinutes)

        // Current week only (already includes correction in calculateTotalOvertime)
        const minutesDeltaWeek = overtime.currentWeekDelta;
        const minutesDeltaWeekStr = minutesToOvertimeString(minutesDeltaWeek);
        const minutesDeltaUpToTodayStr = minutesToOvertimeString(minutesDeltaUpToToday);

        // Current week + overtime account
        const weekWithOvertime = minutesDeltaWeek + previousWeeksMinutes;
        const weekWithOvertimeStr = minutesToOvertimeString(weekWithOvertime);
        const upToTodayWithOvertime = minutesDeltaUpToToday + previousWeeksMinutes;
        const upToTodayWithOvertimeStr = minutesToOvertimeString(upToTodayWithOvertime);

        // Check if there's a correction applied
        const correctionMinutes = getWeeklyCorrectionMinutes(overtime.currentWeekString);
        const hasCorrection = correctionMinutes !== 0;

        // Auto-save logic
        let autoSaveMessage = '';
        const autoSaveMode = GM_config.get('autoSaveWeeklyOvertime');
        if (autoSaveMode !== 'Disabled' && isWeekComplete()) {
            const storedData = loadOvertimeData();
            const savedOvertimeStr = storedData[overtime.currentWeekString];
            const savedMinutes = savedOvertimeStr ? overtimeStringToMinutes(savedOvertimeStr) : null;

            let shouldAutoSave = false;
            if (autoSaveMode === 'Always when complete') {
                // Always save when week is complete unless saved value matches current calculation (info will be shown later on)
                shouldAutoSave = savedMinutes === null || savedMinutes !== minutesDeltaWeek;
            } else if (autoSaveMode === 'When complete (unless outdated)') {
                // Only save if no record exists OR if saved value matches current calculation
                shouldAutoSave = savedMinutes === null || savedMinutes === minutesDeltaWeek;
            }

            if (shouldAutoSave) {
                // Check if we're overwriting a different value
                const isOverwriting = savedMinutes !== null && savedMinutes !== minutesDeltaWeek;

                // Perform auto-save
                const overtimeStr = minutesToOvertimeString(minutesDeltaWeek, false);
                storedData[overtime.currentWeekString] = overtimeStr;
                saveOvertimeData(storedData);
                overtime.currentWeekSaved = true;

                autoSaveMessage = `<div style="background:#e6f7ff;border:1px solid #91d5ff;padding:8px;margin:8px 0;border-radius:4px;font-size:13px;color:#1890ff;">
                    ℹ️ Week ${overtime.currentWeekString} auto-saved as <b>${overtimeStr}</b>
                </div>`;

                // Add warning if we overwrote a different value
                if (isOverwriting) {
                    autoSaveMessage += `<div class="overtime-warning" style="margin-top:0;">⚠️ Previous value <b>${savedOvertimeStr}</b> was overwritten with the new calculated value.</div>`;
                }
            }
        }

        // Build overtime account header with calculation if week is complete and saved
        let overtimeAccountDisplay = previousWeeksStr;
        if (isWeekComplete() && overtime.currentWeekSaved) {
            const storedData = loadOvertimeData();
            const savedOvertimeStr = storedData[overtime.currentWeekString];
            const savedMinutes = savedOvertimeStr ? overtimeStringToMinutes(savedOvertimeStr) : null;

            if (savedMinutes !== null) {
                const newTotal = previousWeeksMinutes + savedMinutes;
                const newTotalStr = minutesToOvertimeString(newTotal);

                // Check if saved value differs from current calculation
                const isOutdated = savedMinutes !== minutesDeltaWeek;
                const warningIcon = isOutdated ? ' ⚠️' : '';

                // Get colored version of saved value, but override with warning color if outdated
                let savedValueDisplay = minutesToOvertimeString(savedMinutes);
                if (isOutdated) {
                    // Override color with warning orange for outdated values
                    savedValueDisplay = `<span style="color:#d97706;font-weight:bold;">${savedOvertimeStr}${warningIcon}</span>`;
                } else {
                    // Use normal colored version (red for negative, blue for positive)
                    savedValueDisplay = savedValueDisplay + warningIcon;
                }

                // Underline the new total to make it more prominent
                const underlinedNewTotal = newTotalStr.includes('style=')
                    ? newTotalStr.replace('style="', 'style="text-decoration:underline;')
                    : newTotalStr.includes('<span')
                    ? newTotalStr.replace('<span', '<span style="text-decoration:underline;"')
                    : `<span style="text-decoration:underline;">${newTotalStr}</span>`;

                overtimeAccountDisplay = `
                    <div style="font-size:20px;font-weight:bold;margin-bottom:4px;">${previousWeeksStr} <span style="font-size:16px;font-weight:normal;color:#666;">+</span> ${savedValueDisplay} <span style="font-size:16px;font-weight:normal;color:#666;">=</span> ${underlinedNewTotal}</div>
                    <div style="font-size:12px;color:#666;margin-bottom:4px;">Previous weeks + Current week (saved) = <span style="text-decoration:underline;">New total</span></div>
                `;
            }
        }

        let html = `
            <h2 style="margin-bottom:8px;">📊 Overtime Account</h2>
            ${typeof overtimeAccountDisplay === 'string' && overtimeAccountDisplay.includes('<div') ? overtimeAccountDisplay : `<div style="font-size:20px;font-weight:bold;color:#2c5282;margin-bottom:8px;">${overtimeAccountDisplay}</div>`}

            <h3 style="margin:8px 0 2px 0;font-size:15px;color:#4682b4;">Current Week Only</h3>
        `;

        // Only show "Time left until now" if today is within the work week
        if (isTodayInWorkWeek()) {
            html += `<div style="font-size:14px;margin-bottom:2px;">Time left until now: <b>${minutesDeltaUpToTodayStr}</b> (from ${minutesToOvertimeString(requiredMinutesUpToToday, false)})${hasCorrection ? ' 🔧' : ''}</div>`;
        }

        html += `<div style="font-size:14px;margin-bottom:8px;">Time left for whole week: <b>${minutesDeltaWeekStr}</b>${hasCorrection ? ' 🔧' : ''}</div>
        `;

        html += `
            <h3 style="margin:8px 0 2px 0;font-size:15px;color:#4682b4;">Current Week + Overtime Account</h3>
        `;

        // Only show "Time left for now" if today is within the work week
        if (isTodayInWorkWeek()) {
            html += `<div style="font-size:14px;margin-bottom:2px;">Time left for now: <b>${upToTodayWithOvertimeStr}</b>${hasCorrection ? ' 🔧' : ''}</div>`;
        }

        html += `<div style="font-size:14px;margin-bottom:8px;">Time left for whole week: <b>${weekWithOvertimeStr}</b>${hasCorrection ? ' 🔧' : ''}</div>
        `;

        // Show manual adjustment info if active (as a bubble below time displays)
        if (hasCorrection) {
            const uncorrectedMinutes = minutesDeltaWeek - correctionMinutes;
            const uncorrectedStr = minutesToOvertimeString(uncorrectedMinutes, false);
            const correctionStr = minutesToOvertimeString(correctionMinutes, false);
            const corrections = loadWeeklyCorrections();
            const correctionReason = corrections[overtime.currentWeekString]?.reason || '';
            html += `<div style="background:#f5f5f5;border:1px solid #d9d9d9;padding:8px;margin:8px 0;border-radius:4px;font-size:13px;color:#595959;">
                🔧 <b>Manual adjustment:</b> ${correctionStr} added to calculated ${uncorrectedStr}${correctionReason ? '<br/>💬 <b>Reason:</b> <span style="font-size: 0.85em; font-style:italic;">' + correctionReason + '</span>' : ''}
            </div>`;
        }


        // Show auto-save message if applicable
        if (autoSaveMessage) {
            html += autoSaveMessage;
        }

        // Check if current week already saved and if it differs from calculated value
        // (but don't show warning if we just auto-saved)
        if (overtime.currentWeekSaved && !autoSaveMessage) {
            const storedData = loadOvertimeData();
            const savedOvertimeStr = storedData[overtime.currentWeekString];
            const savedMinutes = overtimeStringToMinutes(savedOvertimeStr);

            if (savedMinutes !== minutesDeltaWeek) {
                // Saved value differs from calculated value - show warning
                const calculatedStr = minutesToOvertimeString(minutesDeltaWeek, false);
                html += `<div class="overtime-warning">⚠️ Week ${overtime.currentWeekString} is already saved as <b>${savedOvertimeStr}</b>, but current calculation shows <b>${calculatedStr}</b>. Saving will overwrite with the new value.</div>`;
            } else {
                // Saved value matches calculated value - show info
                html += `<div style="background:#e6f7ff;border:1px solid #91d5ff;padding:8px;margin:8px 0;border-radius:4px;font-size:13px;color:#1890ff;">
                    ℹ️ Week ${overtime.currentWeekString} has already been saved with the current value (<b>${savedOvertimeStr}</b>).
                </div>`;
            }
        }

        // Show warning if gaps found
        if (overtime.foundGaps.length > 0) {
            html += `<div class="overtime-warning">⚠️ Warning: ${overtime.foundGaps.length} gap(s) in overtime history</div>`;
        }

        // Add action buttons
        html += `
            <div class="overtime-actions">
                <a href="#" id="saveCurrentWeek" class="overtime-button">💾 Save This Week</a>
                <a href="#" id="copyForExcel" class="overtime-button">📋 Copy for Excel</a>
                <a href="#" id="manageHistory" class="overtime-button">⚙️ Manage History</a>`;

        // Add correction button if enabled
        if (GM_config.get('allowWeeklyCorrections')) {
            html += `
                <a href="#" id="editCorrection" class="overtime-button">✏️ Adjust This Week</a>`;
        }

        html += `
            </div>
        `;

        summaryDiv.innerHTML = html;

        // Attach event listeners
        document.getElementById('saveCurrentWeek').addEventListener('click', (e) => {
            e.preventDefault();
            saveCurrentWeekOvertime();
        });

        document.getElementById('copyForExcel').addEventListener('click', (e) => {
            e.preventDefault();
            copyCurrentWeekForExcel();
        });

        document.getElementById('manageHistory').addEventListener('click', (e) => {
            e.preventDefault();
            openOvertimeManager();
        });

        // Add event listener for correction button if it exists
        const editCorrectionBtn = document.getElementById('editCorrection');
        if (editCorrectionBtn) {
            editCorrectionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                editWeeklyCorrection();
            });
        }
    }

    // Save current week's overtime
    function saveCurrentWeekOvertime() {
        const currentWeek = getCurrentWeekAndYear();
        if (!currentWeek) {
            alert('Could not determine current week');
            return;
        }

        const overtime = calculateTotalOvertime();
        if (!overtime) {
            alert('Could not calculate overtime');
            return;
        }

        const overtimeStr = minutesToOvertimeString(overtime.currentWeekDelta, false);
        const data = loadOvertimeData();

        // Check if already exists
        if (data.hasOwnProperty(currentWeek.weekString)) {
            if (!confirm(`Week ${currentWeek.weekString} is already saved as ${data[currentWeek.weekString]}.\n\nOverwrite with ${overtimeStr}?`)) {
                return;
            }
        }

        // Save
        data[currentWeek.weekString] = overtimeStr;
        if (saveOvertimeData(data)) {
            alert(`✅ Saved week ${currentWeek.weekString}: ${overtimeStr}`);
            showOvertimeSummary(); // Refresh display
        } else {
            alert('❌ Failed to save overtime data');
        }
    }

    // Copy current week data for Excel
    function copyCurrentWeekForExcel() {
        const currentWeek = getCurrentWeekAndYear();
        if (!currentWeek) {
            alert('Could not determine current week');
            return;
        }

        const overtime = calculateTotalOvertime();
        if (!overtime) {
            alert('Could not calculate overtime');
            return;
        }

        const overtimeStr = minutesToOvertimeString(overtime.currentWeekDelta, false);
        const textToCopy = `${currentWeek.weekString}\t${overtimeStr}`;

        // Copy to clipboard
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(`✅ Copied to clipboard:\n${currentWeek.weekString}\t${overtimeStr}\n\nYou can now paste this into Excel.`);
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert(`✅ Copied to clipboard:\n${currentWeek.weekString}\t${overtimeStr}\n\nYou can now paste this into Excel.`);
        });
    }

    // Open overtime history manager (simple prompt-based for now)
    function openOvertimeManager() {
        const data = loadOvertimeData();
        const tsvData = overtimeToTSV(data);
        const weekCount = Object.keys(data).length;

        const action = prompt(
            `📊 Overtime History Manager\n\n` +
            `Current data (${weekCount} weeks):\n\n` +
            `Choose an action:\n` +
            `1 - View all data\n` +
            `2 - Import from Excel (paste TSV)\n` +
            `3 - Export to clipboard\n` +
            `4 - View/Export corrections\n` +
            `5 - Clear all data\n` +
            `0 - Cancel`,
            '1'
        );

        if (!action || action === '0') return;

        switch (action) {
            case '1':
                // View data
                if (weekCount === 0) {
                    alert('No overtime data saved yet.');
                } else {
                    alert(`Overtime History (${weekCount} weeks):\n\n${tsvData}`);
                }
                break;

            case '2':
                // Import
                importOvertimeData();
                break;

            case '3':
                // Export
                if (weekCount === 0) {
                    alert('No overtime data to export.');
                } else {
                    navigator.clipboard.writeText(tsvData).then(() => {
                        alert(`✅ Exported ${weekCount} weeks to clipboard.\n\nYou can now paste into Excel.`);
                    }).catch(() => {
                        prompt('Copy this data to clipboard:', tsvData);
                    });
                }
                break;

            case '4':
                // View corrections
                viewCorrections();
                break;

            case '5':
                // Clear
                if (confirm(`⚠️ Delete all ${weekCount} weeks of overtime data?\n\nThis cannot be undone!`)) {
                    saveOvertimeData({});
                    alert('✅ All overtime data cleared.');
                    showOvertimeSummary(); // Refresh display
                }
                break;

            default:
                alert('Invalid option');
        }
    }

    // Import overtime data from TSV
    function importOvertimeData() {
        const tsvInput = prompt(
            `📥 Import Overtime Data\n\n` +
            `Paste TSV data from Excel (format: WW/YYYY [tab] +/-HH:MM):\n\n` +
            `Example:\n` +
            `1/2025\t+00:00\n` +
            `2/2025\t+00:15\n` +
            `3/2025\t+02:30\n\n` +
            `Leave empty to cancel.`,
            ''
        );

        if (!tsvInput) return;

        const { data, errors } = parseOvertimeTSV(tsvInput);

        if (errors.length > 0) {
            alert(`❌ Import failed with ${errors.length} error(s):\n\n${errors.join('\n')}`);
            return;
        }

        const weekCount = Object.keys(data).length;
        if (weekCount === 0) {
            alert('No valid data found.');
            return;
        }

        // Ask for confirmation
        const preview = overtimeToTSV(data);
        if (!confirm(`Import ${weekCount} weeks of data?\n\nPreview:\n${preview.substring(0, 200)}${preview.length > 200 ? '...' : ''}\n\nThis will overwrite existing data!`)) {
            return;
        }

        // Save
        if (saveOvertimeData(data)) {
            alert(`✅ Imported ${weekCount} weeks successfully!`);
            showOvertimeSummary(); // Refresh display
        } else {
            alert('❌ Failed to save imported data');
        }
    }

    // View and export corrections
    function viewCorrections() {
        const corrections = loadWeeklyCorrections();
        const weeks = Object.keys(corrections).sort((a, b) => {
            const [wA, yA] = a.split('/').map(Number);
            const [wB, yB] = b.split('/').map(Number);
            return (yA - yB) || (wA - wB);
        });

        if (weeks.length === 0) {
            alert('No corrections saved.');
            return;
        }

        let output = 'Week\tCorrection\tReason\tTimestamp\n';
        weeks.forEach(week => {
            const corr = corrections[week];
            const timeStr = minutesToOvertimeString(corr.minutes, false);
            const timestamp = corr.timestamp ? new Date(corr.timestamp).toLocaleDateString() : '-';
            output += `${week}\t${timeStr}\t${corr.reason || '-'}\t${timestamp}\n`;
        });

        const action = prompt(
            `📝 Weekly Corrections (${weeks.length} entries)\n\n` +
            `1 - View all\n` +
            `2 - Copy to clipboard\n` +
            `3 - Clear all corrections\n` +
            `0 - Cancel`,
            '1'
        );

        if (!action || action === '0') return;

        switch (action) {
            case '1':
                alert(output);
                break;
            case '2':
                navigator.clipboard.writeText(output).then(() => {
                    alert('✅ Copied to clipboard');
                }).catch(() => {
                    prompt('Copy this data:', output);
                });
                break;
            case '3':
                if (confirm(`⚠️ Delete all ${weeks.length} corrections?\n\nThis cannot be undone!`)) {
                    saveWeeklyCorrections({});
                    alert('✅ All corrections cleared');
                    showOvertimeSummary(); // Refresh display
                }
                break;
        }
    }

    // https://stackoverflow.com/a/41421759/7393995
    function selectOptionAsync(selectElement, value) {
        selectElement.dispatchEvent(new Event("click"));
        selectElement.value = value;
        selectElement.dispatchEvent(new Event("change"));
    }

    // parse time string (hh:mm or -hh:mm) to minutes, returns 0 if invalid
    function parseTimeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') {
            return 0;
        }

        timeStr = timeStr.trim();
        const isNegative = timeStr.startsWith('-');
        if (isNegative) {
            timeStr = timeStr.substring(1);
        }

        if (!timeStr.includes(':')) {
            return 0;
        }

        const parts = timeStr.split(':');
        if (parts.length !== 2) {
            return 0;
        }

        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);

        if (isNaN(hours) || isNaN(minutes)) {
            return 0;
        }

        const totalMinutes = hours * 60 + minutes;
        return isNegative ? -totalMinutes : totalMinutes;
    }

    // add Bilbo's "Time left to assign" value to the hours input field
    // This reads the "Time left to assign: hh:mm" counter from Bilbo's UI and adds it to the project hours
    function addTimeLeftToAssign(hoursInput) {
        const timeCounterSpan = document.getElementById('timeCounter');
        if (!timeCounterSpan) {
            console.error('Bilbo time counter ("Time left to assign") not found');
            return;
        }

        const remainingTimeStr = timeCounterSpan.textContent.trim();
        const remainingMinutes = parseTimeToMinutes(remainingTimeStr);

        const currentTimeStr = hoursInput.value.trim();
        const currentMinutes = parseTimeToMinutes(currentTimeStr);

        const newMinutes = currentMinutes + remainingMinutes;
        const newTimeStr = minutesToTime(Math.abs(newMinutes));

        // Update the input field
        hoursInput.value = newTimeStr;

        // Trigger change event to update the time counter (calls the page's onchange handler)
        hoursInput.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`Added time left to assign: ${currentTimeStr} + ${remainingTimeStr} = ${newTimeStr}`);
    }

    // adjust time value in input field by offset (in minutes), respecting min/max bounds
    function adjustTimeValue(inputField, offsetMinutes) {
        const currentTimeStr = inputField.value.trim();
        let currentMinutes = parseTimeToMinutes(currentTimeStr);

        // Apply incremental rounding for ±5min adjustments
        if (Math.abs(offsetMinutes) === 5) {
            if (offsetMinutes > 0) {
                // Round up to next 5-minute increment (e.g., 13 -> 15)
                const remainder = currentMinutes % 5;
                if (remainder === 0) {
                    currentMinutes += 5; // Already on increment, add 5
                } else {
                    currentMinutes += (5 - remainder); // Round up to next
                }
            } else {
                // Round down to previous 5-minute increment (e.g., 13 -> 10, 10 -> 5)
                const remainder = currentMinutes % 5;
                if (remainder === 0) {
                    currentMinutes -= 5; // Already on increment, subtract 5
                } else {
                    currentMinutes = Math.floor(currentMinutes / 5) * 5; // Round down to previous
                }
            }
        } else {
            // For ±1h, just add the offset
            currentMinutes = currentMinutes + offsetMinutes;
        }

        // Bound between 00:00 and 23:59
        let newMinutes = Math.max(0, Math.min(currentMinutes, 23 * 60 + 59));

        const newTimeStr = minutesToTime(newMinutes);
        inputField.value = newTimeStr;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // create increment/decrement links for time input fields
    function createAdjustmentLinks(inputField) {
        const span = document.createElement('span');
        span.style.marginLeft = '5px';
        span.style.whiteSpace = 'nowrap';

        const links = [
            { offset: -60, text: '-1h', title: 'Subtract 1 hour' },
            { offset: -5, text: '-5m', title: 'Subtract 5 minutes' },
            { offset: 5, text: '+5m', title: 'Add 5 minutes' },
            { offset: 60, text: '+1h', title: 'Add 1 hour' }
        ];

        links.forEach((linkData, index) => {
            if (index > 0) {
                span.appendChild(document.createTextNode(' '));
            }

            const link = document.createElement('a');
            link.href = '/#';
            link.className = 'time-adjust';
            link.textContent = linkData.text;
            link.title = linkData.title;
            link.dataset.offset = linkData.offset;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                adjustTimeValue(inputField, linkData.offset);
                return false;
            });

            span.appendChild(link);
        });

        return span;
    }

    // add increment/decrement links to time input fields
    function addTimeAdjustmentLinks() {
        // Add to from/to/break fields (using actual field names)
        const fromToBreakFields = document.querySelectorAll('input[name="startTimeStr"], input[name="endTimeStr"], input[name="breaksStr"]');
        console.log(`Found ${fromToBreakFields.length} from/to/break fields`);

        fromToBreakFields.forEach(inputField => {
            if (inputField.dataset.adjustmentLinksAdded) {
                return;
            }

            inputField.dataset.adjustmentLinksAdded = 'true';

            const links = createAdjustmentLinks(inputField);

            // For from/to/break fields, insert after the "&nbsp;h" unit text
            // Look for text nodes containing "h" after the input field
            const parentTd = inputField.parentElement;
            const allNodes = Array.from(parentTd.childNodes);
            let insertAfterNode = inputField;

            // Find the text node containing "&nbsp;h" or " h" after the input field
            let foundInputField = false;
            for (const node of allNodes) {
                if (node === inputField) {
                    foundInputField = true;
                } else if (foundInputField && node.nodeType === Node.TEXT_NODE) {
                    if (node.textContent.includes('h')) {
                        insertAfterNode = node;
                        break;
                    }
                }
            }

            insertAfterNode.after(links);
            console.log(`Added adjustment links to ${inputField.name} field`);
        });

        // Add to hours fields (with extra spacing)
        document.querySelectorAll('input[name="hour"]').forEach(inputField => {
            if (inputField.dataset.adjustmentLinksAdded) {
                return;
            }

            inputField.dataset.adjustmentLinksAdded = 'true';

            const links = createAdjustmentLinks(inputField);
            links.style.marginLeft = '5px';

            inputField.after(links);
        });
    }

    // get day of week (0=Sunday, 1=Monday, ..., 6=Saturday) from targetDateStr
    function getDayOfWeekFromTargetDate() {
        const targetDateInput = document.querySelector('input[name="targetDateStr"]');
        if (!targetDateInput || !targetDateInput.value) {
            console.log('targetDateStr field not found or empty');
            return -1;
        }

        const targetDateStr = targetDateInput.value;

        // Parse date string (format: dd/mm/yyyy or dd.MM.yyyy)
        const parts = targetDateStr.split(/[./]/); // Split by either . or /
        if (parts.length !== 3) {
            console.log(`Invalid date format: ${targetDateStr}`);
            return -1;
        }

        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
        const year = parseInt(parts[2], 10);

        if (isNaN(day) || isNaN(month) || isNaN(year)) {
            console.log(`Failed to parse date: ${targetDateStr}`);
            return -1;
        }

        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        console.log(`Parsed date ${targetDateStr} as day of week: ${dayOfWeek} (0=Sun, 1=Mon, ..., 6=Sat)`);
        return dayOfWeek;
    }

    // get Monday-Friday index (0-4) from day of week (0-6, where 0=Sunday)
    function getWeekdayIndex(dayOfWeek) {
        if (dayOfWeek === 0) return -1; // Sunday
        if (dayOfWeek === 6) return -1; // Saturday
        return dayOfWeek - 1; // Monday=0, Tuesday=1, ..., Friday=4
    }

    // set default value for from/to/break fields
    function setDefaultTimeValue(fieldName) {
        const dayOfWeek = getDayOfWeekFromTargetDate();
        const weekdayIndex = getWeekdayIndex(dayOfWeek);

        if (weekdayIndex < 0) {
            console.log('Not a weekday, cannot set default value');
            return;
        }

        const weekDayHours = getWeekDayHours();
        const defaultTo = getDefaultTo();
        const defaultBreak = getDefaultBreak();
        const defaultFrom = getDefaultFrom();

        let value;
        let actualFieldName;

        if (fieldName === 'from' || fieldName === 'startTimeStr') {
            actualFieldName = 'startTimeStr';
            value = minutesToTime(defaultFrom[weekdayIndex] * 60);
        } else if (fieldName === 'to' || fieldName === 'endTimeStr') {
            actualFieldName = 'endTimeStr';
            const fromField = document.querySelector('input[name="startTimeStr"]');
            const fromMinutes = fromField ? parseTimeToMinutes(fromField.value.trim()) : 0;

            if (fromMinutes > 0) {
                // Calculate to = from + work hours + break
                value = minutesToTime(fromMinutes + weekDayHours[weekdayIndex] * 60 + defaultBreak[weekdayIndex] * 60);
            } else {
                // Use default to time
                value = minutesToTime(defaultTo[weekdayIndex] * 60);
            }
        } else if (fieldName === 'break' || fieldName === 'breaksStr') {
            actualFieldName = 'breaksStr';
            value = minutesToTime(defaultBreak[weekdayIndex] * 60);
        }

        const inputField = document.querySelector(`input[name="${actualFieldName}"]`);
        if (inputField) {
            inputField.value = value;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Set default value for ${actualFieldName}: ${value}`);
        }
    }

    // make from/to/break labels clickable to set default values
    function makeLabelsClickable() {
        // Find the input fields and then find their corresponding labels
        // Using English captions: "From:", "To:", "Breaks:"
        const fieldMappings = [
            { fieldName: 'startTimeStr', labelText: 'From:' },
            { fieldName: 'endTimeStr', labelText: 'To:' },
            { fieldName: 'breaksStr', labelText: 'Breaks:' }
        ];

        fieldMappings.forEach(mapping => {
            const inputField = document.querySelector(`input[name="${mapping.fieldName}"]`);
            if (!inputField) {
                console.log(`Field not found: ${mapping.fieldName}`);
                return;
            }

            // Find the label <td> in the same row that contains the exact caption text
            const row = inputField.closest('tr');
            const tds = row.querySelectorAll('td');
            let label = null;

            for (const td of tds) {
                const text = td.textContent.trim();
                // Match the exact caption, case-insensitive, with optional whitespace
                if (text.toLowerCase().replace(/\s+/g, '') === mapping.labelText.toLowerCase().replace(/\s+/g, '')) {
                    label = td;
                    break;
                }
            }

            if (!label) {
                console.log(`Label not found for: ${mapping.fieldName} (looking for "${mapping.labelText}")`);
                return;
            }

            if (label.dataset.clickableAdded) {
                return;
            }

            label.dataset.clickableAdded = 'true';

            // Trim the label text to remove trailing whitespace/nbsp
            const originalHtml = label.innerHTML;
            const trimmedHtml = originalHtml.replace(/(&nbsp;|\s)+$/g, '');
            label.innerHTML = trimmedHtml;

            // Make label look like a link
            label.style.color = '#000080';
            label.style.textDecoration = 'none';
            label.style.cursor = 'pointer';

            // Add hover effect for underline
            label.addEventListener('mouseenter', function() {
                this.style.textDecoration = 'underline';
            });

            label.addEventListener('mouseleave', function() {
                this.style.textDecoration = 'none';
            });

            // Generate descriptive tooltip based on field type and current day
            // Use try-catch to handle case when GM_config isn't ready yet
            let tooltipText = 'Click to set default value';

            try {
                const dayOfWeek = getDayOfWeekFromTargetDate();
                const weekdayIndex = getWeekdayIndex(dayOfWeek);

                if (weekdayIndex >= 0 && weekdayIndex <= 4) {
                    // Get config values (only if config is ready)
                    const weekDayHours = getWeekDayHours();
                    const defaultTo = getDefaultTo();
                    const defaultBreak = getDefaultBreak();
                    const defaultFrom = getDefaultFrom();

                    // Day names for tooltip
                    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                    const dayName = dayNames[weekdayIndex];

                    if (mapping.fieldName === 'startTimeStr') {
                        // From: fixed value per day
                        const fromHours = defaultFrom[weekdayIndex];
                        tooltipText = `Click to set start time to ${minutesToTime(fromHours * 60)} (${dayName})`;
                    } else if (mapping.fieldName === 'endTimeStr') {
                        // To: calculated from From + work hours + break
                        const workHours = weekDayHours[weekdayIndex];
                        const breakHours = defaultBreak[weekdayIndex];
                        tooltipText = `Click to set end time to From + ${workHours}h work + ${breakHours}h break (${dayName})`;
                    } else if (mapping.fieldName === 'breaksStr') {
                        // Break: fixed value per day
                        const breakHours = defaultBreak[weekdayIndex];
                        tooltipText = `Click to set break time to ${minutesToTime(breakHours * 60)} (${dayName})`;
                    }
                }
            } catch (e) {
                // Config not ready yet, use default tooltip
                console.log('Config not ready for tooltip generation:', e.message);
            }

            label.title = tooltipText;

            label.addEventListener('click', function() {
                setDefaultTimeValue(mapping.fieldName);
            });

            console.log(`Made label clickable for: ${mapping.fieldName}`);
        });
    }

    // add "Add time left to assign" link next to hours input fields
    // This adds a link that allows adding Bilbo's "Time left to assign" value to the current project hours
    function addTimeLeftToAssignLinks() {
        document.querySelectorAll('input[name="hour"]').forEach(hoursInput => {
            // Check if link already exists
            if (hoursInput.dataset.timeLeftToAssignLinkAdded) {
                return;
            }

            // Mark as processed
            hoursInput.dataset.timeLeftToAssignLinkAdded = 'true';

            // Create the link with extra spacing
            const link = document.createElement('a');
            link.href = '/#';
            link.style.marginLeft = '0.5em';
            link.style.fontStyle = 'italic';
            link.textContent = '+"Time left to assign"';
            link.title = 'Add the "Time left to assign" value to this field, distributing all remaining work time to projects';

            link.addEventListener('click', function(e) {
                e.preventDefault();
                addTimeLeftToAssign(hoursInput);
                return false;
            });

            // Insert the link after the hours input field (and after adjustment links if they exist)
            hoursInput.parentElement.appendChild(link);
        });
    }

    // add "General:OpenProject" to the records table if not already present
    function addGeneralOpenProject() {
        const projectName = "General:OpenProject";

        // Check if project is already added in the table (look for the project in expanded form)
        const boldElements = document.querySelectorAll('table#recordsTable td b');
        let existingProjectElement = null;

        for (const bold of boldElements) {
            if (bold.textContent.trim().includes(projectName)) {
                existingProjectElement = bold;
                break;
            }
        }

        // If project already exists with at least one sub-record (input fields for hours), we're done
        if (existingProjectElement) {
            const projectRow = existingProjectElement.closest('tr');
            const subTable = projectRow.querySelector('table[id^="table"]');
            const hasSubRecords = subTable && subTable.querySelectorAll('input[name="hour"]').length > 0;

            if (hasSubRecords) {
                console.log(`${projectName} already has at least one sub-record, nothing to do.`);
                return;
            }
        }

        // Check if project is suggested below the dropdown (as a collapsed entry)
        for (const bold of boldElements) {
            if (bold.textContent.trim().includes(projectName)) {
                const parent = bold.parentElement;
                const addLinks = parent.querySelectorAll('a[href="/#"]');

                for (const link of addLinks) {
                    if (link.textContent.includes('Add')) {
                        console.log(`${projectName} found as suggestion, clicking Add link...`);
                        link.click();
                        return;
                    }
                }
            }
        }

        // Project not suggested, need to select from dropdown and add
        const projectSelect = document.getElementById('projectsSelectId');
        if (projectSelect) {
            const options = projectSelect.querySelectorAll('option');
            let projectOption = null;

            for (const option of options) {
                if (option.textContent.trim() === projectName) {
                    projectOption = option;
                    break;
                }
            }

            if (projectOption) {
                console.log(`${projectName} found in dropdown, selecting and adding...`);
                projectSelect.value = projectOption.value;

                // Find and click the Add link next to the dropdown
                const parentTd = projectSelect.closest('td');
                const addLinks = parentTd.querySelectorAll('a[href="/#"]');

                let addLinkFound = false;
                for (const link of addLinks) {
                    if (link.textContent.includes('Add')) {
                        link.click();
                        addLinkFound = true;
                        break;
                    }
                }

                if (!addLinkFound) {
                    console.error('Add link not found next to dropdown');
                }
            } else {
                console.error(`${projectName} not found in dropdown`);
            }
        } else {
            console.error('Project select dropdown not found');
        }
    }

    // Add settings button to header (on all pages)
    function addSettingsButton() {
        // Find the BILBO title link in the header
        waitForElements('a.applicationTitle', (bilboLink) => {
            // Check if button already exists
            if (document.getElementById('bilboSettingsBtn')) return;

            // Create settings button
            const settingsBtn = document.createElement('a');
            settingsBtn.id = 'bilboSettingsBtn';
            settingsBtn.href = '#';
            settingsBtn.className = 'applicationTitle';
            settingsBtn.textContent = '⚙️';
            settingsBtn.title = 'Configure Bilbo Tweaks';
            settingsBtn.style.marginRight = '15px';
            settingsBtn.style.fontSize = '20px';
            settingsBtn.style.textDecoration = 'none';
            settingsBtn.onclick = (e) => {
                e.preventDefault();
                GM_config.open();
            };

            // Insert before BILBO link
            bilboLink.parentElement.insertBefore(settingsBtn, bilboLink);
        }, { once: true });
    }

    // Add settings button on all pages
    addSettingsButton();


    // apply page specific tweaks
    if (/bilbo\/showMyProjects.do(\?.*)?$/.test(window.location.pathname)) { // project list
        // change default "max items per page" value from 20 to 100
        waitForElements("div#controls select", (selectElement) => {
            selectOption(selectElement, '100');
        });
    } else if (/bilbo\/(showActivityTable|saveActivity).do(\?.*)?$/.test(window.location.pathname)) { // week overview, might be saveAction.do after returning from day details
        // Check for weekly activity table span with text
        waitForElements('span', (span) => {
            if (span.textContent.includes('Weekly Activity Table')) {
                // Make sure total time cell is not empty before calling showTimes
                waitForElements(TOTAL_WEEK_TIME_SELECTOR, (cell) => {
                    if (cell.textContent.trim() !== '') {
                        showTimes();
                        // Show overtime summary after times are displayed
                        setTimeout(() => showOvertimeSummary(), 100);
                    }
                });
            }
        });
    } else if (/bilbo\/reportActivity.do(\?.*)?$/.test(window.location.pathname)) { // report activity
        // change default type from "Work" to "Work From Home"
        waitForElements("table#activityTable select[name='type']", (selectElement) => {
            // Check if option with value 'W' exists
            const hasWorkOption = selectElement.querySelector('option[value="W"]');
            if (hasWorkOption) {
                selectOptionAsync(selectElement, 'WHO');
            }
        }, { once: true });

        // automatically add "General:OpenProject" to the records table
        waitForElements("table#recordsTable", () => {
            addGeneralOpenProject();
        }, { once: true });

        // make from/to/break labels clickable
        waitForElements('input[name="startTimeStr"]', () => {
            makeLabelsClickable();
        });

        // add increment/decrement links to time fields
        waitForElements('input[name="startTimeStr"], input[name="endTimeStr"], input[name="breaksStr"]', () => {
            addTimeAdjustmentLinks();
        });

        // continuously monitor for hours input fields and add adjustment links + "Time left to assign" links
        waitForElements('input[name="hour"]', () => {
            addTimeAdjustmentLinks();
            addTimeLeftToAssignLinks();
        });
    }

    // Global keyboard shortcuts
    // Alt+F12 to open config dialog
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.keyCode === 123) { // Alt + F12
            e.preventDefault();
            GM_config.open();
        }
        // ESC to close config dialog
        if (e.keyCode === 27) { // ESC
            const configFrame = document.getElementById(GM_CONFIG_ID);
            if (configFrame) {
                GM_config.close();
            }
        }
    });

    // Edit weekly correction dialog
    function editWeeklyCorrection() {
        const currentWeek = getCurrentWeekAndYear();
        if (!currentWeek) {
            alert('Could not determine current week');
            return;
        }

        const corrections = loadWeeklyCorrections();
        const existing = corrections[currentWeek.weekString] || { minutes: 0, reason: '' };

        const currentCorrectionStr = minutesToOvertimeString(existing.minutes, false);
        const overtime = calculateTotalOvertime();

        // Calculate the uncorrected value (base value without any corrections)
        const uncorrectedMinutes = overtime.currentWeekDelta - getWeeklyCorrectionMinutes(currentWeek.weekString);
        const calculatedStr = minutesToOvertimeString(uncorrectedMinutes, false);

        // Calculate what the final value would be with current correction
        const currentFinalStr = minutesToOvertimeString(overtime.currentWeekDelta, false);

        const input = prompt(
            `⏱️ Adjust Week ${currentWeek.weekString}\n\n` +
            `Calculated overtime: ${calculatedStr}\n` +
            `Current correction: ${currentCorrectionStr}\n` +
            `Current final value: ${currentFinalStr}\n\n` +
            `Enter correction to ADD to calculated value (format +/-HH:MM, or "0" to remove):\n` +
            `Example: +03:12 (add time for holiday work), -04:00 (subtract wrongly counted time)\n` +
            `The correction will be ADDED to the calculated value of ${calculatedStr}\n\n` +
            `Leave empty to cancel.`,
            currentCorrectionStr
        );

        if (input === null) return; // Cancelled

        // Parse input
        let minutes = 0;
        if (input.trim() !== '0' && input.trim() !== '') {
            minutes = overtimeStringToMinutes(input.trim());
            if (isNaN(minutes)) {
                alert('❌ Invalid format. Use +/-HH:MM (e.g., +02:30 or -01:15)');
                return;
            }
        }

        // Ask for reason (optional but recommended)
        let reason = '';
        if (minutes !== 0) {
            reason = prompt(
                `📝 Add a note (optional but recommended):\n\n` +
                `Example: "Worked 8h on Christmas holiday (WHO/H)"`,
                existing.reason
            );
            if (reason === null) return; // Cancelled
        }

        // Save or delete
        if (minutes === 0) {
            delete corrections[currentWeek.weekString];
        } else {
            corrections[currentWeek.weekString] = {
                minutes: minutes,
                reason: reason.trim(),
                timestamp: new Date().toISOString()
            };
        }

        if (saveWeeklyCorrections(corrections)) {
            alert(`✅ Correction ${minutes === 0 ? 'removed' : 'saved'} for week ${currentWeek.weekString}`);
            showOvertimeSummary(); // Refresh display
        } else {
            alert('❌ Failed to save correction');
        }
    }
})();
