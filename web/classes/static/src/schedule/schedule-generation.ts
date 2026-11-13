/**
 * @fileoverview Logic behind schedule generation
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { CourseApi } from "../course_api";
import { CatalogCourse, SchedulableSection, SectionReference } from "../types";
import { addSchedule, getActiveSchedule, getScheduleById } from "./schedule-state";
import { parseDaysToIndexes, parseTimeRange } from "./time-and-meetings";
import { refreshScheduleSelector } from "./schedule-selector";
import { Heap } from "../heap";
const DAY_START = 0;
const DAY_END = 1439; // 1440 min in day (-1 for array indexing)
const WORD_COUNT = 45; // 32 * 45 = 1440 (minutes in day)
const DAYS_COUNT = 7;
const SCHEDULE_AVAILABILITY_MAP = Array.from({ length: DAYS_COUNT }, () => new Uint32Array(WORD_COUNT));
const K = 3;
const TOP_K_SCHEDULES = new Heap<ScheduleContender>((a, b) => a.score - b.score, K); // Max heap to store best K schedules

interface SectionCombination {
    lecture? : SchedulableSection;
    lab? : SchedulableSection;
    occupancy : Uint32Array[];
}

interface EnrichedCatalogCourse extends CatalogCourse {
    sectionCombinations : SectionCombination[];
}

interface ScheduleContender {
    sectionrefs: SectionReference[];
    score : number;
}

/**
 * Clamps a number between two values
 * @param val - value to be clamped
 * @param min - minimum value
 * @param max - maximum value
 * @returns The clamped number
 */
function clamp(val : number, min : number, max : number) : number
{
    val = Math.max(val, min);
    val = Math.min(val, max);
    return val;
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
 * @param sectionA
 * @param sectionB 
 * @returns 
 */
function checkForSectionConflicts(sectionA? : SchedulableSection, sectionB? : SchedulableSection): boolean
{
    if (sectionA === undefined || sectionB === undefined) return false;
    for (const sectionAMeeting of sectionA.meetings) 
    {
        const sectionADays = parseDaysToIndexes(sectionAMeeting.days);
        const sectionARange = parseTimeRange(sectionAMeeting.time);
        if (!sectionADays || !sectionARange) continue;

        for (const sectionBMeeting of sectionB.meetings)
        {
            const sectionBDays = parseDaysToIndexes(sectionBMeeting.days);
            const sesctionBRange = parseTimeRange(sectionBMeeting.time);

            const sharesDay = sectionADays.some((day) => sectionBDays.includes(day));
            if (!sharesDay) continue;
            if (!sesctionBRange) continue;

            const overlaps = sectionARange.start < sesctionBRange.end && sesctionBRange.start < sectionARange.end;

            if (overlaps) return true;
        }
    }
    return false;
}

/**
 * Generates a bitset representing the minutes of the day that a meeting takes up.
 * @param startTime - Start time from midnight that the class starts
 * @param endTime - End time from midnight that the class ends
 * @returns A bitset that represents the time the meeting takes up.
 */
function getDailyBitset(startTime : number, endTime : number) : Uint32Array
{
    startTime = clamp(startTime, DAY_START, DAY_END);
    endTime = clamp(endTime, DAY_START, DAY_END);
    const bitset = new Uint32Array(WORD_COUNT);

    for (let minute = startTime; minute < endTime; minute++)
    {
        const word = Math.floor(minute/32); // Find the word (index) we are modifying
        const bit = minute % 32; // specific bit to modify in word
        bitset[word] |= (1<< bit); // occupy the bits that are taking up this word
    }
    return bitset;

}

/**
 * Generates a bitset that resembles the time a course section takes up in a week.
 * @param section - The section that a bitset is being generated for.
 * @returns A list of bitsets, where each bitset is a day representing how a course takes up time in said day.
 * @see {@link getDailyBitset}
 */
function getSectionBitset(section : SchedulableSection) : Uint32Array[]
{
    const sectionBitset: Uint32Array[] = Array.from({ length: DAYS_COUNT }, () => new Uint32Array(WORD_COUNT));

    section.meetings.forEach((meeting) => {
        const days = parseDaysToIndexes(meeting.days);
        const times = parseTimeRange(meeting.time);
        if (times === null) return;
        days.forEach((day) => {
            const dayBitset = getDailyBitset(times!.start, times!.end);
            for (let i = 0; i < WORD_COUNT; i++)
            {
                sectionBitset[day][i] |= dayBitset[i];
            }
        })
    })

    return sectionBitset;
}

/**
 * Finds all valid lecture-lab combinations that a course has.
 * @param course - course to be investigated.
 */
function findSectionCombinations(course : CatalogCourse) : SectionCombination[]
{
    const combinations : SectionCombination[] = [];

    if (!course.lecture_sections.length)
    {
        course.lab_sections.forEach((labSection) => {
            const sectionBitset = getSectionBitset(labSection);
            combinations.push({lab: labSection, occupancy: sectionBitset} as SectionCombination)
        })
        return combinations;
    }

    if (!course.lab_sections.length)
    {
        course.lecture_sections.forEach((lectureSection) => {
            const sectionBitset = getSectionBitset(lectureSection);
            combinations.push({lecture: lectureSection, occupancy: sectionBitset} as SectionCombination)
        })
        return combinations;
    }

    course.lecture_sections.forEach((lectureSection) =>{

        const lecBitset: Uint32Array[] = getSectionBitset(lectureSection);

        course.lab_sections.forEach((labSection) => { // Theres gotta be a better way for this but I can't think of it right now.
        if (!checkForSectionConflicts(lectureSection, labSection))
        {
            const labBitset: Uint32Array[] = getSectionBitset(labSection);
            const combinationBitset: Uint32Array[] = Array.from({ length: DAYS_COUNT }, () => new Uint32Array(WORD_COUNT));
            
            for (let dayIndex = 0; dayIndex < DAYS_COUNT; dayIndex++)
            {
                for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
                {
                    combinationBitset[dayIndex][wordIndex] |= lecBitset[dayIndex][wordIndex] | labBitset[dayIndex][wordIndex];
                }
            }
            combinations.push({lecture: lectureSection, lab: labSection, occupancy: combinationBitset} as SectionCombination);
        }
        })
    });

    return combinations;
}

/**
 * Enriches a set of courses with extra information for algorithmic reasons.
 * @param courses - Set of courses to be modified.
 * @returns Set of enriched courses.
 */
function enrichCatalogCourses(courses : Set<CatalogCourse>) : Set<EnrichedCatalogCourse>
{
    const eCourses : Set<EnrichedCatalogCourse> = new Set<EnrichedCatalogCourse>;

    courses.forEach((course) => {
        eCourses.add({
            ...course,
            sectionCombinations : findSectionCombinations(course)
        } as EnrichedCatalogCourse);
    })
    return eCourses;
}

/**
 * Determines if a given combination will cause a conflict in the schedule.
 * @param combination - combination to check.
 * @returns 
 */
function checkConflictsWithSchedule(combination : SectionCombination) : boolean
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            if ((SCHEDULE_AVAILABILITY_MAP[day][wordIndex] & combination.occupancy[day][wordIndex]) !== 0) return true;
        }
    }
    return false;
}

/**
 * Population count, counts the amount of 1 bits in a word (represented as a simple number here)
 * https://en.wikipedia.org/wiki/Hamming_weight
 * @param word 
 * @returns 
 */
function popcount32(word : number) : number
{
    // 1. Sum adjacent 1-bit fields into 2-bit fields
    word = word - ((word >> 1) & 0x55555555);
    
    // 2. Sum adjacent 2-bit fields into 4-bit nibbles
    word = (word & 0x33333333) + ((word >> 2) & 0x33333333);
    
    // 3. Sum adjacent 4-bit nibbles into 8-bit bytes
    word = (word + (word >> 4)) & 0x0F0F0F0F;
    
    // 4. Sum all four 8-bit byte totals into the top byte via multiplication
    return ((word * 0x01010101) >>> 0) >>> 24;
}

/**
 * Resets SCHEDULE_AVAILABILITY_MAP back to an empty slate.
 */
function resetScheduleMap()
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] &= 0;
        }
    }
}

/**
 * Removes a combination from the availability bitset.
 * @param combination - combination to remove.
 */
function removeCombinationFromAvailability(combination : SectionCombination) : void
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] ^= combination.occupancy[day][wordIndex];
        }
    }
}

/**
 * Adds a combination from the availability bitset.
 * @param combination - combination to add.
 */
function addCombinationToAvailability(combination : SectionCombination) : void
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] |= combination.occupancy[day][wordIndex];
        }
    }
}

/**
 * Computes the downtime map of the active availability map.
 * @returns - A downtime map (array of downtime numbers)
 */
function getScheduleDowntime()
{
    /*
    Note for other people who may look at this code (extra comments cause I am presenting this)
    - Idea here is that if we can get when classes start and end for the day, along with how much time in the day is allocated to classes
        we can find the downtime. We don't necissarily need to know the details of when downtime is, we just need to know it exists, and how much.
    */

    const downtimeMap : number[] = [0, 0, 0, 0, 0, 0, 0];
    
    for (let day = 0; day < DAYS_COUNT; day++)
    {

        let first = -1;
        let last = -1;
        let occupiedMinutes = 0;
        
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            if (SCHEDULE_AVAILABILITY_MAP[day][wordIndex] === 0) continue;
            occupiedMinutes += popcount32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex]); // "How much time is allocated to classes?"

            if (first === -1)
            {
                first = wordIndex * 32 + (31 - Math.clz32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex] & -SCHEDULE_AVAILABILITY_MAP[day][wordIndex])); // "When do classes first start?"
            }

            last = wordIndex * 32 + (31 - Math.clz32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex])); // "When does our last class end?"
        }

        if (first === -1)
        {
            downtimeMap[day] = 0;
        }
        else
        {
            downtimeMap[day] = (last - first + 1) - occupiedMinutes; // "Given the range between our first and last class, how much of that time is idle?"
        }

    }

    return downtimeMap;
}

/**
 * Converts a collection of SectionCombinations into a single Schedule Contender.
 * @param schedule - Section combinations that will be used to create a schedule.
 * @returns 
 */
function convertCombinationsToScheduleContenders(schedule : SectionCombination[]) : ScheduleContender
{
    const sectionrefs : SectionReference[] = [];

    schedule.forEach((combination) => {
        if (!combination.lecture)
        {
            sectionrefs.push({term_slug: combination.lab!.term_slug, section_id: combination.lab!.section_id, schedule_group_id: combination.lab!.section_id} as SectionReference)
        }
        else if (!combination.lab)
        {
            sectionrefs.push({term_slug: combination.lecture!.term_slug, section_id: combination.lecture!.section_id, schedule_group_id: combination.lecture!.section_id} as SectionReference)
        }
        else
        {
            sectionrefs.push({term_slug: combination.lecture!.term_slug, section_id: combination.lecture!.section_id, schedule_group_id: `${combination.lecture!.section_id}-${combination.lab!.section_id}`} as SectionReference)
            sectionrefs.push({term_slug: combination.lab!.term_slug, section_id: combination.lab!.section_id, schedule_group_id: `${combination.lecture!.section_id}-${combination.lab!.section_id}`} as SectionReference)
        }
    });

    const score : number = getScheduleDowntime().reduce((acc, cur) => acc + cur, 0);

    return {sectionrefs: sectionrefs, score: score} as ScheduleContender;
}


/**
 * Attempts to add the contending schedule to the heap.
 * @param builtSchedule - collection of section combinations to be used for the schedule.
 */
function attemptToAddToHeap(builtSchedule : SectionCombination[])
{

    if (TOP_K_SCHEDULES.isFull())
    {
        const maxScore = TOP_K_SCHEDULES.peek()!.score;
        if (maxScore > getScheduleDowntime().reduce((acc, cur) => acc + cur, 0))
        {
            TOP_K_SCHEDULES.pop();
            TOP_K_SCHEDULES.insert(convertCombinationsToScheduleContenders(builtSchedule));
        }
    }
    else
    {
        TOP_K_SCHEDULES.insert(convertCombinationsToScheduleContenders(builtSchedule));
    }
}

/**
 * Finds the best K schedules for given courses. (Best is defined as minimum downtime for now)
 * @param courses - Courses that must be included in the schedule.
 * @param index - Index of course list being investigated (DO NOT GIVE ARGUMENT)
 * @param builtSchedule - Constructed schedule so far (DO NOT GIVE ARGUMENT)
 * @returns 
 */
function findBestKSchedules(courses : EnrichedCatalogCourse[], index : number = 0, builtSchedule : SectionCombination[] = []) : boolean
{
    console.log(`Index check: ${index} / ${courses.length}`);
    if (index >= courses.length)
    {
        attemptToAddToHeap(builtSchedule);
        return true; // Exhausted all courses without a conflict.
    }
    console.log(`Checking course: ${courses[index].course_name}`);
    const prevLength = builtSchedule.length;
    for (const combination of courses[index].sectionCombinations)
    {
        if (checkConflictsWithSchedule(combination)) continue;
        addCombinationToAvailability(combination);
        builtSchedule.push(combination); // add combination to the schedule we are building
        findBestKSchedules(courses, index + 1, builtSchedule)
        builtSchedule.length = prevLength; // remove combination from built schedule
        removeCombinationFromAvailability(combination);
    }
    return !TOP_K_SCHEDULES.isEmpty();
}

export async function testthisshit()
{
    const active_schedule = getActiveSchedule();
    if (active_schedule === null) return;
    resetScheduleMap();
    const result = await getCoursesFromSchedule(active_schedule.id)
    // Sort the output to allow for MRV navigation.
    const eResult = [...new Set<EnrichedCatalogCourse>([
        ...enrichCatalogCourses(result)
    ].sort((courseA, courseB) => courseA.sectionCombinations.length - courseB.sectionCombinations.length))];

    eResult.forEach((eCourse) => {
        console.log(`${eCourse.course_name}`);
        console.log(eCourse.sectionCombinations);
    })

    console.log("Testing schedule generation");
    const sResult = findBestKSchedules(eResult);
    console.log("Am I albert einstien");
    let index : number = 3;
    while(!TOP_K_SCHEDULES.isEmpty())
    {
        const newSchedule = TOP_K_SCHEDULES.pop();
        addSchedule(newSchedule!.sectionrefs, `SCHEDULE #${index--}`);
    }
    refreshScheduleSelector();
    resetScheduleMap();
    console.log(sResult);
}
