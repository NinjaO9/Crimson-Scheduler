/**
 * @fileoverview Loads, normalizes, caches, and filters published course catalog data.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

(function(window) {
    'use strict';

    const API_BASE_URL = 'https://ninjao9.github.io/Crimson-Scheduler/api/v1/';
    const courseCache = new Map();
    const RESULT_LIMIT = 25;
    // Manually handled shorthands. Please let me know if there is more that I should include (and you are reading this, lol)
    const SUBJECT_SHORTHANDS = new Map([
        ['cpts', 'CPT_S'],
        ['cs', 'CPT_S']
    ]);

    /**
     * Converts arbitrary text into a lowercase URL slug.
     * @param {string} value - Text to normalize.
     * @returns {string} Hyphen-separated slug.
     */
    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    /** Builds the published JSON URL for a campus/term dataset.
     * @param {string} campus - Campus identifier.
     * @param {string} term - Term identifier.
     * @returns {string} Dataset URL.
     * @see {@link slugify}
     */
    function campusTermUrl(campus, term) {
        return `${API_BASE_URL}courses/${slugify(campus)}-${slugify(term)}.json`;
    }

    /** Creates the cache key shared by dataset fetches.
     * @param {string} campus - Campus identifier.
     * @param {string} term - Term identifier.
     * @returns {string} Normalized dataset key.
     */
    function datasetKey(campus, term) {
        return `${slugify(campus)}-${slugify(term)}`;
    }

    /** Converts nullable values to trimmed text with a fallback.
     * @param {unknown} value - Value to convert.
     * @param {string} [fallback=''] - Text used for nullish input.
     * @returns {string} Trimmed text.
     */
    function text(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

    /** Creates a stable term/section lookup key.
     * @param {string} termSlug - Term slug.
     * @param {string|number} sectionId - Section identifier.
     * @returns {string} Composite section key.
     */
    function sectionKey(termSlug, sectionId) {
        return `${slugify(termSlug)}:${text(sectionId)}`;
    }

    /** Shallow-copies arrays and objects so normalized data is detached from the payload.
     * @param {unknown} value - Value to copy.
     * @param {unknown} fallback - Value used for nullish input.
     * @returns {*} Copied value or fallback.
     */
    function copyValue(value, fallback) {
        if (value === null || value === undefined) return fallback;
        if (Array.isArray(value)) {
            return value.map(item => {
                if (item && typeof item === 'object') return { ...item };
                return item;
            });
        }
        if (typeof value === 'object') return { ...value };
        return value;
    }

    /** Normalizes one raw catalog section into the UI's section schema.
     * @param {Object} section - Raw section payload.
     * @param {Object} course - Parent raw course payload.
     * @param {number} index - Section index used for fallback IDs.
     * @returns {Object} Normalized section record.
     * @see {@link copyValue}
     */
    function normalizeSection(section, course, index) {
        const seats = section && section.seats ? section.seats : {};
        const sectionId = text(section && (section.sectionId || section.sln), `section-${index}`);

        return {
            section_id: sectionId,
            course_code: text(section && section.courseCode, text(course && course.courseCode)),
            course_name: text(section && section.courseName, text(course && (course.courseName || course.course))),
            section_num: section && section.sectionNumber,
            instructor: text(section && section.instructor),
            location: text(section && section.location),
            days: text(section && section.days),
            time: text(section && section.time),
            seats: text(seats.label, `${text(seats.taken, '')}/${text(seats.total, '')}`),
            seats_available: Number(seats.available),
            seats_total: Number(seats.total),
            credits: section && section.isLab ? '0' : text(section && section.credits, text(course && course.credits, '0')),
            is_lab: Boolean(section && section.isLab),
            ucore: text(section && section.ucore, ''),
            component: text(section && section.component, 'Lecture'),
            meetings: copyValue(section && section.meetings, []),
            instructors: copyValue(section && section.instructors, []),
            coop: section && section.coop !== undefined ? section.coop : '',
            footnotes: copyValue(section && section.footnotes, ''),
            dates: {
                start: text(section && section.dates && section.dates.start),
                end: text(section && section.dates && section.dates.end)
            }
        };
    }

    /** Normalizes a raw course and separates lecture and lab sections.
     * @param {Object} course - Raw course payload.
     * @param {string} subjectName - Subject inherited from the payload group.
     * @param {string|number} index - Stable index used in the course ID.
     * @returns {Object} Normalized course record.
     * @see {@link normalizeSection}
     */
    function normalizeCourse(course, subjectName, index) {
        const sections = Array.isArray(course && course.sections) ? course.sections : [];
        const courseCode = text(course && course.courseCode, `${text(course && (course.subject || subjectName))} ${text(course && course.courseNumber)}`.trim());
        const id = `course-${slugify(courseCode)}-${index}`;
        const normalizedSections = sections.map((section, sectionIndex) => (
            normalizeSection(section, course, sectionIndex)
        ));

        return {
            id,
            subject: text(course && course.subject, subjectName),
            course_number: course && course.courseNumber,
            course_code: courseCode,
            course_name: text(course && (course.courseName || course.course)),
            credits: text(course && course.credits, '0'),
            has_required_lab: Boolean(course && course.hasRequiredLab),
            lecture_sections: normalizedSections.filter(section => !section.is_lab),
            lab_sections: normalizedSections.filter(section => section.is_lab),
            ucore: text(normalizedSections[0].ucore, ''), // all sections should have the same UCORE
        };
    }

    /** Flattens and normalizes all subjects and courses in an API payload.
     * @param {Object} payload - Raw catalog payload.
     * @returns {Object[]} Normalized courses, or an empty array for invalid payloads.
     * @see {@link normalizeCourse}
     */
    function normalizePayload(payload) {
        if (!payload || !Array.isArray(payload.subjects)) return [];

        return payload.subjects.reduce((courses, subject) => {
            const subjectName = text(subject && subject.subject);
            const subjectCourses = Array.isArray(subject && subject.courses) ? subject.courses : [];
            subjectCourses.forEach((course, index) => {
                courses.push(normalizeCourse(course, subjectName, `${courses.length}-${index}`));
            });
            return courses;
        }, []);
    }

    /** Produces canonical searchable text for query matching.
     * @param {unknown} value - Value to normalize.
     * @returns {string} Lowercase alphanumeric search text.
     */
    function normalizeSearchText(value) {
        return text(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    /** Checks whether a subject matches a configured shorthand.
     * @param {string} subject - Full subject name/code.
     * @param {string} shorthand - User-entered shorthand.
     * @returns {boolean} Whether the shorthand maps to the subject.
     * @see {@link normalizeSearchText}
     */
    function subjectMatchesShorthand(subject, shorthand) {
        const mappedSubject = SUBJECT_SHORTHANDS.get(shorthand);
        console.log(`Subject: ${subject} | Shorthand token: ${shorthand}\n`);
        return (mappedSubject && normalizeSearchText(mappedSubject) === normalizeSearchText(subject)) 
        || normalizeSearchText(subject) === normalizeSearchText(shorthand); // Adding this just incase a shorthand is exactly a subject. Should fix the issue with Vancouver not showing CS courses when typing "CS"
    }

    /** Classifies a section as open, near-capacity, or full.
     * @param {Object} section - Section with available and total seats.
     * @returns {string} Availability category.
     */
    function getSectionAvailability(section) {
        const fillFactor = 1 - Number(section.seats_available)/Number(section.seats_total); // Dont ask me why
        if (fillFactor >= 1) return 'full';
        if (fillFactor < 1 && fillFactor >= 0.75) return 'near-capacity'; // 75% =< x < 100%
        return 'open'; // Could expand later
    }

    /** Infers delivery mode from meeting text and location.
     * @param {Object} section - Section with days, time, and location.
     * @returns {string} `arranged`, `online`, or `in-person`.
     */
    function getSectionDelivery(section) {
        const meeting = `${text(section && section.days)} ${text(section && section.time)}`.toLowerCase();
        const location = text(section && section.location).toLowerCase();
        if (/\b(arr|arranged|tba)\b/.test(meeting)) return 'arranged';
        if (/\b(online|web|virtual|zoom)\b/.test(`${meeting} ${location}`)) return 'online';
        return 'in-person';
    }

    /** Reads the UCORE designation used by filtering.
     * @param {Object} section - Normalized section.
     * @returns {string} UCORE code or an empty string.
     */
    function getSectionUcore(section) {
        return section.ucore;
    }

    /** Returns explicit meetings or a fallback meeting from days/time fields.
     * @param {Object} section - Section record.
     * @returns {Object[]} Meeting records.
     */
    function sectionMeetings(section) {
        if (Array.isArray(section && section.meetings) && section.meetings.length) {
            return section.meetings;
        }
        return [{
            days: text(section && section.days),
            time: text(section && section.time)
        }];
    }

    /** Converts day abbreviations into normalized weekday letters.
     * @param {string} days - Day text.
     * @returns {string[]} Day letters.
     */
    function meetingDays(days) {
        return text(days)
            .toUpperCase()
            .replace(/TH/g, 'R')
            .replace(/TU/g, 'T')
            .replace(/SA/g, 'S')
            .replace(/SU/g, 'U')
            .replace(/[^MTWRFSU]/g, '')
            .split('');
    }

    /** Extracts a decimal start hour from a time string.
     * @param {string} time - Meeting time text.
     * @returns {number|null} Decimal hour or `null` when invalid.
     */
    function meetingStartHour(time) {
        const match = text(time).match(/\b(\d{1,2}):(\d{2})\b/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return null;
        return hours + minutes / 60;
    }

    /** Maps a meeting start time to a filter time band.
     * @param {string} time - Meeting time text.
     * @returns {string} `morning`, `afternoon`, `evening`, `night`, or empty.
     * @see {@link meetingStartHour}
     */
    function startTimeBand(time) {
        const hour = meetingStartHour(time);
        if (hour === null) return '';
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        if (hour < 21) return 'evening';
        return 'night';
    }

    /** Tests lecture meetings against selected day and time-band filters.
     * @param {Object} section - Lecture section to test.
     * @param {{days: string[], startTimeBands: string[]}} options - Meeting filters.
     * @returns {boolean} Whether at least one meeting matches.
     */
    function lectureMeetingMatches(section, options) {
        const selectedDays = options.days;
        const selectedStartTimeBands = options.startTimeBands;
        if (!selectedDays.length && !selectedStartTimeBands.length) return true;

        return sectionMeetings(section).some(meeting => {
            const matchesDay = !selectedDays.length
                || meetingDays(meeting.days).some(day => selectedDays.includes(day));
            const matchesStartTime = !selectedStartTimeBands.length
                || selectedStartTimeBands.includes(startTimeBand(meeting.time));
            return matchesDay && matchesStartTime;
        });
    }

    /** Scores a course against a normalized text query.
     * @param {Object} course - Normalized course record.
     * @param {string} query - User search query.
     * @returns {{matches: boolean, score: number}} Match result and sort score.
     * @see {@link subjectMatchesShorthand}
     */
    function matchesQuery(course, query) {
        if (!query) return { matches: true, score: 5 };
        const queryText = normalizeSearchText(query);
        const queryCompact = queryText.replace(/\s/g, '');
        const courseCode = normalizeSearchText(course.course_code);
        const courseCodeCompact = courseCode.replace(/\s/g, '');
        const courseTitle = normalizeSearchText(course.course_name);
        const queryTokens = queryText.split(' ');
        const shorthandTokens = queryTokens.filter(token => SUBJECT_SHORTHANDS.has(token));
        const regularTokens = queryTokens.filter(token => !SUBJECT_SHORTHANDS.has(token));
        const shorthandMatches = shorthandTokens.every(token => (
            subjectMatchesShorthand(course.subject, token)
        ));
        const searchable = normalizeSearchText([
            course.subject,
            course.course_number,
            course.course_code,
            course.course_name
        ].join(' '));
        const matches = shorthandMatches && regularTokens.every(token => searchable.includes(token));
        if (!matches) return { matches: false, score: Infinity };
        if (
            shorthandTokens.length
            && regularTokens.length === 1
            && String(course.course_number) === regularTokens[0]
        ) return { matches: true, score: 0 };
        if (queryText === courseCode || queryCompact === courseCodeCompact) return { matches: true, score: 0 };
        if (String(course.course_number) === queryText) return { matches: true, score: 1 };
        if (courseCode.startsWith(queryText)) return { matches: true, score: 2 };
        if (courseTitle.startsWith(queryText)) return { matches: true, score: 3 };
        if (courseTitle.includes(queryText)) return { matches: true, score: 4 };
        return { matches: true, score: 5 };
    }

/** Tests section-level availability, delivery, and UCORE filters.
 * @param {Object} section - Section to test.
 * @param {{availability: string[], delivery: string[], ucore: string[]}} options - Filter options.
 * @returns {boolean} Whether the section satisfies all selected filters.
 * @see {@link getSectionAvailability}
 * @see {@link getSectionDelivery}
 */
function sectionMatches(section, options) {
    const availability = getSectionAvailability(section);
    const delivery = getSectionDelivery(section);
    const ucore = getSectionUcore(section);

    if (options.availability.length) {
        if (options.availability.includes('openOnly')) { // openOnly acts like the 'hey I just want anything not full' filter
            if (availability === 'full') return false;
        } else if (!options.availability.includes(availability)) { // o.w, match the filter exactly.
            return false;
        }
    }

    if (options.delivery.length && !options.delivery.includes(delivery)) { // can be generic
        return false;
    }

    if (options.ucore.length) {
        if (options.ucore.includes('ANY')) { // if 'any' is selected as an option, then all we care about is that the class is a Ucore
            if (ucore === '') return false;
        } else if (!options.ucore.includes(ucore)) { // o.w, match for the exact ucore.
            return false;
        }
    }

    return true;
}

    /** Filters, scores, sorts, and limits normalized course results.
     * @param {Object[]} courses - Courses to search.
     * @param {Object} [filters={}] - Query and section filter arrays.
     * @returns {Object[]} Matching courses with only matching sections retained.
     * @see {@link matchesQuery}
     * @see {@link sectionMatches}
     * @see {@link lectureMeetingMatches}
     */
    function filterCourses(courses, filters) {
        const options = filters || {};
        const query = text(options.q).toLowerCase();
        const sectionOptions = {
            availability: Array.isArray(options.availability) ? options.availability : [],
            delivery: Array.isArray(options.delivery) ? options.delivery : [],
            ucore: Array.isArray(options.ucore) ? options.ucore : [],
        };
        const lectureMeetingOptions = {
            days: Array.isArray(options.days) ? options.days : [],
            startTimeBands: Array.isArray(options.startTimeBands) ? options.startTimeBands : [],
        };

        return (Array.isArray(courses) ? courses : [])
            .map(course => {
                const queryMatch = matchesQuery(course, query);
                if (!queryMatch.matches) return null;

                const lectureSections = course.lecture_sections.filter(section => (
                    sectionMatches(section, sectionOptions)
                    && lectureMeetingMatches(section, lectureMeetingOptions)
                ));
                const labSections = course.lab_sections.filter(section => sectionMatches(section, sectionOptions));
                if (!lectureSections.length || (course.has_required_lab && !labSections.length)) return null;

                return {
                    ...course,
                    lecture_sections: lectureSections,
                    lab_sections: labSections,
                    _searchScore: queryMatch.score
                };
            })
            .filter(Boolean)
            .sort((left, right) => (
                left._searchScore - right._searchScore
                || text(left.course_code).localeCompare(text(right.course_code))
            ))
            .map(({ _searchScore, ...course }) => course)
            .slice(0, options.limit || RESULT_LIMIT);
    }

    /** Indexes lecture and lab sections by section ID for schedule hydration.
     * @param {Object[]} courses - Normalized courses.
     * @returns {Map<string, {course: Object, section: Object}>} Section lookup map.
     */
    function indexSections(courses) {
        const sectionsBySln = new Map();
        courses.forEach(course => {
            [...course.lecture_sections, ...course.lab_sections].forEach(section => {
                sectionsBySln.set(String(section.section_id), { course, section });
            });
        });
        return sectionsBySln;
    }

    /** Fetches, normalizes, indexes, and caches one term dataset.
     * @param {string} key - Dataset term key.
     * @param {{reload?: boolean, signal?: AbortSignal}} [options={}] - Cache and fetch options.
     * @returns {Promise<{key: string, courses: Object[], sectionsBySln: Map}>} Normalized dataset.
     * @see {@link normalizePayload}
     * @see {@link indexSections}
     */
    async function fetchDatasetByKey(key, options) {
        const requestOptions = options || {};
        if (!requestOptions.reload && courseCache.has(key)) return courseCache.get(key);

        const response = await fetch(`${API_BASE_URL}courses/${slugify(key)}.json`, {
            signal: requestOptions.signal
        });

        if (!response.ok) {
            throw new Error(`Course data request failed with status ${response.status}.`);
        }

        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            throw new Error('Course data response was not valid JSON.');
        }

        const courses = normalizePayload(payload);
        courses.forEach(course => {
            course.term_slug = key;
            [...course.lecture_sections, ...course.lab_sections].forEach(section => {
                section.term_slug = key;
                section.section_key = sectionKey(key, section.section_id);
            });
        });
        const dataset = { key, courses, sectionsBySln: indexSections(courses) };
        courseCache.set(key, dataset);
        return dataset;
    }

    /** Fetches a dataset using normalized campus and term identifiers.
     * @param {string} campus - Campus identifier.
     * @param {string} term - Term identifier.
     * @param {Object} [options] - Options forwarded to {@link fetchDatasetByKey}.
     * @returns {Promise<Object>} Normalized dataset.
     * @see {@link datasetKey}
     */
    async function fetchDataset(campus, term, options) {
        return fetchDatasetByKey(datasetKey(campus, term), options);
    }

    /** Fetches a campus/term dataset and returns its course list.
     * @param {string} campus - Campus identifier.
     * @param {string} term - Term identifier.
     * @param {Object} [options] - Fetch/cache options.
     * @returns {Promise<Object[]>} Normalized courses.
     * @see {@link fetchDataset}
     */
    async function fetchCourses(campus, term, options) {
        const dataset = await fetchDataset(campus, term, options);
        return dataset.courses;
    }

    window.CourseApi = {
        campusTermUrl,
        datasetKey,
        fetchDataset,
        fetchDatasetByKey,
        fetchCourses,
        filterCourses,
        getSectionAvailability,
        getSectionDelivery,
        getSectionUcore,
        lectureMeetingMatches,
        meetingDays,
        startTimeBand,
        sectionKey,
        normalizePayload,
        normalizeCourse,
        normalizeSection,
        subjectShorthands: SUBJECT_SHORTHANDS
    };
})(window);
