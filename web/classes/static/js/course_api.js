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
                if (subject && text(course.subject).toLowerCase() !== subject) return false;
                if (number && !includes(course.course_number, number)) return false;
                if (query && query.length >= 2 && ![
                    course.course_name,
                    course.subject,
                    course.course_number,
                    course.course_code
                ].some(value => includes(value, query))) return false;
                return true;
            })
            .slice(0, options.limit || 10);
    }

    async function fetchCourses(campus, term, options) {
        const requestOptions = options || {};
        const cacheKey = `${slugify(campus)}|${slugify(term)}`;
        if (!requestOptions.reload && courseCache.has(cacheKey)) {
            return courseCache.get(cacheKey);
        }

        const response = await fetch(campusTermUrl(campus, term), {
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
        courseCache.set(cacheKey, courses);
        return courses;
    }

    window.CourseApi = {
        campusTermUrl,
        fetchCourses,
        filterCourses,
        normalizePayload,
        normalizeCourse,
        normalizeSection
    };
})(window);
