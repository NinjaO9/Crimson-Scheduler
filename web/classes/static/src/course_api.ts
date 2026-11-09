import type {
    CatalogCourse, Course, CourseApi as CourseApiContract, CourseDataset,
    CourseFilters, Meeting, RawCatalogPayload, RawCourse, RawSection,
    Section, SectionIndexEntry,
} from "./types.js";

/**
 * @fileoverview Loads, normalizes, caches, and filters published course catalog data.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

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
     * @param value - Text to normalize.
     * @returns Hyphen-separated slug.
     */
    function slugify(value: string): string {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    /** Builds the published JSON URL for a campus/term dataset.
     * @param campus - Campus identifier.
     * @param term - Term identifier.
     * @returns Dataset URL.
     * @see {@link slugify}
     */
    function campusTermUrl(campus: string, term: string): string {
        return `${API_BASE_URL}courses/${slugify(campus)}-${slugify(term)}.json`;
    }

    /** Creates the cache key shared by dataset fetches.
     * @param campus - Campus identifier.
     * @param term - Term identifier.
     * @returns Normalized dataset key.
     */
    function datasetKey(campus: string, term: string): string {
        return `${slugify(campus)}-${slugify(term)}`;
    }

    /** Converts nullable values to trimmed text with a fallback.
     * @param value - Value to convert.
     * @param [fallback=''] - Text used for nullish input.
     * @returns Trimmed text.
     */
    function text(value: unknown, fallback = ''): string {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

    /** Creates a stable term/section lookup key.
     * @param termSlug - Term slug.
     * @param sectionId - Section identifier.
     * @returns Composite section key.
     */
    function sectionKey(termSlug: string, sectionId: string | number): string {
        return `${slugify(termSlug)}:${text(sectionId)}`;
    }

    /** Shallow-copies arrays and objects so normalized data is detached from the payload.
     * @param value - Value to copy.
     * @param fallback - Value used for nullish input.
     * @returns Copied value or fallback.
     */
    function copyValue(value: unknown, fallback: unknown): unknown {
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

    /** Normalizes explicit meeting records from a raw catalog section.
     * @param meetings - Raw `meetings` payload value.
     * @returns Normalized meeting records.
     */
    function normalizeMeetings(meetings: unknown): Meeting[] {
        if (!Array.isArray(meetings)) return [];
        return meetings
            .filter(meeting => meeting && typeof meeting === 'object')
            .map(meeting => ({
                days: text(meeting.days),
                time: text(meeting.time),
            }))
            .filter(meeting => meeting.days || meeting.time);
    }

    /** Normalizes one raw catalog section into the UI's section schema.
     * @param section - Raw section payload.
     * @param course - Parent raw course payload.
     * @param index - Section index used for fallback IDs.
     * @returns Normalized section record.
     * @see {@link copyValue}
     */
    function normalizeSection(section: RawSection, course: RawCourse, index: number): Section {
        const seats = section && section.seats ? section.seats : {};
        const sectionId = text(section && (section.sectionId || section.sln), `section-${index}`);

        return {
            section_id: sectionId,
            course_code: text(section && section.courseCode, text(course && course.courseCode)),
            course_name: text(section && section.courseName, text(course && (course.courseName || course.course))),
            section_num: section && section.sectionNumber,
            instructor: text(section && section.instructor),
            location: text(section && section.location),
            seats: text(seats.label, `${text(seats.taken, '')}/${text(seats.total, '')}`),
            seats_available: Number(seats.available),
            seats_total: Number(seats.total),
            credits: section && section.isLab ? '0' : text(section && section.credits, text(course && course.credits, '0')),
            is_lab: Boolean(section && section.isLab),
            ucore: text(section && section.ucore, ''),
            component: text(section && section.component, 'Lecture'),
            meetings: normalizeMeetings(section && section.meetings),
            instructors: Array.isArray(section?.instructors) ? section.instructors : [],
            coop: Boolean(section && section.coop !== undefined ? section.coop : false),
            footnotes: text(copyValue(section && section.footnotes, ""), ""),
            dates: {
                start: text(section && section.dates && section.dates.start),
                end: text(section && section.dates && section.dates.end)
            }
        };
    }

    /** Normalizes a raw course and separates lecture and lab sections.
     * @param course - Raw course payload.
     * @param subjectName - Subject inherited from the payload group.
     * @param index - Stable index used in the course ID.
     * @returns Normalized course record.
     * @see {@link normalizeSection}
     */
    function normalizeCourse(course: RawCourse, subjectName: string, index: string | number): Course {
        const sections: RawSection[] = Array.isArray(course?.sections) ? course.sections : [];
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
     * @param payload - Raw catalog payload.
     * @returns Normalized courses, or an empty array for invalid payloads.
     * @see {@link normalizeCourse}
     */
    function normalizePayload(payload: unknown): Course[] {
        if (!payload || typeof payload !== 'object' || !('subjects' in payload) || !Array.isArray(payload.subjects)) return [];

        return (payload as RawCatalogPayload).subjects!.reduce<Course[]>((courses, subject) => {
            const subjectName = text(subject && subject.subject);
            const subjectCourses: RawCourse[] = Array.isArray(subject?.courses) ? subject.courses : [];
            subjectCourses.forEach((course, index) => {
                courses.push(normalizeCourse(course, subjectName, `${courses.length}-${index}`));
            });
            return courses;
        }, []);
    }

    /** Produces canonical searchable text for query matching.
     * @param value - Value to normalize.
     * @returns Lowercase alphanumeric search text.
     */
    function normalizeSearchText(value: unknown): string {
        return text(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    /** Checks whether a subject matches a configured shorthand.
     * @param subject - Full subject name/code.
     * @param shorthand - User-entered shorthand.
     * @returns Whether the shorthand maps to the subject.
     * @see {@link normalizeSearchText}
     */
    function subjectMatchesShorthand(subject: string, shorthand: string): boolean {
        const mappedSubject = SUBJECT_SHORTHANDS.get(shorthand);
        return (mappedSubject && normalizeSearchText(mappedSubject) === normalizeSearchText(subject)) 
        || normalizeSearchText(subject) === normalizeSearchText(shorthand); // Adding this just incase a shorthand is exactly a subject. Should fix the issue with Vancouver not showing CS courses when typing "CS"
    }

    /** Classifies a section as open, near-capacity, or full.
     * @param section - Section with available and total seats.
     * @returns Availability category.
     */
    function getSectionAvailability(section: Section): string {
        const fillFactor = 1 - Number(section.seats_available)/Number(section.seats_total); // Dont ask me why
        if (fillFactor >= 1) return 'full';
        if (fillFactor < 1 && fillFactor >= 0.75) return 'near-capacity'; // 75% =< x < 100%
        return 'open'; // Could expand later
    }

    /** Infers delivery mode from meeting records and location.
     * @param section - Section with meetings and location.
     * @returns `arranged`, `online`, or `in-person`.
     */
    function getSectionDelivery(section: Section): string {
        const meeting = sectionMeetings(section)
            .map(({ days, time }) => `${text(days)} ${text(time)}`)
            .join(' ')
            .toLowerCase();
        const location = text(section && section.location).toLowerCase();
        if (/\b(arr|arranged|tba)\b/.test(meeting)) return 'arranged';
        if (/\b(online|web|virtual|zoom)\b/.test(`${meeting} ${location}`)) return 'online';
        return 'in-person';
    }

    /** Reads the UCORE designation used by filtering.
     * @param section - Normalized section.
     * @returns UCORE code or an empty string.
     */
    function getSectionUcore(section: Section): string {
        return section.ucore;
    }

    /** Returns normalized explicit meetings.
     * @param section - Section record.
     * @returns Meeting records.
     */
    function sectionMeetings(section: Section): Meeting[] {
        return Array.isArray(section && section.meetings) ? section.meetings : [];
    }

    /** Converts day abbreviations into normalized weekday letters.
     * @param days - Day text.
     * @returns Day letters.
     */
    function meetingDays(days: string): string[] {
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
     * @param time - Meeting time text.
     * @returns Decimal hour or `null` when invalid.
     */
    function meetingStartHour(time: string): number | null {
        const match = text(time).match(/\b(\d{1,2}):(\d{2})\b/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return null;
        return hours + minutes / 60;
    }

    /** Maps a meeting start time to a filter time band.
     * @param time - Meeting time text.
     * @returns `morning`, `afternoon`, `evening`, `night`, or empty.
     * @see {@link meetingStartHour}
     */
    function startTimeBand(time: string): string {
        const hour = meetingStartHour(time);
        if (hour === null) return '';
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        if (hour < 21) return 'evening';
        return 'night';
    }

    /** Tests lecture meetings against selected day and time-band filters.
     * @param section - Lecture section to test.
     * @param options - Meeting filters.
     * @returns Whether at least one meeting matches.
     */
    function lectureMeetingMatches(section: Section, options: { days: string[]; startTimeBands: string[] }): boolean {
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
     * @param course - Normalized course record.
     * @param query - User search query.
     * @returns Match result and sort score.
     * @see {@link subjectMatchesShorthand}
     */
    function matchesQuery(course: CatalogCourse, query: string): { matches: boolean; score: number } {
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
 * @param section - Section to test.
 * @param options - Filter options.
 * @returns Whether the section satisfies all selected filters.
 * @see {@link getSectionAvailability}
 * @see {@link getSectionDelivery}
 */
function sectionMatches(section: Section, options: { availability: string[]; delivery: string[]; ucore: string[] }): boolean {
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
     * @param courses - Courses to search.
     * @param [filters={}] - Query and section filter arrays.
     * @returns Matching courses with only matching sections retained.
     * @see {@link matchesQuery}
     * @see {@link sectionMatches}
     * @see {@link lectureMeetingMatches}
     */
    function filterCourses(courses: CatalogCourse[], filters: CourseFilters = {}): CatalogCourse[] {
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
            .filter((course): course is NonNullable<typeof course> => Boolean(course))
            .sort((left, right) => (
                left._searchScore - right._searchScore
                || text(left.course_code).localeCompare(text(right.course_code))
            ))
            .map((course) => {
                const result = { ...course };
                Reflect.deleteProperty(result, "_searchScore");
                return result;
            })
            .slice(0, options.limit || RESULT_LIMIT);
    }

    /** Indexes lecture and lab sections by section ID for schedule hydration.
     * @param courses - Normalized courses.
     * @returns Section lookup map.
     */
    function indexSections(courses: CatalogCourse[]): Map<string, SectionIndexEntry> {
        const sectionsBySln = new Map<string, SectionIndexEntry>();
        courses.forEach(course => {
            [...course.lecture_sections, ...course.lab_sections].forEach(section => {
                sectionsBySln.set(String(section.section_id), { course, section });
            });
        });
        return sectionsBySln;
    }

    /** Fetches, normalizes, indexes, and caches one term dataset.
     * @param key - Dataset term key.
     * @param [options={}] - Cache and fetch options.
     * @returns Normalized dataset.
     * @see {@link normalizePayload}
     * @see {@link indexSections}
     */
    async function fetchDatasetByKey(key: string, options: { reload?: boolean; signal?: AbortSignal } = {}): Promise<CourseDataset> {
        const requestOptions = options || {};
        if (!requestOptions.reload && courseCache.has(key)) return courseCache.get(key);

        const response = await fetch(`${API_BASE_URL}courses/${slugify(key)}.json`, {
            signal: requestOptions.signal
        });

        if (!response.ok) {
            throw new Error(`Course data request failed with status ${response.status}.`);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new Error('Course data response was not valid JSON.');
        }

        const courses: CatalogCourse[] = normalizePayload(payload).map((course) => ({
            ...course,
            term_slug: key,
            lecture_sections: course.lecture_sections.map((section) => ({
                ...section,
                term_slug: key,
                section_key: sectionKey(key, section.section_id),
            })),
            lab_sections: course.lab_sections.map((section) => ({
                ...section,
                term_slug: key,
                section_key: sectionKey(key, section.section_id),
            })),
        }));
        const dataset = { key, courses, sectionsBySln: indexSections(courses) };
        courseCache.set(key, dataset);
        return dataset;
    }

    /** Fetches a dataset using normalized campus and term identifiers.
     * @param campus - Campus identifier.
     * @param term - Term identifier.
     * @param [options] - Options forwarded to {@link fetchDatasetByKey}.
     * @returns Normalized dataset.
     * @see {@link datasetKey}
     */
    async function fetchDataset(campus: string, term: string, options?: { reload?: boolean; signal?: AbortSignal }): Promise<CourseDataset> {
        return fetchDatasetByKey(datasetKey(campus, term), options);
    }

    /** Fetches a campus/term dataset and returns its course list.
     * @param campus - Campus identifier.
     * @param term - Term identifier.
     * @param [options] - Fetch/cache options.
     * @returns Normalized courses.
     * @see {@link fetchDataset}
     */
    async function fetchCourses(campus: string, term: string, options?: { reload?: boolean; signal?: AbortSignal }): Promise<CatalogCourse[]> {
        const dataset = await fetchDataset(campus, term, options);
        return dataset.courses;
    }

    export const CourseApi: CourseApiContract = {
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
