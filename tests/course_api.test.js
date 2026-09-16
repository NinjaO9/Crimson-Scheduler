import { beforeEach, describe, expect, it, vi } from 'vitest';

await import('../web/classes/static/js/course_api.js');

const api = window.CourseApi;

describe('CourseApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('normalizes course payloads and separates lecture and lab sections', () => {
        const courses = api.normalizePayload({
            subjects: [{
                subject: 'CPT_S',
                courses: [{
                    courseNumber: 121,
                    courseName: 'Programming Methods',
                    credits: 3,
                    hasRequiredLab: true,
                    sections: [
                        {
                            sectionId: '1001',
                            courseCode: 'CPT_S 121',
                            sectionNumber: 1,
                            isLab: false,
                            days: 'MWF',
                            time: '10:00 - 10:50',
                        },
                        {
                            sln: 1002,
                            sectionNumber: 2,
                            isLab: true,
                            days: 'T',
                            time: '11:00 - 11:50',
                        },
                    ],
                }],
            }],
        });

        expect(courses).toHaveLength(1);
        expect(courses[0].course_code).toBe('CPT_S 121');
        expect(courses[0].lecture_sections).toHaveLength(1);
        expect(courses[0].lab_sections).toHaveLength(1);
        expect(courses[0].lab_sections[0].credits).toBe('0');
    });

    it('builds stable campus-term keys and URLs', () => {
        expect(api.datasetKey('Main Campus', 'Fall 2026')).toBe('main-campus-fall-2026');
        expect(api.campusTermUrl('Main Campus', 'Fall 2026'))
            .toBe('https://ninjao9.github.io/Crimson-Scheduler/api/v1/courses/main-campus-fall-2026.json');
    });

    it('ranks exact course-code matches before title matches', () => {
        const courses = api.normalizePayload({
            subjects: [{
                subject: 'CPT_S',
                courses: [
                    { courseNumber: 121, courseName: 'Programming Methods', sections: [{ sln: 1 }] },
                    { courseNumber: 221, courseName: 'CPT_S 121 Topics', sections: [{ sln: 2 }] },
                ],
            }],
        });

        expect(api.filterCourses(courses, { q: 'CPT_S 121' }).map(course => course.course_number))
            .toEqual([121, 221]);
    });

    it('filters sections by availability and delivery', () => {
        const courses = api.normalizePayload({
            subjects: [{
                subject: 'TEST',
                courses: [{
                    courseNumber: 100,
                    sections: [
                        { sln: 1, seats: { available: 2 }, days: 'M', time: '10:00 - 11:00' },
                        { sln: 2, seats: { available: 0 }, days: 'ARR', time: 'ARR' },
                    ],
                }],
            }],
        });

        const open = api.filterCourses(courses, { q: 'TEST', openOnly: true });
        expect(open[0].lecture_sections.map(section => section.section_id)).toEqual(['1']);
        const arranged = api.filterCourses(courses, { q: 'TEST', delivery: ['arranged'] });
        expect(arranged[0].lecture_sections.map(section => section.section_id)).toEqual(['2']);
    });

    it('returns an empty result for malformed payloads', () => {
        expect(api.normalizePayload(null)).toEqual([]);
        expect(api.normalizePayload({ subjects: 'invalid' })).toEqual([]);
    });

    it('caches successful fetches and surfaces failed responses', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ subjects: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await api.fetchDatasetByKey('test-term-cache');
        await api.fetchDatasetByKey('test-term-cache');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
        await expect(api.fetchDatasetByKey('test-term-failure')).rejects
            .toThrow('Course data request failed with status 503.');
    });
});
