const DAYS_OF_WEEK = [
        { key: 'M', label: 'Monday' },
        { key: 'T', label: 'Tuesday' },
        { key: 'W', label: 'Wednesday' },
        { key: 'R', label: 'Thursday' },
        { key: 'F', label: 'Friday' },
        { key: 'S', label: 'Saturday' },
        { key: 'U', label: 'Sunday' }
    ];
    const START_HOUR = 7;
    const END_HOUR = 23;
    const HOUR_ROW_HEIGHT = 58;
    const SCHEDULE_COOKIE_NAME = 'crimson_scheduler_schedule';
    const SCHEDULE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
    const TIME_FORMAT_STORAGE_KEY = 'crimson_scheduler_24_hour_time';
    const HIDE_WEEKENDS_STORAGE_KEY = 'crimson_scheduler_hide_weekends';
    const SHOW_INSTRUCTORS_STORAGE_KEY = 'crimson_scheduler_show_instructors'
    const REQUIRED_COURSE_FIELDS = ['section_id', 'course_code', 'days', 'time'];
    const DAY_TOKEN_MAP = [
        [/MONDAY|MON|MO/g, 'M'],
        [/TUESDAY|TUES|TUE|TU/g, 'T'],
        [/WEDNESDAY|WED|WE/g, 'W'],
        [/THURSDAY|THURS|THU|TH/g, 'R'],
        [/FRIDAY|FRI|FR/g, 'F'],
        [/SATURDAY|SAT|SA/g, 'S'],
        [/SUNDAY|SUN|SU/g, 'U']
    ];

    let currentSchedule = [];
    let renderedBlocksByDay = {};

    function initializeSchedulePage() {
        initializeScheduleOptions();
        buildCalendarHeader();
        initializeCalendar();
        setupInteractionHandlers();
        currentSchedule = loadScheduleFromCookie();
        updateScheduleDisplay(currentSchedule);
        updateSearchResultTimeDisplays();
    }

    function setupInteractionHandlers() {
        document.addEventListener('click', function(event) {
            const addButton = event.target.closest('.add-course-selection-btn');
            if (addButton) {
                handleAddCourseSelection(addButton, event);
                return;
            }

            if (event.target.closest('#clearScheduleBtn')) {
                event.preventDefault();
                currentSchedule = [];
                persistScheduleToCookie(currentSchedule);
                updateScheduleDisplay(currentSchedule);
                return;
            }

            const removeMiscButton = event.target.closest('.remove-misc-btn');
            if (removeMiscButton) {
                removeFromSchedule(removeMiscButton.getAttribute('data-section-id'));
                return;
            }

            if (event.target.closest('#exportScheduleBtn')) {
                exportSchedule();
            }
        });

        document.addEventListener('change', function(event) {
            const sectionChoice = event.target.closest('.section-choice');
            if (sectionChoice) {
                updateCourseAddButton(sectionChoice.getAttribute('data-course-id'));
                return;
            }

            if (event.target.closest('#timeFormatToggle')) {
                saveScheduleOptions();
                updateScheduleDisplay(currentSchedule);
                updateSearchResultTimeDisplays();
                return;
            }

            if (event.target.closest('#hideWeekendsToggle')) {
                saveScheduleOptions();
                updateScheduleDisplay(currentSchedule);
            }

            if (event.target.closest('#showInstructorToggle')) {
                saveScheduleOptions();
                updateScheduleDisplay(currentSchedule);
            }
        });

        document.addEventListener('mouseover', function(event) {
            const row = event.target.closest('.section-choice-row');
            if (!row || row.contains(event.relatedTarget)) return;
            showSectionGhost(row);
        });

        document.addEventListener('mouseout', function(event) {
            const row = event.target.closest('.section-choice-row');
            if (!row || row.contains(event.relatedTarget)) return;
            clearSectionGhosts();
        });

        document.addEventListener('focusin', function(event) {
            const row = event.target.closest('.section-choice-row');
            if (row) showSectionGhost(row);
        });

        document.addEventListener('focusout', function(event) {
            const row = event.target.closest('.section-choice-row');
            if (!row || row.contains(event.relatedTarget)) return;
            clearSectionGhosts();
        });

        document.body.addEventListener('htmx:afterSwap', function(event) {
            if (event.target && event.target.id === 'searchResults') {
                clearSectionGhosts();
                updateSearchResultTimeDisplays();
            }
        });

        document.getElementById('resetFiltersBtn').addEventListener('click', function() {
            window.setTimeout(() => {
                document.getElementById('searchResults').innerHTML = '<div class="empty-search">Choose a campus + term, then search courses to begin building your schedule.</div>';
            }, 0);
        });
    }

    function findSelectedCourseChoice(courseId, choiceType) {
        return document.querySelector(`.section-choice[data-course-id="${courseId}"][data-choice-type="${choiceType}"]:checked`);
    }

    function updateCourseAddButton(courseId) {
        const addButton = document.querySelector(`.add-course-selection-btn[data-course-id="${courseId}"]`);
        if (!addButton) return;
        const requiresLab = addButton.getAttribute('data-requires-lab') === 'true';
        const hasLecture = !!findSelectedCourseChoice(courseId, 'lecture');
        const hasLab = !!findSelectedCourseChoice(courseId, 'lab');
        addButton.disabled = !(hasLecture && (!requiresLab || hasLab));
    }

    function buildCourseDataFromChoice(choice, scheduleGroupId) {
        return {
            section_id: choice.getAttribute('data-section-id'),
            schedule_group_id: scheduleGroupId,
            course_code: choice.getAttribute('data-course-code'),
            course_name: choice.getAttribute('data-course-name'),
            section_num: choice.getAttribute('data-section-num'),
            instructor: choice.getAttribute('data-instructor'),
            location: choice.getAttribute('data-location'),
            days: choice.getAttribute('data-days'),
            time: choice.getAttribute('data-time'),
            seats: choice.getAttribute('data-seats'),
            credits: choice.getAttribute('data-credits') || '0',
            is_lab: choice.getAttribute('data-is-lab') === 'true',
            component: choice.getAttribute('data-component') || 'lecture'
        };
    }

    function showSectionGhost(row) {
        const choice = row.querySelector('.section-choice');
        if (!choice) return;
        clearSectionGhosts();
        renderSectionGhost(buildCourseDataFromChoice(choice, 'preview'));
    }

    function clearSectionGhosts() {
        document.querySelectorAll('.course-block.ghost').forEach(block => block.remove());
    }

    function uses24HourTime() {
        const toggle = document.getElementById('timeFormatToggle');
        return !!toggle && toggle.checked;
    }

    function hidesWeekends() {
        const toggle = document.getElementById('hideWeekendsToggle');
        return !!toggle && toggle.checked;
    }

    function showInstructors() {
        const toggle = document.getElementById('showInstructorToggle');
        return !!toggle && toggle.checked;
    }

    function getVisibleDays() {
        return hidesWeekends()
            ? DAYS_OF_WEEK.filter(day => day.key !== 'S' && day.key !== 'U')
            : DAYS_OF_WEEK;
    }

    function getCalendarColumnTemplate() {
        return `82px repeat(${getVisibleDays().length}, minmax(96px, 1fr))`;
    }

    function initializeScheduleOptions() {
        const timeToggle = document.getElementById('timeFormatToggle');
        if (timeToggle) timeToggle.checked = localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === 'true';

        const weekendToggle = document.getElementById('hideWeekendsToggle');
        if (weekendToggle) weekendToggle.checked = localStorage.getItem(HIDE_WEEKENDS_STORAGE_KEY) === 'true';

        const instructorToggle = document.getElementById('showInstructorToggle');
        if (instructorToggle) instructorToggle.checked = localStorage.getItem(SHOW_INSTRUCTORS_STORAGE_KEY) === 'true';
    }

    function saveScheduleOptions() {
        localStorage.setItem(TIME_FORMAT_STORAGE_KEY, String(uses24HourTime()));
        localStorage.setItem(HIDE_WEEKENDS_STORAGE_KEY, String(hidesWeekends()));
        localStorage.setItem(SHOW_INSTRUCTORS_STORAGE_KEY, String(showInstructors()));
    }

    function formatTimeTokenForDisplay(token) {
        const normalized = (token || '').trim();
        const minutes = timeToMinutes(normalized);
        if (minutes === null) return normalized;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (uses24HourTime()) return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        return formatMinutesAs12Hour(minutes);
    }

    function formatMinutesAs12Hour(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHour = hours % 12 || 12;
        return `${displayHour}:${String(mins).padStart(2, '0')} ${period}`;
    }

    function formatTimeRangeForDisplay(timeRange) {
        const normalized = (timeRange || '').trim();
        if (!normalized || normalized === 'ARR' || normalized === 'N/A') return normalized;
        const parts = normalized.split(/\s*-\s*/);
        if (parts.length !== 2) return formatTimeTokenForDisplay(normalized);
        return `${formatTimeTokenForDisplay(parts[0])} - ${formatTimeTokenForDisplay(parts[1])}`;
    }

    function formatMeetingListForDisplay(timeValue) {
        return (timeValue || '')
            .split(';')
            .map(timeRange => formatTimeRangeForDisplay(timeRange))
            .join(';');
    }

    function updateSearchResultTimeDisplays() {
        document.querySelectorAll('.time-display[data-time]').forEach(element => {
            element.textContent = formatMeetingListForDisplay(element.getAttribute('data-time'));
        });
    }

    function handleAddCourseSelection(button, event) {
        event.preventDefault();
        const courseId = button.getAttribute('data-course-id');
        const requiresLab = button.getAttribute('data-requires-lab') === 'true';
        const lectureChoice = findSelectedCourseChoice(courseId, 'lecture');
        const labChoice = findSelectedCourseChoice(courseId, 'lab');
        if (!lectureChoice || (requiresLab && !labChoice)) return;

        const choices = [lectureChoice, labChoice].filter(Boolean);
        const scheduleGroupId = choices.map(choice => choice.getAttribute('data-section-id')).join('-');
        const selectedCourses = choices
            .map(choice => buildCourseDataFromChoice(choice, scheduleGroupId))
            .filter(courseData => !currentSchedule.some(entry => String(entry.section_id) === String(courseData.section_id)));

        if (!selectedCourses.length) return;
        currentSchedule.push(...selectedCourses);
        persistScheduleToCookie(currentSchedule);
        updateScheduleDisplay(currentSchedule);
    }

    function buildCalendarHeader() {
        const header = document.getElementById('calendarHeader');
        header.style.gridTemplateColumns = getCalendarColumnTemplate();
        header.innerHTML = '<div class="calendar-header-time">Time</div>';
        getVisibleDays().forEach((day) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-header-day';
            dayEl.textContent = day.label;
            header.appendChild(dayEl);
        });
    }

    function initializeCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.innerHTML = '';
        calendarGrid.style.gridTemplateColumns = getCalendarColumnTemplate();
        calendarGrid.style.gridTemplateRows = `repeat(${END_HOUR - START_HOUR}, ${HOUR_ROW_HEIGHT}px)`;
        for (let hour = START_HOUR; hour < END_HOUR; hour++) {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'calendar-time-slot';
            timeSlot.textContent = uses24HourTime()
                ? `${String(hour).padStart(2, '0')}:00`
                : formatHourLabel(hour);
            calendarGrid.appendChild(timeSlot);
            getVisibleDays().forEach((day) => {
                const dayIndex = DAYS_OF_WEEK.findIndex(dayOfWeek => dayOfWeek.key === day.key);
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                cell.id = `cell-${dayIndex}-${hour}`;
                calendarGrid.appendChild(cell);
            });
        }
    }

    function formatHourLabel(hour) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        return `${displayHour}:00 ${ampm}`;
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return null;
        const normalized = timeStr.trim();
        const match12hr = normalized.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
        if (match12hr) {
            let hours = parseInt(match12hr[1], 10);
            const minutes = match12hr[2] ? parseInt(match12hr[2], 10) : 0;
            const period = match12hr[3].toUpperCase();
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            return hours * 60 + minutes;
        }

        const match24hr = normalized.match(/(\d+)[.:](\d+)/);
        if (match24hr) return (parseInt(match24hr[1], 10) * 60) + parseInt(match24hr[2], 10);

        const matchCompact = normalized.match(/^(\d{3,4})$/);
        if (matchCompact) {
            const padded = matchCompact[1].length === 3 ? `0${matchCompact[1]}` : matchCompact[1];
            return (parseInt(padded.slice(0, 2), 10) * 60) + parseInt(padded.slice(2, 4), 10);
        }

        const matchBareHour = normalized.match(/^(\d{1,2})$/);
        if (matchBareHour) return parseInt(matchBareHour[1], 10) * 60;
        return null;
    }

    function parseTimeRange(timeStr) {
        if (!timeStr || timeStr === 'N/A') return null;
        const normalizedStr = timeStr.replace(/[\u2013\u2014]/g, '-').replace(/\bto\b/gi, '-');
        let parts = normalizedStr.split(/\s*-\s*/);
        if (parts.length !== 2) {
            const matchedTimes = normalizedStr.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\b\d{3,4}\b/gi);
            if (!matchedTimes || matchedTimes.length < 2) return null;
            parts = [matchedTimes[0], matchedTimes[1]];
        }

        let startPart = parts[0].trim();
        let endPart = parts[1].trim();
        const startHasMeridiem = /(AM|PM)/i.test(startPart);
        const endHasMeridiem = /(AM|PM)/i.test(endPart);
        if (!startHasMeridiem && endHasMeridiem) startPart = `${startPart} ${(endPart.match(/(AM|PM)/i) || [''])[0]}`;
        if (startHasMeridiem && !endHasMeridiem) endPart = `${endPart} ${(startPart.match(/(AM|PM)/i) || [''])[0]}`;

        const start = timeToMinutes(startPart);
        const end = timeToMinutes(endPart);
        if (start === null || end === null || end <= start) return null;
        return { start, end };
    }

    function parseDaysToIndexes(daysStr) {
        if (!daysStr) return [];
        const upper = daysStr.toUpperCase().trim();
        if (!upper || upper === 'N/A' || upper.includes('TBA') || upper.includes('ARR')) return [];
        let normalized = upper.replace(/\s/g, '');
        DAY_TOKEN_MAP.forEach(([pattern, letter]) => {
            normalized = normalized.replace(pattern, letter);
        });
        normalized = normalized.replace(/[^MTWRFSU,/-]/g, '');
        const indexes = [];
        normalized.replace(/[,/-]/g, '').split('').forEach(dayChar => {
            const dayIndex = DAYS_OF_WEEK.findIndex(day => day.key === dayChar);
            if (dayIndex !== -1 && !indexes.includes(dayIndex)) indexes.push(dayIndex);
        });
        return indexes;
    }

    function tryParsePairedDayTimeLists(courseData) {
        const rawDayTokens = (courseData.days || '').split(',').map(s => s.trim()).filter(Boolean);
        const rawTimeTokens = (courseData.time || '').split(';').map(s => s.trim()).filter(Boolean);
        if (!(rawDayTokens.length > 1 && rawTimeTokens.length > 1 && rawDayTokens.length === rawTimeTokens.length)) return null;
        const pairs = [];
        for (let i = 0; i < rawDayTokens.length; i++) {
            const dayIndexes = parseDaysToIndexes(rawDayTokens[i]);
            const timeRange = parseTimeRange(rawTimeTokens[i]);
            if (!dayIndexes.length || !timeRange) return null;
            pairs.push({ dayIndexes, timeRange });
        }
        return pairs;
    }

    function resolveScheduleGroups(courseData) {
        const pairedGroups = tryParsePairedDayTimeLists(courseData);
        if (pairedGroups) return pairedGroups;

        let dayIndexes = parseDaysToIndexes(courseData.days);
        let timeRange = parseTimeRange(courseData.time);
        if (!dayIndexes.length || !timeRange) {
            const swappedDayIndexes = parseDaysToIndexes(courseData.time);
            const swappedTimeRange = parseTimeRange(courseData.days);
            if (swappedDayIndexes.length && swappedTimeRange) {
                dayIndexes = swappedDayIndexes;
                timeRange = swappedTimeRange;
            }
        }
        if (!dayIndexes.length || !timeRange) return [];
        return [{ dayIndexes, timeRange }];
    }

    function renderCourseBlock(dayIndex, timeRange, courseData, showInstruct) {
        const startHour = Math.floor(timeRange.start / 60);
        const startMinute = timeRange.start % 60;
        const durationHours = (timeRange.end - timeRange.start) / 60;
        const cell = document.getElementById(`cell-${dayIndex}-${startHour}`);
        if (!cell) return false;

        const block = document.createElement('div');
        block.className = 'course-block no-conflict';
        block.style.height = Math.max((durationHours * 100), 0) + '%';
        block.style.minHeight = '30px';
        block.style.top = (startMinute / 60 * 100) + '%';
        block.innerHTML = `
            <span class="course-block-line">${courseData.course_code} - ${courseData.section_num}</span>
            <span class="course-block-line">${formatMeetingListForDisplay(courseData.time)}</span>
            <span class="course-block-line">${courseData.location}</span>
            ${ showInstruct ? `<span class="course-block-line">${courseData.instructor}</span>` : ``}
        `;
        block.setAttribute('data-section-id', courseData.section_id);
        block.setAttribute('data-start-minutes', String(timeRange.start));
        block.setAttribute('data-end-minutes', String(timeRange.end));

        const tooltip = document.createElement('div');
        tooltip.className = 'course-block-tooltip';
        tooltip.innerHTML = buildCourseTooltip(courseData);
        block.appendChild(tooltip);
        block.addEventListener('click', function(e) {
            e.stopPropagation();
            removeFromSchedule(courseData.section_id);
        });
        cell.appendChild(block);

        if (!renderedBlocksByDay[dayIndex]) renderedBlocksByDay[dayIndex] = [];
        renderedBlocksByDay[dayIndex].push({ element: block, start: timeRange.start, end: timeRange.end, course: courseData });
        return true;
    }

    function renderSectionGhost(courseData) {
        resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) => {
            dayIndexes.forEach(dayIndex => renderGhostBlock(dayIndex, timeRange, courseData));
        });
    }

    function renderGhostBlock(dayIndex, timeRange, courseData) {
        const startHour = Math.floor(timeRange.start / 60);
        const startMinute = timeRange.start % 60;
        const durationHours = (timeRange.end - timeRange.start) / 60;
        const cell = document.getElementById(`cell-${dayIndex}-${startHour}`);
        if (!cell) return false;

        const block = document.createElement('div');
        block.className = 'course-block ghost';
        block.style.height = Math.max((durationHours * 100), 0) + '%';
        block.style.minHeight = '30px';
        block.style.top = (startMinute / 60 * 100) + '%';
        block.innerHTML = `
            <span class="course-block-line">${courseData.course_code} - ${courseData.section_num}</span>
            <span class="course-block-line">${formatMeetingListForDisplay(courseData.time)}</span>
            <span class="course-block-line">${courseData.location}</span>
        `;
        cell.appendChild(block);
        return true;
    }

    function getCourseLabel(courseData) {
        return `${courseData.course_code} - ${courseData.section_num} (${formatMeetingListForDisplay(courseData.time)})`;
    }

    function buildCourseTooltip(courseData) {
        return `
            <strong>${courseData.course_code} - ${courseData.section_num}</strong>
            <div>${courseData.course_name || ''}</div>
            <div>${courseData.days} ${formatMeetingListForDisplay(courseData.time)}</div>
            <div>${courseData.instructor || 'Instructor: N/A'}</div>
            <div>${courseData.location || 'Location: N/A'}</div>
            <div>Click to remove from schedule</div>
        `;
    }

    function buildConflictTooltip(courseData, conflicts) {
        const conflictRows = conflicts.map(conflict => `<div>${getCourseLabel(conflict)}</div>`).join('');
        return `
            <strong>Time Conflict</strong>
            <div>${getCourseLabel(courseData)}</div>
            <div>overlaps with</div>
            ${conflictRows}
            <div>Click to remove from schedule</div>
        `;
    }

    function addCourseToCalendar(courseData) {
        let renderedCount = 0;
        let showInstruct = showInstructors();
        resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) => {
            dayIndexes.forEach(dayIndex => {
                if (renderCourseBlock(dayIndex, timeRange, courseData, showInstruct)) renderedCount += 1;
            });
        });
        return renderedCount;
    }

    function applyOverlapHighlighting() {
        Object.keys(renderedBlocksByDay).forEach(dayKey => {
            const dayBlocks = renderedBlocksByDay[dayKey];
            if (!dayBlocks || dayBlocks.length < 2) return;
            const conflictsByElement = new Map();
            for (let i = 0; i < dayBlocks.length; i++) {
                for (let j = i + 1; j < dayBlocks.length; j++) {
                    if (Math.max(dayBlocks[i].start, dayBlocks[j].start) < Math.min(dayBlocks[i].end, dayBlocks[j].end)) {
                        dayBlocks[i].element.classList.add('conflict');
                        dayBlocks[j].element.classList.add('conflict');
                        if (!conflictsByElement.has(dayBlocks[i].element)) conflictsByElement.set(dayBlocks[i].element, []);
                        if (!conflictsByElement.has(dayBlocks[j].element)) conflictsByElement.set(dayBlocks[j].element, []);
                        conflictsByElement.get(dayBlocks[i].element).push(dayBlocks[j].course);
                        conflictsByElement.get(dayBlocks[j].element).push(dayBlocks[i].course);
                    }
                }
            }
            dayBlocks.forEach(dayBlock => {
                const conflicts = conflictsByElement.get(dayBlock.element);
                if (!conflicts || !conflicts.length) return;
                const tooltip = dayBlock.element.querySelector('.course-block-tooltip');
                if (tooltip) tooltip.innerHTML = buildConflictTooltip(dayBlock.course, conflicts);
            });
        });
    }

    function updateScheduleDisplay(scheduleData) {
        currentSchedule = scheduleData;
        clearSectionGhosts();
        renderedBlocksByDay = {};
        buildCalendarHeader();
        initializeCalendar();
        const miscItems = [];
        scheduleData.forEach(course => {
            if (addCourseToCalendar(course) === 0) miscItems.push(course);
        });
        applyOverlapHighlighting();
        updateCreditCount(scheduleData);
        renderMiscList(miscItems);
    }

    function updateCreditCount(scheduleData) {
        const total = scheduleData.reduce((sum, item) => {
            const credits = parseFloat(String(item.credits || '0').replace(/[^\d.]/g, ''));
            return sum + (Number.isFinite(credits) ? credits : 0);
        }, 0);
        document.getElementById('creditCount').textContent = Number.isInteger(total) ? total : total.toFixed(1);
    }

    function renderMiscList(items) {
        const miscList = document.getElementById('miscList');
        document.getElementById('miscCount').textContent = `(${items.length})`;
        if (!items.length) {
            miscList.innerHTML = '<div class="misc-subtitle">No unscheduled classes added.</div>';
            return;
        }
        miscList.innerHTML = items.map(item => `
            <div class="misc-item">
                <div>
                    <div class="misc-course-title">${item.course_code} - ${item.course_name || 'Class'}</div>
                    <div class="misc-meta">
                        <span>${item.credits || 0} Credits</span>
                        <span>Section ${item.section_num}</span>
                        <span>Instructor: ${item.instructor || 'N/A'}</span>
                    </div>
                </div>
                <button type="button" class="manage-btn remove-misc-btn" data-section-id="${item.section_id}">Remove</button>
            </div>
        `).join('');
    }

    function removeFromSchedule(sectionId) {
        const matchedEntry = currentSchedule.find(entry => String(entry.section_id) === String(sectionId));
        if (!matchedEntry) return;
        const scheduleGroupId = matchedEntry.schedule_group_id;
        currentSchedule = currentSchedule.filter(entry => {
            if (scheduleGroupId) return entry.schedule_group_id !== scheduleGroupId;
            return String(entry.section_id) !== String(sectionId);
        });
        persistScheduleToCookie(currentSchedule);
        updateScheduleDisplay(currentSchedule);
    }

    function persistScheduleToCookie(scheduleData) {
        document.cookie = `${SCHEDULE_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(scheduleData))}; path=/; max-age=${SCHEDULE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    }

    function isValidCourseEntry(item) {
        return !!item && REQUIRED_COURSE_FIELDS.every(field => item[field]);
    }

    function loadScheduleFromCookie() {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        const prefix = `${SCHEDULE_COOKIE_NAME}=`;
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (!cookie.startsWith(prefix)) continue;
            try {
                const parsed = JSON.parse(decodeURIComponent(cookie.substring(prefix.length)));
                return Array.isArray(parsed) ? parsed.filter(isValidCourseEntry) : [];
            } catch (error) {
                return [];
            }
        }
        return [];
    }

    function exportSchedule() {
        const blob = new Blob([JSON.stringify(currentSchedule, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'wsu-schedule.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSchedulePage);
    } else {
        initializeSchedulePage();
    }
