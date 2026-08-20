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
    const MOBILE_BREAKPOINT = 760;
    const SCHEDULE_COOKIE_NAME = 'crimson_scheduler_schedule';
    const SCHEDULE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
    const TIME_FORMAT_STORAGE_KEY = 'crimson_scheduler_24_hour_time';
    const HIDE_WEEKENDS_STORAGE_KEY = 'crimson_scheduler_hide_weekends';
    const SHOW_INSTRUCTORS_STORAGE_KEY = 'crimson_scheduler_show_instructors';
    const SHOW_COURSE_SECTION_STORAGE_KEY = 'crimson_scheduler_show_course_section';
    const SCHEDULE_NAME_STORAGE_KEY = 'crimson_scheduler_schedule_name';
    const DEFAULT_SCHEDULE_NAME = 'My Schedule';
    const SCHEDULE_NAME_MAX_LENGTH = 20;
    const MAX_SCHEDULE_SECTIONS = 15;
    const SHARE_CODE_PREFIX = 'CS1.';
    const SECTIONS_BY_IDS_URL = '/api/sections-by-ids/';
    const REQUIRED_COURSE_FIELDS = ['section_id', 'course_code', 'days', 'time'];
    const RATE_LIMIT_TOAST_ID = 'rateLimitToast';
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

    function ensureRateLimitToast() {
        let toast = document.getElementById(RATE_LIMIT_TOAST_ID);
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = RATE_LIMIT_TOAST_ID;
        toast.className = 'rate-limit-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
        return toast;
    }

    function showRateLimitToast(message) {
        const toast = ensureRateLimitToast();
        toast.textContent = message || 'You are sending requests too quickly. Please wait a moment.';
        toast.classList.add('is-visible');

        if (toast.hideTimer) {
            window.clearTimeout(toast.hideTimer);
        }

        toast.hideTimer = window.setTimeout(() => {
            toast.classList.remove('is-visible');
        }, 3500);
    }

    function getRateLimitMessageFromResponse(xhr, fallbackMessage) {
        if (!xhr) return fallbackMessage;
        const headerMessage = xhr.getResponseHeader && xhr.getResponseHeader('X-Rate-Limit-Message');
        if (headerMessage) return headerMessage;

        if (xhr.responseText) {
            try {
                const parsed = JSON.parse(xhr.responseText);
                if (parsed && parsed.message) return parsed.message;
            } catch (error) {
                const parsedHtml = new DOMParser().parseFromString(xhr.responseText, 'text/html');
                const text = parsedHtml.body.textContent && parsedHtml.body.textContent.trim();
                if (text) return text;
            }
        }

        return fallbackMessage;
    }

    function createElementWithText(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text == null ? '' : String(text);
        return element;
    }

    function appendTextElement(parent, tagName, className, text) {
        const element = createElementWithText(tagName, className, text);
        parent.appendChild(element);
        return element;
    }

    function createCourseBlockLine(text) {
        return createElementWithText('span', 'course-block-line', text);
    }

    function initializeSchedulePage() {
        initializeScheduleName();
        initializeScheduleOptions();
        initializeMobileLayout();
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
                if (!window.confirm('Clear your entire schedule? This cannot be undone.')) return;
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
                return;
            }

            if (event.target.closest('#shareScheduleBtn')) {
                shareScheduleCode();
                return;
            }

            if (event.target.closest('#importShareCodeBtn')) {
                importScheduleFromShareCode();
                return;
            }

            const mobileNavButton = event.target.closest('.mobile-nav-btn');
            if (mobileNavButton) {
                handleMobileNavigation(mobileNavButton);
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

            if (event.target.closest('#showSectionToggle')) {
                saveScheduleOptions();
                updateScheduleDisplay(currentSchedule);
            }
        });

        document.addEventListener('input', function(event) {
            if (event.target.closest('#scheduleNameInput')) {
                saveScheduleName();
            }
        });

        document.addEventListener('blur', function(event) {
            if (event.target.closest('#scheduleNameInput')) {
                normalizeScheduleNameInput();
            }
        }, true);

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

        document.body.addEventListener('htmx:responseError', function(event) {
            const xhr = event.detail && event.detail.xhr;
            if (!xhr || xhr.status !== 429) return;
            showRateLimitToast(getRateLimitMessageFromResponse(xhr));
        });

        document.getElementById('resetFiltersBtn').addEventListener('click', function() {
            window.setTimeout(() => {
                document.getElementById('searchResults').replaceChildren(
                    createElementWithText('div', 'empty-search', 'Choose a campus + term, then search courses to begin building your schedule.')
                );
            }, 0);
        });

        window.addEventListener('resize', debounce(function() {
            updateScheduleDisplay(currentSchedule);
        }, 150));
    }

    function isMobileViewport() {
        return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
    }

    function initializeMobileLayout() {
        setMobilePane('search');
    }

    function handleMobileNavigation(button) {
        const targetPane = button.getAttribute('data-mobile-nav');
        setMobilePane(targetPane);
    }

    function setMobilePane(targetPane) {
        document.querySelectorAll('[data-mobile-pane]').forEach(pane => {
            pane.classList.toggle('is-active', pane.getAttribute('data-mobile-pane') === targetPane);
        });
        document.querySelectorAll('.mobile-nav-btn').forEach(button => {
            const isActive = button.getAttribute('data-mobile-nav') === targetPane;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        const shell = document.querySelector('.schedule-shell');
        if (shell) shell.setAttribute('data-active-mobile-pane', targetPane);
    }

    function debounce(callback, delay) {
        let timerId;
        return function(...args) {
            window.clearTimeout(timerId);
            timerId = window.setTimeout(() => callback.apply(this, args), delay);
        };
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

    function showSections() {
        const toggle = document.getElementById('showSectionToggle');
        return !!toggle && toggle.checked;
    }

    function getVisibleDays() {
        return (isMobileViewport() || hidesWeekends()) /* Forcing mobile to have only 5 DOW cause im evil >:) */
            ? DAYS_OF_WEEK.filter(day => day.key !== 'S' && day.key !== 'U')
            : DAYS_OF_WEEK;
    }

    function getCalendarColumnTemplate() {
        const timeColumnWidth = isMobileViewport() ? '56px' : '82px';
        const dayColumnWidth = isMobileViewport() ? 'minmax(64px, 1fr)' : 'minmax(96px, 1fr)';
        return `${timeColumnWidth} repeat(${getVisibleDays().length}, ${dayColumnWidth})`;
    }

    function initializeScheduleOptions() {
        const timeToggle = document.getElementById('timeFormatToggle');
        if (timeToggle) timeToggle.checked = localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === 'true';

        const weekendToggle = document.getElementById('hideWeekendsToggle');
        if (weekendToggle) weekendToggle.checked = localStorage.getItem(HIDE_WEEKENDS_STORAGE_KEY) === 'true';

        const instructorToggle = document.getElementById('showInstructorToggle');
        if (instructorToggle) instructorToggle.checked = localStorage.getItem(SHOW_INSTRUCTORS_STORAGE_KEY) === 'true';

        const sectionToggle = document.getElementById('showSectionToggle');
        if (sectionToggle) sectionToggle.checked = localStorage.getItem(SHOW_COURSE_SECTION_STORAGE_KEY) !== 'false';
    }

    function initializeScheduleName() {
        const input = document.getElementById('scheduleNameInput');
        if (!input) return;
        input.value = getStoredScheduleName();
        resizeScheduleNameInput();
    }

    function getScheduleName() {
        const input = document.getElementById('scheduleNameInput');
        const name = input ? input.value.trim() : '';
        return (name || DEFAULT_SCHEDULE_NAME).slice(0, SCHEDULE_NAME_MAX_LENGTH);
    }

    function getStoredScheduleName() {
        return ((localStorage.getItem(SCHEDULE_NAME_STORAGE_KEY) || DEFAULT_SCHEDULE_NAME).trim() || DEFAULT_SCHEDULE_NAME)
            .slice(0, SCHEDULE_NAME_MAX_LENGTH);
    }

    function saveScheduleName() {
        localStorage.setItem(SCHEDULE_NAME_STORAGE_KEY, getScheduleName());
        resizeScheduleNameInput();
    }

    function normalizeScheduleNameInput() {
        const input = document.getElementById('scheduleNameInput');
        if (!input) return;
        input.value = getScheduleName();
        saveScheduleName();
    }

    function resizeScheduleNameInput() {
        const input = document.getElementById('scheduleNameInput');
        if (!input) return;
        const styles = window.getComputedStyle(input);
        const canvas = resizeScheduleNameInput.canvas || document.createElement('canvas');
        resizeScheduleNameInput.canvas = canvas;
        const context = canvas.getContext('2d');
        context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
        const textWidth = context.measureText(input.value || DEFAULT_SCHEDULE_NAME).width;
        input.style.width = `${Math.ceil(textWidth + 10)}px`;
    }

    function slugifyScheduleName(name) {
        const slug = (name || DEFAULT_SCHEDULE_NAME)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'schedule';
    }

    function saveScheduleOptions() {
        localStorage.setItem(TIME_FORMAT_STORAGE_KEY, String(uses24HourTime()));
        localStorage.setItem(HIDE_WEEKENDS_STORAGE_KEY, String(hidesWeekends()));
        localStorage.setItem(SHOW_INSTRUCTORS_STORAGE_KEY, String(showInstructors()));
        localStorage.setItem(SHOW_COURSE_SECTION_STORAGE_KEY, String(showSections()));
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
        if (isMobileViewport()) setMobilePane('schedule');
    }

    function buildCalendarHeader() {
        const header = document.getElementById('calendarHeader');
        header.style.gridTemplateColumns = getCalendarColumnTemplate();
        header.replaceChildren(createElementWithText('div', 'calendar-header-time', 'Time'));
        getVisibleDays().forEach((day) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-header-day';
            dayEl.textContent = isMobileViewport() ? day.label.slice(0, 3) : day.label;
            header.appendChild(dayEl);
        });
    }

    function initializeCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.replaceChildren();
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

    function applyCourseBlockStacking(block, timeRange) {
        const durationMinutes = Math.max(timeRange.end - timeRange.start, 0);
        const shorterClassPriority = Math.max((24 * 60) - durationMinutes, 0);
        const baseZIndex = 100 + (shorterClassPriority * 3);

        block.style.setProperty('--course-block-z-index', String(baseZIndex));
        block.style.setProperty('--course-block-conflict-z-index', String(baseZIndex + 1));
        block.style.setProperty('--course-block-hover-z-index', String(baseZIndex + 2));
    }

    function renderCourseBlock(dayIndex, timeRange, courseData) {
        const startHour = Math.floor(timeRange.start / 60);
        const startMinute = timeRange.start % 60;
        const durationHours = (timeRange.end - timeRange.start) / 60;
        const cell = document.getElementById(`cell-${dayIndex}-${startHour}`);
        const showInstruct = showInstructors();
        const showSection = showSections();
        if (!cell) return false;

        const block = document.createElement('div');
        block.className = `course-block no-conflict${showInstruct ? ' with-instructor' : ''}`;
        block.style.height = Math.max((durationHours * 100), 0) + '%';
        block.style.minHeight = '30px';
        block.style.top = (startMinute / 60 * 100) + '%';
        applyCourseBlockStacking(block, timeRange);
        block.appendChild(createCourseBlockLine(`${courseData.course_code}${showSection ? ` - ${courseData.section_num}` : ''}`));
        block.appendChild(createCourseBlockLine(formatMeetingListForDisplay(courseData.time)));
        block.appendChild(createCourseBlockLine(courseData.location));
        if (showInstruct) block.appendChild(createCourseBlockLine(courseData.instructor));
        block.setAttribute('data-section-id', courseData.section_id);
        block.setAttribute('data-start-minutes', String(timeRange.start));
        block.setAttribute('data-end-minutes', String(timeRange.end));

        const tooltip = document.createElement('div');
        tooltip.className = 'course-block-tooltip';
        tooltip.appendChild(buildCourseTooltip(courseData));
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
        block.appendChild(createCourseBlockLine(courseData.course_code));
        block.appendChild(createCourseBlockLine(formatMeetingListForDisplay(courseData.time)));
        block.appendChild(createCourseBlockLine(courseData.location));
        cell.appendChild(block);
        return true;
    }

    function getCourseLabel(courseData) {
        return `${courseData.course_code} (${formatMeetingListForDisplay(courseData.time)})`;
    }

    function buildCourseTooltip(courseData) {
        const fragment = document.createDocumentFragment();
        appendTextElement(fragment, 'strong', '', `${courseData.course_code} - ${courseData.section_num}`);
        appendTextElement(fragment, 'div', '', courseData.course_name || '');
        appendTextElement(fragment, 'div', '', `${courseData.days} ${formatMeetingListForDisplay(courseData.time)}`);
        appendTextElement(fragment, 'div', '', courseData.instructor || 'Instructor: N/A');
        appendTextElement(fragment, 'div', '', courseData.location || 'Location: N/A');
        appendTextElement(fragment, 'div', '', 'Click to remove from schedule');
        return fragment;
    }

    function buildConflictTooltip(courseData, conflicts) {
        const fragment = document.createDocumentFragment();
        appendTextElement(fragment, 'strong', '', 'Time Conflict');
        appendTextElement(fragment, 'div', '', getCourseLabel(courseData));
        appendTextElement(fragment, 'div', '', 'overlaps with');
        conflicts.forEach(conflict => {
            appendTextElement(fragment, 'div', '', getCourseLabel(conflict));
        });
        appendTextElement(fragment, 'div', '', 'Click to remove from schedule');
        return fragment;
    }

    function addCourseToCalendar(courseData) {
        let renderedCount = 0;
        resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) => {
            dayIndexes.forEach(dayIndex => {
                if (renderCourseBlock(dayIndex, timeRange, courseData)) renderedCount += 1;
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
                if (tooltip) tooltip.replaceChildren(buildConflictTooltip(dayBlock.course, conflicts));
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
            miscList.replaceChildren(createElementWithText('div', 'misc-subtitle', 'No unscheduled classes added.'));
            return;
        }
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const miscItem = document.createElement('div');
            miscItem.className = 'misc-item';

            const details = document.createElement('div');
            appendTextElement(details, 'div', 'misc-course-title', `${item.course_code} - ${item.course_name || 'Class'}`);

            const meta = document.createElement('div');
            meta.className = 'misc-meta';
            appendTextElement(meta, 'span', '', `${item.credits || 0} Credits`);
            appendTextElement(meta, 'span', '', `Section ${item.section_num} (${item.is_lab ? 'Lab' : 'Lecture'})`);
            appendTextElement(meta, 'span', '', `Instructor: ${item.instructor || 'N/A'}`);
            details.appendChild(meta);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'manage-btn remove-misc-btn';
            removeButton.setAttribute('data-section-id', item.section_id);
            removeButton.textContent = 'Remove';

            miscItem.appendChild(details);
            miscItem.appendChild(removeButton);
            fragment.appendChild(miscItem);
        });
        miscList.replaceChildren(fragment);
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

    function getCookie(name) {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        const prefix = `${name}=`;
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.substring(prefix.length));
        }
        return '';
    }

    function encodeBase64Url(value) {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function decodeBase64Url(value) {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    function getCurrentScheduleSectionIds() {
        const sectionIds = [];
        currentSchedule.forEach(item => {
            const sectionId = parseInt(item.section_id, 10);
            if (Number.isInteger(sectionId) && !sectionIds.includes(sectionId)) sectionIds.push(sectionId);
        });
        return sectionIds;
    }

    function buildShareCode() {
        return `${SHARE_CODE_PREFIX}${encodeBase64Url(JSON.stringify({
            n: getScheduleName(),
            s: getCurrentScheduleSectionIds()
        }))}`;
    }

    function parseShareCode(code) {
        const normalizedCode = (code || '').trim();
        if (!normalizedCode.startsWith(SHARE_CODE_PREFIX)) {
            throw new Error('That does not look like a Crimson Scheduler share code.');
        }

        const payload = JSON.parse(decodeBase64Url(normalizedCode.slice(SHARE_CODE_PREFIX.length)));
        const name = String(payload.n || DEFAULT_SCHEDULE_NAME).trim().slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
        const sectionIds = Array.isArray(payload.s)
            ? payload.s.map(sectionId => parseInt(sectionId, 10)).filter(Number.isInteger)
            : [];
        if (!sectionIds.length) throw new Error('This share code does not contain any sections.');

        return {
            name,
            sectionIds: Array.from(new Set(sectionIds)).slice(0, MAX_SCHEDULE_SECTIONS)
        };
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        return false;
    }

    async function shareScheduleCode() {
        normalizeScheduleNameInput();
        if (!getCurrentScheduleSectionIds().length) {
            window.alert('Add at least one class before creating a share code.');
            return;
        }

        const shareCode = buildShareCode();
        try {
            if (await copyTextToClipboard(shareCode)) {
                window.alert('Share code copied to your clipboard.');
                return;
            }
        } catch (error) {
            // Fall through to the prompt fallback below.
        }
        window.prompt('Copy this share code:', shareCode);
    }

    async function fetchScheduleForSectionIds(sectionIds) {
        const response = await fetch(SECTIONS_BY_IDS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ section_ids: sectionIds })
        });
        if (response.status === 429) {
            let message = response.headers.get('X-Rate-Limit-Message');
            if (!message) {
                try {
                    const errorData = await response.json();
                    message = errorData.message;
                } catch (error) {
                    message = 'You are sending requests too quickly. Please wait a moment.';
                }
            }
            showRateLimitToast(message);
            const error = new Error(message || 'You are sending requests too quickly. Please wait a moment.');
            error.rateLimited = true;
            throw error;
        }
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'The schedule could not be rebuilt from that share code.');
        }
        return data;
    }

    async function importScheduleFromShareCode() {
        const code = window.prompt('Paste a Crimson Scheduler share code:');
        if (!code) return;

        try {
            const parsedCode = parseShareCode(code);
            const confirmed = window.confirm(`Import "${parsedCode.name}" and replace your current schedule?`);
            if (!confirmed) return;

            const data = await fetchScheduleForSectionIds(parsedCode.sectionIds);
            if (!data.schedule.length) {
                window.alert('No matching sections were found for that share code.');
                return;
            }

            const nameInput = document.getElementById('scheduleNameInput');
            if (nameInput) nameInput.value = parsedCode.name;
            saveScheduleName();
            currentSchedule = data.schedule;
            persistScheduleToCookie(currentSchedule);
            updateScheduleDisplay(currentSchedule);
            if (isMobileViewport()) setMobilePane('schedule');

            if (data.missing_section_ids && data.missing_section_ids.length) {
                window.alert(`Imported ${data.schedule.length} section(s). ${data.missing_section_ids.length} section(s) could not be found.`);
            }
        } catch (error) {
            if (error && error.rateLimited) return;
            window.alert(error.message || 'That share code could not be imported.');
        }
    }

    function nextAnimationFrame() {
        return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
    }

    function buildScheduleExportFilename() {
        const today = new Date();
        const dateToken = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0')
        ].join('-');
        return `${slugifyScheduleName(getScheduleName())}-${dateToken}.png`;
    }

    function downloadCanvasImage(canvas) {
        return new Promise(resolve => {
            canvas.toBlob(function(blob) {
                if (!blob) {
                    window.alert('Sorry, the schedule image could not be created.');
                    resolve(false);
                    return;
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = buildScheduleExportFilename();
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                resolve(true);
            }, 'image/png');
        });
    }

    async function exportSchedule() {
        if (typeof window.html2canvas !== 'function') {
            window.alert('The image export tool is still loading. Please try again in a moment.');
            return;
        }

        const schedulePane = document.querySelector('.schedule-pane');
        const exportButton = document.getElementById('exportScheduleBtn');
        if (!schedulePane || !exportButton) return;

        normalizeScheduleNameInput();
        const confirmed = window.confirm(`Create and download a PNG image of "${getScheduleName()}"?`);
        if (!confirmed) return;

        const originalButtonText = exportButton.textContent;
        exportButton.disabled = true;
        exportButton.textContent = 'Exporting...';
        exportButton.setAttribute('aria-busy', 'true');
        clearSectionGhosts();

        document.body.classList.add('schedule-export-active');
        schedulePane.classList.add('is-exporting');

        try {
            await nextAnimationFrame();
            const canvas = await window.html2canvas(schedulePane, {
                backgroundColor: '#ffffff',
                scale: Math.min(window.devicePixelRatio || 1, 2),
                useCORS: true,
                width: schedulePane.scrollWidth,
                height: schedulePane.scrollHeight,
                windowWidth: Math.max(document.documentElement.clientWidth, schedulePane.scrollWidth),
                windowHeight: Math.max(document.documentElement.clientHeight, schedulePane.scrollHeight)
            });
            await downloadCanvasImage(canvas);
        } catch (error) {
            window.alert('Sorry, the schedule image could not be created.');
        } finally {
            schedulePane.classList.remove('is-exporting');
            document.body.classList.remove('schedule-export-active');
            exportButton.disabled = false;
            exportButton.textContent = originalButtonText;
            exportButton.removeAttribute('aria-busy');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSchedulePage);
    } else {
        initializeSchedulePage();
    }
