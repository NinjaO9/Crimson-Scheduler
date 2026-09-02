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
const SCHEDULE_STORAGE_KEY = 'crimson_scheduler_schedule';
const LEGACY_SCHEDULE_COOKIE_NAME = 'crimson_scheduler_schedule';
const SCHEDULE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TIME_FORMAT_STORAGE_KEY = 'crimson_scheduler_24_hour_time';
const HIDE_WEEKENDS_STORAGE_KEY = 'crimson_scheduler_hide_weekends';
const SHOW_INSTRUCTORS_STORAGE_KEY = 'crimson_scheduler_show_instructors';
const SHOW_COURSE_SECTION_STORAGE_KEY = 'crimson_scheduler_show_course_section';
const SCHEDULE_NAME_STORAGE_KEY = 'crimson_scheduler_schedule_name';
const DEFAULT_SCHEDULE_NAME = 'My Schedule';
const SCHEDULE_NAME_MAX_LENGTH = 20;
const MAX_SCHEDULE_SECTIONS = 15;
const SHARE_CODE_PREFIX = 'CS2.';
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
let activeMobileConflictTrigger = null;
let courseSearchRequestId = 0;
const AUTO_SEARCH_DELAY_MS = 250;

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
    currentSchedule = loadSchedule();
    updateScheduleDisplay(currentSchedule);
    updateSearchResultTimeDisplays();
}

function setupInteractionHandlers() {
    const courseSearchForm = document.getElementById('courseSearchForm');
    if (courseSearchForm) {
        courseSearchForm.addEventListener('submit', handleCourseSearchSubmit);

        const autoSearch = debounce(() => handleCourseSearch(courseSearchForm), AUTO_SEARCH_DELAY_MS);
        courseSearchForm.querySelectorAll('#subjectFilter, #numberFilter, #searchInput').forEach(input => {
            input.addEventListener('input', autoSearch);
        });
        courseSearchForm.querySelectorAll('#campusFilter, #semesterFilter').forEach(select => {
            select.addEventListener('change', autoSearch);
        });
        courseSearchForm.autoSearch = autoSearch;
    }

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
            persistSchedule(currentSchedule);
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

        if (event.target.closest('#mobileConflictBackdrop, #mobileConflictClose')) {
            closeMobileConflictSheet();
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

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') closeMobileConflictSheet();
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

    document.body.addEventListener('htmx:responseError', function(event) {
        const xhr = event.detail && event.detail.xhr;
        if (!xhr || xhr.status !== 429) return;
        showRateLimitToast(getRateLimitMessageFromResponse(xhr));
    });

    document.getElementById('resetFiltersBtn').addEventListener('click', function() {
        const form = document.getElementById('courseSearchForm');
        if (form && form.autoSearch && form.autoSearch.cancel) form.autoSearch.cancel();
        courseSearchRequestId += 1;
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

function renderSectionChoice(course, section, choiceType) {
    const sectionId = String(section.section_id == null ? '' : section.section_id);
    const courseId = String(course.id == null ? '' : course.id);
    const label = choiceType === 'lab' ? 'Lab' : 'Lecture';
    const row = document.createElement('label');
    row.className = 'section-choice-row';

    const select = document.createElement('span');
    select.className = 'section-select';
    const input = document.createElement('input');
    input.className = 'section-choice';
    input.type = 'radio';
    input.value = sectionId;
    input.name = `${choiceType}-${courseId}`;
    [
        ['data-choice-type', choiceType],
        ['data-course-id', courseId],
        ['data-section-id', sectionId],
        ['data-course-code', course.course_code],
        ['data-course-name', course.course_name],
        ['data-term-slug', course.term_slug],
        ['data-section-num', section.section_num],
        ['data-instructor', section.instructor],
        ['data-location', section.location],
        ['data-days', section.days],
        ['data-time', section.time],
        ['data-seats', section.seats],
        ['data-credits', section.credits],
        ['data-is-lab', section.is_lab],
        ['data-component', section.component]
    ].forEach(([name, value]) => input.setAttribute(name, String(value == null ? '' : value)));
    select.append(input, createElementWithText('strong', null, section.section_num));

    row.append(
        select,
        createElementWithText('span', null, label),
        createElementWithText('span', 'time-display', section.time),
        createElementWithText('span', null, section.days),
        createElementWithText('span', null, section.location),
        createElementWithText('span', null, section.instructor)
    );
    row.children[2].setAttribute('data-time', String(section.time == null ? '' : section.time));
    return row;
}

function renderCourseResult(course) {
    const hasLab = course.lab_sections.length > 0;
    const article = document.createElement('article');
    article.className = 'result-card';
    const summary = document.createElement('button');
    summary.className = 'result-summary';
    summary.type = 'button';
    summary.setAttribute('data-bs-toggle', 'collapse');
    summary.setAttribute('data-bs-target', `#sections${course.id}`);
    summary.setAttribute('data-bs-parent', '#courseResultsAccordion');
    summary.setAttribute('aria-expanded', 'false');
    const summaryText = document.createElement('span');
    const title = createElementWithText('span', 'result-title', `${course.course_code} - ${course.course_name}`);
    const meta = document.createElement('span');
    meta.className = 'result-meta';
    meta.append(
        createElementWithText('span', null, `${course.credits} Credits`),
        createElementWithText('span', null, course.has_required_lab ? 'Lecture + Lab' : 'Lecture')
    );
    summaryText.append(title, meta);
    summary.append(summaryText, createElementWithText('span', 'result-chevron', ''));

    const panel = document.createElement('div');
    panel.className = 'collapse';
    panel.id = `sections${course.id}`;
    panel.setAttribute('data-bs-parent', '#courseResultsAccordion');
    const body = createElementWithText('div', 'result-body', '');
    body.append(
        createSectionGroupTitle('Select a Lecture', course.has_required_lab),
        createSectionTable(course, course.lecture_sections, 'lecture')
    );
    if (hasLab) {
        body.append(
            createSectionGroupTitle('Select a Lab', true, 'lab-title'),
            createSectionTable(course, course.lab_sections, 'lab')
        );
    }
    const actionRow = createElementWithText('div', 'course-action-row', '');
    const addButton = createElementWithText('button', 'add-course-selection-btn', 'Add to Schedule');
    addButton.type = 'button';
    addButton.disabled = true;
    addButton.setAttribute('data-course-id', course.id);
    addButton.setAttribute('data-requires-lab', String(course.has_required_lab));
    actionRow.appendChild(addButton);
    body.appendChild(actionRow);
    panel.appendChild(body);
    article.append(summary, panel);
    return article;
}

function createSectionGroupTitle(label, required, className) {
    const title = createElementWithText('div', `section-group-title${className ? ` ${className}` : ''}`, label);
    if (required) title.appendChild(createElementWithText('span', null, '(required)'));
    return title;
}

function createSectionTable(course, sections, choiceType) {
    const table = createElementWithText('div', 'section-table', '');
    const header = createElementWithText('div', 'section-table-head', '');
    ['Section', 'Type', 'Time', 'Days', 'Location', 'Instructor'].forEach(label => {
        header.appendChild(createElementWithText('span', null, label));
    });
    table.appendChild(header);
    if (sections.length) {
        sections.forEach(section => table.appendChild(renderSectionChoice(course, section, choiceType)));
    } else {
        table.appendChild(createElementWithText('div', 'muted-cell', 'No sections available'));
    }
    return table;
}

function renderCourseResults(courses) {
    const results = document.getElementById('searchResults');
    if (!results) return;
    results.replaceChildren();
    if (!courses.length) {
        results.appendChild(createElementWithText('div', 'empty-search', 'No courses found.'));
        return;
    }

    const accordion = createElementWithText('div', 'course-results-accordion', '');
    accordion.id = 'courseResultsAccordion';
    courses.forEach(course => accordion.appendChild(renderCourseResult(course)));
    results.appendChild(accordion);
    updateSearchResultTimeDisplays();
}

function searchHasCriteria(formData) {
    return ['q', 'subject', 'number'].some(name => String(formData.get(name) || '').trim());
}

async function handleCourseSearch(form, options) {
    const allowEmptySearch = options && options.allowEmptySearch;
    const results = document.getElementById('searchResults');
    const requestId = ++courseSearchRequestId;
    const formData = new FormData(form);
    const campus = formData.get('campus');
    const term = formData.get('semester');

    if (!campus || !term || (!allowEmptySearch && !searchHasCriteria(formData))) {
        if (results) results.replaceChildren(createElementWithText(
            'div',
            'empty-search',
            'Choose a campus + term, then start typing to search courses.'
        ));
        return;
    }

    if (results) results.replaceChildren(createElementWithText('div', 'empty-search', 'Loading courses...'));
    try {
        const courses = await CourseApi.fetchCourses(campus, term);
        if (requestId !== courseSearchRequestId) return;
        renderCourseResults(CourseApi.filterCourses(courses, {
            q: formData.get('q'),
            subject: formData.get('subject'),
            number: formData.get('number')
        }));
    } catch (error) {
        if (requestId !== courseSearchRequestId) return;
        if (results) results.replaceChildren(createElementWithText('div', 'empty-search', 'Unable to load courses. Please try again.'));
        console.error('Unable to load course data:', error);
    }
}

async function handleCourseSearchSubmit(event) {
    event.preventDefault();
    return handleCourseSearch(event.currentTarget, { allowEmptySearch: true });
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
    const debounced = function(...args) {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => callback.apply(this, args), delay);
    };
    debounced.cancel = function() {
        window.clearTimeout(timerId);
    };
    return debounced;
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
    return CourseApi.toScheduleEntry({
        section_id: choice.getAttribute('data-section-id'),
        term_slug: choice.getAttribute('data-term-slug'),
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
    }, scheduleGroupId);
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
    persistSchedule(currentSchedule);
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
    const baseZIndex = Math.max((24 * 60) - durationMinutes, 1);

    block.style.setProperty('--course-block-z-index', String(baseZIndex));
    block.style.setProperty('--course-block-conflict-z-index', String(baseZIndex + 1));
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
        if (isMobileViewport() && block.conflictingCourses && block.conflictingCourses.length) {
            openMobileConflictSheet(block, courseData, block.conflictingCourses);
            return;
        }
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

function getCourseRemovalLabel(courseData) {
    return `${courseData.course_code} - ${courseData.section_num}`;
}

function getUniqueCourses(courses) {
    return courses.filter((course, index) => (
        courses.findIndex(item => String(item.section_id) === String(course.section_id)) === index
    ));
}

function getConflictRemovalOptions(courseData, conflicts) {
    return getUniqueCourses([courseData, ...conflicts]);
}

function createConflictRemovalButton(courseData, className, onRemove) {
    const button = createElementWithText('button', className, getCourseRemovalLabel(courseData));
    button.type = 'button';
    button.setAttribute('data-section-id', courseData.section_id);
    button.setAttribute('aria-label', `Remove ${getCourseRemovalLabel(courseData)} from schedule`);
    button.appendChild(createElementWithText('span', 'conflict-remove-meta', `${formatMeetingListForDisplay(courseData.time)} - ${courseData.location || 'Location: N/A'}`));
    button.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        onRemove(courseData.section_id);
    });
    return button;
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
    const removalOptions = getConflictRemovalOptions(courseData, conflicts);

    appendTextElement(fragment, 'strong', '', 'Time Conflict');
    appendTextElement(fragment, 'div', '', 'Remove a class from this conflict:');
    removalOptions.forEach(course => {
        fragment.appendChild(createConflictRemovalButton(course, 'conflict-remove-btn', removeFromSchedule));
    });
    return fragment;
}

function openMobileConflictSheet(triggerBlock, courseData, conflicts) {
    const sheet = document.getElementById('mobileConflictSheet');
    const subtitle = document.getElementById('mobileConflictSubtitle');
    const optionsContainer = document.getElementById('mobileConflictOptions');
    if (!sheet || !subtitle || !optionsContainer) return;

    const removalOptions = getConflictRemovalOptions(courseData, conflicts);
    activeMobileConflictTrigger = triggerBlock;
    subtitle.textContent = 'Choose one class to remove from this overlap.';

    const fragment = document.createDocumentFragment();
    removalOptions.forEach(course => {
        fragment.appendChild(createConflictRemovalButton(course, 'mobile-conflict-remove-btn', function(sectionId) {
            closeMobileConflictSheet();
            removeFromSchedule(sectionId);
        }));
    });
    optionsContainer.replaceChildren(fragment);

    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-conflict-sheet-open');

    const firstButton = optionsContainer.querySelector('button');
    if (firstButton) firstButton.focus({ preventScroll: true });
}

function closeMobileConflictSheet() {
    const sheet = document.getElementById('mobileConflictSheet');
    if (!sheet || !sheet.classList.contains('is-open')) return;

    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-conflict-sheet-open');

    if (activeMobileConflictTrigger && document.contains(activeMobileConflictTrigger)) {
        activeMobileConflictTrigger.focus({ preventScroll: true });
    }
    activeMobileConflictTrigger = null;
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
            if (tooltip) {
                tooltip.classList.add('conflict-tooltip');
                tooltip.replaceChildren(buildConflictTooltip(dayBlock.course, conflicts));
            }
            dayBlock.element.conflictingCourses = conflicts;
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
    persistSchedule(currentSchedule);
    updateScheduleDisplay(currentSchedule);
}

function persistSchedule(scheduleData) {
    const serialized = JSON.stringify(scheduleData);
    try {
        localStorage.setItem(SCHEDULE_STORAGE_KEY, serialized);
        return true;
    } catch (error) {
        return false;
    }
}

function isValidCourseEntry(item) {
    return !!item && REQUIRED_COURSE_FIELDS.every(field => item[field]);
}

function parseStoredSchedule(serialized) {
    try {
        const parsed = JSON.parse(serialized);
        return Array.isArray(parsed) ? parsed.filter(isValidCourseEntry) : [];
    } catch (error) {
        return [];
    }
}

function loadSchedule() {
    try {
        const storedSchedule = localStorage.getItem(SCHEDULE_STORAGE_KEY);
        if (storedSchedule !== null) return parseStoredSchedule(storedSchedule);
    } catch (error) {
        console.warn('Unable to read saved schedule from local storage:', error);
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

function getCurrentScheduleTerms() {
    const terms = new Map();
    let totalSections = 0;
    currentSchedule.forEach(item => {
        if (totalSections >= MAX_SCHEDULE_SECTIONS) return;
        const slug = String(item.term_slug || '');
        const sln = String(item.section_id || '');
        if (!slug || !sln) return;
        if (!terms.has(slug)) terms.set(slug, new Set());
        const slns = terms.get(slug);
        if (!slns.has(sln)) {
            slns.add(sln);
            totalSections += 1;
        }
    });
    return Array.from(terms, ([slug, slns]) => ({ slug, slns: Array.from(slns) }));
}

function buildShareCode() {
    return `${SHARE_CODE_PREFIX}${encodeBase64Url(JSON.stringify({
        n: getScheduleName(),
        terms: getCurrentScheduleTerms()
    }))}`;
}

function parseShareCode(code) {
    const normalizedCode = (code || '').trim();
    if (!normalizedCode.startsWith(SHARE_CODE_PREFIX)) {
        throw new Error('That does not look like a Crimson Scheduler share code.');
    }

    const payload = JSON.parse(decodeBase64Url(normalizedCode.slice(SHARE_CODE_PREFIX.length)));
    const name = String(payload.n || DEFAULT_SCHEDULE_NAME).trim().slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
    const terms = [];
    const seen = new Set();
    let totalSections = 0;
    if (Array.isArray(payload.terms)) {
        payload.terms.forEach(term => {
            if (totalSections >= MAX_SCHEDULE_SECTIONS || !term || !term.slug || !Array.isArray(term.slns)) return;
            const slug = String(term.slug);
            const slns = [];
            term.slns.forEach(sln => {
                const normalizedSln = String(sln || '');
                const key = `${slug}:${normalizedSln}`;
                if (normalizedSln && !seen.has(key) && totalSections < MAX_SCHEDULE_SECTIONS) {
                    seen.add(key);
                    slns.push(normalizedSln);
                    totalSections += 1;
                }
            });
            if (slns.length) terms.push({ slug, slns });
        });
    }
    if (!terms.length) throw new Error('This share code does not contain any sections.');

    return {
        name,
        terms
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
    if (!getCurrentScheduleTerms().length) {
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

async function fetchScheduleForTerms(terms) {
    const datasets = new Map();
    for (const term of terms) {
        if (!datasets.has(term.slug)) {
            datasets.set(term.slug, await CourseApi.fetchDatasetByKey(term.slug));
        }
    }

    const matches = [];
    const missingSectionIds = [];
    terms.forEach(term => {
        const dataset = datasets.get(term.slug);
        term.slns.forEach(sln => {
            const match = dataset.sectionsBySln.get(String(sln));
            if (match) matches.push({ dataset, ...match });
            else missingSectionIds.push(String(sln));
        });
    });

    const groupedIds = new Map();
    matches.forEach(match => {
        const key = `${match.dataset.key}:${match.course.id}`;
        if (!groupedIds.has(key)) groupedIds.set(key, []);
        groupedIds.get(key).push(String(match.section.section_id));
    });

    const schedule = matches.map(match => {
        const key = `${match.dataset.key}:${match.course.id}`;
        const ids = groupedIds.get(key);
        const groupId = ids.length > 1 ? ids.join('-') : null;
        return CourseApi.toScheduleEntry(match.section, groupId);
    });
    return { schedule, missing_section_ids: missingSectionIds };
}

async function importScheduleFromShareCode() {
    const code = window.prompt('Paste a Crimson Scheduler share code:');
    if (!code) return;

    try {
        const parsedCode = parseShareCode(code);
        const confirmed = window.confirm(`Import "${parsedCode.name}" and replace your current schedule?`);
        if (!confirmed) return;

        const data = await fetchScheduleForTerms(parsedCode.terms);
        if (!data.schedule.length) {
            window.alert('No matching sections were found for that share code.');
            return;
        }

        const nameInput = document.getElementById('scheduleNameInput');
        if (nameInput) nameInput.value = parsedCode.name;
        saveScheduleName();
        currentSchedule = data.schedule;
        persistSchedule(currentSchedule);
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
