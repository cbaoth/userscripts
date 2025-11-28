// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021-2024, userscript@cbaoth.de
//
// @name        Bilbo Tweaks
// @version     0.7
// @description Some improvments to bilbo time tracking
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/bilbo-tweaks.user.js
//
// @include     /^https?://bilbo.[begrsu]{9}.de/
//
// @grant       GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // Add custom styles
    GM_addStyle(`
        table#activityTable {
            width: 350px !important;
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

    // daily (required) working hours per day (Mo-Fr)
    //const WEEK_DAY_HOURS = [8,8,8,8,8]; // full-time, 40h per week
    //const WEEK_DAY_HOURS = [8,8,4,8,8]; // 90% part-time, 36h per week (Wed 4h)
    const WEEK_DAY_HOURS = [8,8,4,4,8]; // 80% part-time, 36h per week (Wed & Thu 4h)

    // default work time settings per day (Mo-Fr)
    const DEFAULT_FROM = 9; // always 09:00
    const DEFAULT_TO = [18, 18, 14, 14, 18]; // Mo-Fr, Wed & Thu end at 14:00
    const DEFAULT_BREAK = [1, 1, 0, 0, 1]; // Mo-Fr, no break on Wed & Thu (4h work days)

    // get required daily working time based on day-activity type
    function getRequiredMinutesByType(type, hours, isSub) {
        switch (type) {
            case 'P': // public holiday
            case 'E': // education
            case 'S': // sick leave
            case 'H': // holiday
            case 'SPL': // special leave
                return 0; // no time required
            default: // regular work time
                return hours * 60 * (isSub ? 0.5 : 1);
        }
    }

    // get column index of "today", if any (otherwise -1), note that first column are headers, so index for mo-fr are 1-5
    function getColumnNumberToday() {
        const todaySpan = document.querySelector('table.activityTable tbody > tr:nth-child(1) > td span.Today');
        if (!todaySpan) return -1;

        const todayTd = todaySpan.closest('td');
        const allTds = Array.from(document.querySelectorAll('table.activityTable tbody > tr:nth-child(1) > td'));
        return allTds.indexOf(todayTd);
    }

    // get required weekly work time in minutes (int)
    function getRequiredMinutes(upUntilNow = false) {
        let result = 0;

        let index = upUntilNow ? getColumnNumberToday() : -1;
        let n = index < 1 || index > 5 ? 4 : index - 1;
        for (let i = 0; i <= n; i++) { // mo-today or mo-fr if today not within current week mo-fr
            const cell = document.querySelector(`table.activityTable tbody tr:nth-child(2) td:nth-child(${i + 2})`);
            if (!cell) continue;

            let types = cell.textContent.split('/');
            let hasSubType = types.length > 1;
            result += getRequiredMinutesByType(types[0], WEEK_DAY_HOURS[i], hasSubType);
            if (hasSubType) {
                result += getRequiredMinutesByType(types[1], WEEK_DAY_HOURS[i], true);
            }
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

        let actualMinutes = timeToMinutes(totalWeekCell.textContent);

        let requiredMinutes = getRequiredMinutes();
        let requiredTime = minutesToTime(requiredMinutes);
        let requiredMinutesUpUntilNow = getRequiredMinutes(true);
        let requiredTimeUpUntilNow = minutesToTime(requiredMinutesUpUntilNow);

        let timeTotalCell = document.querySelector(`table.activityTable tbody tr:nth-child(2) td:nth-child(9)`);
        let timeUpUntilNowCell = document.querySelector(`table.activityTable tbody tr:nth-child(7) td:nth-child(9)`);

        let minutesDelta = actualMinutes - requiredMinutes;
        let minutesDeltaUpUntilNow = actualMinutes - requiredMinutesUpUntilNow;

        // Display total work time required this week
        if (timeTotalCell) {
            timeTotalCell.innerHTML = colorizeTimeDelta(minutesDelta) + ' (' + requiredTime + ')';
            timeTotalCell.style.textAlign = 'center';
            timeTotalCell.title = 'Delta actual vs. required time for the whole week (required time this week in total)';
        }

        // Display work time required up until current day
        if (timeUpUntilNowCell) {
            timeUpUntilNowCell.innerHTML = colorizeTimeDelta(minutesDeltaUpUntilNow) + ' (' + requiredTimeUpUntilNow + ')';
            timeUpUntilNowCell.style.textAlign = 'center';
            timeUpUntilNowCell.title = 'Delta actual vs. required time up until today (required time up until today)';
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

    // add remaining time from "Time left to assign" to the hours input field
    function addRemainingTime(hoursInput) {
        const timeCounterSpan = document.getElementById('timeCounter');
        if (!timeCounterSpan) {
            console.error('Time counter not found');
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

        console.log(`Updated hours: ${currentTimeStr} + ${remainingTimeStr} = ${newTimeStr}`);
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

        let value;
        let actualFieldName;

        if (fieldName === 'from' || fieldName === 'startTimeStr') {
            actualFieldName = 'startTimeStr';
            value = minutesToTime(DEFAULT_FROM * 60);
        } else if (fieldName === 'to' || fieldName === 'endTimeStr') {
            actualFieldName = 'endTimeStr';
            const fromField = document.querySelector('input[name="startTimeStr"]');
            const fromMinutes = fromField ? parseTimeToMinutes(fromField.value.trim()) : 0;

            if (fromMinutes > 0) {
                // Calculate to = from + work hours + break
                value = minutesToTime(fromMinutes + WEEK_DAY_HOURS[weekdayIndex] * 60 + DEFAULT_BREAK[weekdayIndex] * 60);
            } else {
                // Use default to time
                value = minutesToTime(DEFAULT_TO[weekdayIndex] * 60);
            }
        } else if (fieldName === 'break' || fieldName === 'breaksStr') {
            actualFieldName = 'breaksStr';
            value = minutesToTime(DEFAULT_BREAK[weekdayIndex] * 60);
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

            label.title = 'Click to set default value';

            label.addEventListener('click', function() {
                setDefaultTimeValue(mapping.fieldName);
            });

            console.log(`Made label clickable for: ${mapping.fieldName}`);
        });
    }

    // add "Add remaining time" link next to hours input fields
    function addRemainingTimeLinks() {
        document.querySelectorAll('input[name="hour"]').forEach(hoursInput => {
            // Check if link already exists
            if (hoursInput.dataset.remainingTimeLinkAdded) {
                return;
            }

            // Mark as processed
            hoursInput.dataset.remainingTimeLinkAdded = 'true';

            // Create the link with extra spacing
            const link = document.createElement('a');
            link.href = '/#';
            link.style.marginLeft = '20px';
            link.textContent = 'Add remaining time';

            link.addEventListener('click', function(e) {
                e.preventDefault();
                addRemainingTime(hoursInput);
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

        // continuously monitor for hours input fields and add adjustment links + "Add remaining time" links
        waitForElements('input[name="hour"]', () => {
            addTimeAdjustmentLinks();
            addRemainingTimeLinks();
        });
    }
})();
