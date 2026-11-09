/**
 * @fileoverview Logic behind schedule generation
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { CourseApi } from "../course_api";
import { CatalogCourse, SchedulableSection } from "../types";
import { getActiveSchedule, getScheduleById } from "./schedule-state";
import { parseDaysToIndexes, parseTimeRange } from "./time-and-meetings";

interface SectionCombination {
    lecture? : SchedulableSection;
    lab? : SchedulableSection;
}

interface EnrichedCatalogCourse extends CatalogCourse {
    sectionCombinations : SectionCombination[];
}

/**
 * Finds all courses in a given schedule.
 * @param schedule_id - Schedule to derive courses from.
 * @returns Set of courses discovered in a schedule.
 */
async function getCoursesFromSchedule(schedule_id: string): Promise<Set<CatalogCourse>>
{
    const schedule = getScheduleById(schedule_id);
    if (schedule === null) return new Set<CatalogCourse>;
    const coursePromises = schedule.section_refs.map(
        (section_ref) => CourseApi.findCourseFromSection(section_ref.term_slug, section_ref.section_id)
    );


    const courses = new Set((await Promise.all(coursePromises)).filter((course) => course !== null));

    return courses ?? [];
}

/**
 * Given two sections, checks for a conflict.
 * @param lecture
 * @param lab 
 * @returns 
 */
function checkForSectionConflicts(lecture : SchedulableSection, lab : SchedulableSection): boolean
{
    for (const lectureMeeting of lecture.meetings) 
    {
        const lectureDays = parseDaysToIndexes(lectureMeeting.days);
        const lectureRange = parseTimeRange(lectureMeeting.time);
        if (!lectureDays || !lectureRange) continue;

        for (const labMeeting of lab.meetings)
        {
            const labDays = parseDaysToIndexes(labMeeting.days);
            const labRange = parseTimeRange(labMeeting.time);

            const sharesDay = lectureDays.some((day) => labDays.includes(day));
            if (!sharesDay) continue;
            if (!labRange) continue;

            const overlaps = lectureRange.start < labRange.end && labRange.start < lectureRange.end;

            if (overlaps) return true;
        }
    }
    return false;
}

/**
 * Finds the number of lecture-lab combinations that a course has.
 * @param course - course to be investigated.
 */
function findSectionCombinations(course : CatalogCourse) : SectionCombination[]
{
    let combinations : SectionCombination[] = [];

    course.lecture_sections.forEach((lectureSection) =>{
        if (!course.lab_sections.length)
        {
            combinations.push({lecture: lectureSection});
        }
        else
        {
            course.lab_sections.forEach((labSection) => {
            if (!checkForSectionConflicts(lectureSection, labSection))
            {
                combinations.push({lecture: lectureSection, lab: labSection} as SectionCombination);
            }
            })
        }
    })
    return combinations;
}

/**
 * Enriches a set of courses with extra information for algorithmic reasons.
 * @param courses - Set of courses to be modified.
 * @returns Set of enriched courses.
 */
function enrichCatalogCourses(courses : Set<CatalogCourse>) : Set<EnrichedCatalogCourse>
{
    let eCourses : Set<EnrichedCatalogCourse> = new Set<EnrichedCatalogCourse>;

    courses.forEach((course) => {
        eCourses.add({
            ...course,
            sectionCombinations : findSectionCombinations(course)
        } as EnrichedCatalogCourse);
    })
    return eCourses;
}

export async function testthisshit()
{
    const active_schedule = getActiveSchedule();
    if (active_schedule === null) return;
    const result = await getCoursesFromSchedule(active_schedule.id)
    const eResult = enrichCatalogCourses(result);
    eResult.forEach((eCourse) => {
        console.log(`${eCourse.course_name}`);
        console.log(eCourse.sectionCombinations);
    })
}
