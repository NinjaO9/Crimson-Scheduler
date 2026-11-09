/**
 * @fileoverview Logic behind schedule generation
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { CourseApi } from "../course_api";
import { CatalogCourse } from "../types";
import { getActiveSchedule, getScheduleById } from "./schedule-state";

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

export async function testthisshit()
{
    const active_schedule = getActiveSchedule();
    if (active_schedule === null) return;
    const result = await getCoursesFromSchedule(active_schedule.id)
    result.forEach((course) => console.log(`${course.course_name}`));
}
