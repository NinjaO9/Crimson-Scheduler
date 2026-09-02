(function(window) {
    'use strict';

    const API_BASE_URL = 'https://ninjao9.github.io/Crimson-Scheduler/api/v1/';
    const courseCache = new Map();

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function campusTermUrl(campus, term) {
        return `${API_BASE_URL}courses/${slugify(campus)}-${slugify(term)}.json`;
    }

    function datasetKey(campus, term) {
        return `${slugify(campus)}-${slugify(term)}`;
    }

    function text(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        return String(value).trim();
    }

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
            credits: section && section.isLab ? '0' : text(section && section.credits, text(course && course.credits, '0')),
            is_lab: Boolean(section && section.isLab),
            component: text(section && section.component, 'Lecture')
        };
    }

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
            lab_sections: normalizedSections.filter(section => section.is_lab)
        };
    }

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

    function includes(value, query) {
        return text(value).toLowerCase().includes(text(query).toLowerCase());
    }

    function filterCourses(courses, filters) {
        const options = filters || {};
        const query = text(options.q).toLowerCase();
        const subject = text(options.subject).toLowerCase();
        const number = text(options.number).toLowerCase();

        return (Array.isArray(courses) ? courses : [])
            .filter(course => {
                if (subject && !includes(course.subject, subject)) return false;
                if (number && !includes(course.course_number, number)) return false;
                if (query && ![
                    course.course_name,
                    course.subject,
                    course.course_number,
                    course.course_code
                ].some(value => includes(value, query))) return false;
                return true;
            })
            .slice(0, options.limit || 10);
    }

    function toScheduleEntry(section, scheduleGroupId) {
        return {
            section_id: text(section && section.section_id),
            term_slug: text(section && section.term_slug),
            schedule_group_id: scheduleGroupId || null,
            course_code: text(section && section.course_code),
            course_name: text(section && section.course_name),
            section_num: section && section.section_num,
            instructor: text(section && section.instructor),
            location: text(section && section.location),
            days: text(section && section.days),
            time: text(section && section.time),
            seats: text(section && section.seats),
            credits: section && section.is_lab ? '0' : text(section && section.credits, '0'),
            is_lab: Boolean(section && section.is_lab),
            component: text(section && section.component, 'lecture')
        };
    }

    function indexSections(courses) {
        const sectionsBySln = new Map();
        courses.forEach(course => {
            [...course.lecture_sections, ...course.lab_sections].forEach(section => {
                sectionsBySln.set(String(section.section_id), { course, section });
            });
        });
        return sectionsBySln;
    }

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
            });
        });
        const dataset = { key, courses, sectionsBySln: indexSections(courses) };
        courseCache.set(key, dataset);
        return dataset;
    }

    async function fetchDataset(campus, term, options) {
        return fetchDatasetByKey(datasetKey(campus, term), options);
    }

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
        toScheduleEntry,
        normalizePayload,
        normalizeCourse,
        normalizeSection
    };
})(window);
