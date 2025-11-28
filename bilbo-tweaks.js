// ==UserScript==
// @namespace   https://cbaoth.de
// @author      Andreas Weyer
// @copyright   2021-2024, userscript@cbaoth.de
//
// @name        Bilbo Tweaks
// @version     0.5
// @description Some improvments to bilbo time tracking
// @downloadURL https://github.com/cbaoth/userscripts/raw/master/bilbo-tweaks.user.js
//
// @include     /^https?://bilbo.[begrsu]{9}.de/
//
// @grant       GM_addStyle
//
// @require     http://code.jquery.com/jquery-latest.min.js
// @require     https://gist.github.com/raw/2625891/waitForKeyElements.js
// @require     https://raw.githubusercontent.com/jashkenas/underscore/master/underscore.js
// @require     https://github.com/cbaoth/userscripts/raw/master/lib/cblib.js
// ==/UserScript==

this.$ = this.jQuery = jQuery.noConflict(true);

(function () {

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
        return $(`table.activityTable tbody > tr:nth-child(1) > td`).index($(`table.activityTable tbody > tr:nth-child(1) > td span.Today`).parents(`td`));
    }

    // get required weekly work time in minutes (int)
    function getRequiredMinutes(upUntilNow = false) {
        let result = 0;

        let index = upUntilNow ? getColumnNumberToday() : -1;
        let n = index < 1 || index > 5 ? 4 : index - 1;
        for (let i = 0; i <= n; i++) { // mo-today or mo-fr if today not within current week mo-fr
            let types = $(`table.activityTable tbody tr:nth-child(2) td:nth-child(` + (i + 2) + `)`).text().split('/');
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
        return Math.trunc(minutes / 60) + ':' + String(Math.abs(minutes) % 60).padStart(2, '0');
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
        let actualMinutes = timeToMinutes($(TOTAL_WEEK_TIME_SELECTOR).text());

        let requiredMinutes = getRequiredMinutes();
        let requiredTime = minutesToTime(requiredMinutes);
        let requiredMinutesUpUntilNow = getRequiredMinutes(true);
        let requiredTimeUpUntilNow = minutesToTime(requiredMinutesUpUntilNow);

        let timeTotalCell = $(`table.activityTable tbody tr:nth-child(2) td:nth-child(9)`);
        let timeUpUntilNowCell = $(`table.activityTable tbody tr:nth-child(7) td:nth-child(9)`);

        let minutesDelta = actualMinutes - requiredMinutes;
        let minutesDeltaUpUntilNow = actualMinutes - requiredMinutesUpUntilNow;

        // Display total work time required this week
        timeTotalCell.html(colorizeTimeDelta(minutesDelta) + ' (' + requiredTime + ')');
        timeTotalCell.css('text-align', 'center');
        timeTotalCell.attr('title', 'Delta actual vs. required time for the whole week (required time this week in total)');

        // Display work time required up until current day
        timeUpUntilNowCell.html(colorizeTimeDelta (minutesDeltaUpUntilNow) + ' (' + requiredTimeUpUntilNow + ')');
        timeUpUntilNowCell.css('text-align', 'center');
        timeUpUntilNowCell.attr('title', ' Delta actual vs. required time up until today (required time up until today)');
    }


    // https://stackoverflow.com/a/41421759/7393995
    function selectOptionAsync(e, value) {
        e[0].dispatchEvent(new Event("click"));
        e.val(value);
        e[0].dispatchEvent(new Event("change"));
    }

    // add "General:OpenProject" to the records table if not already present
    function addGeneralOpenProject() {
        const projectName = "General:OpenProject";

        // Check if project is already added in the table (look for the project in expanded form)
        const existingProject = $(`table#recordsTable td b:contains('${projectName}')`).filter(function() {
            return $(this).text().trim().includes(projectName);
        });

        // If project already exists with at least one sub-record (input fields for hours), we're done
        if (existingProject.length > 0) {
            const projectRow = existingProject.closest('tr');
            const subTable = projectRow.find('table[id^="table"]');
            const hasSubRecords = subTable.find('input[name="hour"]').length > 0;

            if (hasSubRecords) {
                console.log(`${projectName} already has at least one sub-record, nothing to do.`);
                return;
            }
        }

        // Check if project is suggested below the dropdown (as a collapsed entry)
        const suggestedLink = $(`table#recordsTable td b:contains('${projectName}')`).parent().find('a[href="/#"]:contains("Add")');
        if (suggestedLink.length > 0) {
            console.log(`${projectName} found as suggestion, clicking Add link...`);
            suggestedLink[0].click();
            return;
        }

        // Project not suggested, need to select from dropdown and add
        const projectSelect = $('select#projectsSelectId');
        if (projectSelect.length > 0) {
            const projectOption = projectSelect.find(`option:contains('${projectName}')`).filter(function() {
                return $(this).text().trim() === projectName;
            });

            if (projectOption.length > 0) {
                console.log(`${projectName} found in dropdown, selecting and adding...`);
                projectSelect.val(projectOption.val());

                // Find and click the Add link next to the dropdown
                const addLink = projectSelect.closest('td').find('a[href="/#"]:contains("Add")');
                if (addLink.length > 0) {
                    addLink[0].click();
                } else {
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
        waitForKeyElements("div#controls select", (e) => selectOption(e, 100));
        //sorter.size(100); // actually change the size
        //scrollToTop(); // scroll to top (since size change scrolls down)
    } else if (/bilbo\/(showActivityTable|saveActivity).do(\?.*)?$/.test(window.location.pathname)) { // week overview, might be saveAction.do after returning from day details
        waitForKeyElements(`span:contains('Weekly Activity Table')`, () => { // make sure we see the table (saveActivity.do might be a different screen)
            waitForKeyElements(TOTAL_WEEK_TIME_SELECTOR+':not(:empty)', (e) => showTimes()); // make sure total time is there
        });
    } else if (/bilbo\/reportActivity.do(\?.*)?$/.test(window.location.pathname)) { // report activity
        // change default type from "Work" to "Work From Home"
        waitForKeyElements("table#activityTable select[name='type']:has(option[value='W'])", (e) => selectOptionAsync(e, 'WHO'));

        // automatically add "General:OpenProject" to the records table
        waitForKeyElements("table#recordsTable", () => {
            addGeneralOpenProject();
        });
    }
})();
