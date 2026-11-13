/**
 * @fileoverview Logic behind schedule generation
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { CourseApi } from "../course_api";
import { CatalogCourse, SchedulableSection, ScheduleRecord, SectionReference } from "../types";
import { addSchedule, getActiveSchedule, getScheduleById } from "./schedule-state";
import { parseDaysToIndexes, parseTimeRange } from "./time-and-meetings";
import { refreshScheduleSelector } from "./schedule-selector";
const DAY_START = 0;
const DAY_END = 1439; // 1440 min in day (-1 for array indexing)
const WORD_COUNT = 45; // 32 * 45 = 1440 (minutes in day)
const DAYS_COUNT = 7;
const SCHEDULE_AVAILABILITY_MAP = Array.from({ length: DAYS_COUNT }, () => new Uint32Array(WORD_COUNT));

type Tuple<T, U, V> = [T,U,V];

interface SectionCombination {
    lecture? : SchedulableSection;
    lab? : SchedulableSection;
    occupancy : Uint32Array[];
}

interface EnrichedCatalogCourse extends CatalogCourse {
    sectionCombinations : SectionCombination[];
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
 * Finds if there is a conflict between two section combinations.
 * 
 * @param combinationA
 * @param combinationB 
 * @returns true if conflict found, false otherwise.
 */
function hasConflictInCombinations(combinationA : SectionCombination, combinationB : SectionCombination) : boolean
{
    for (let dayIndex = 0; dayIndex < DAYS_COUNT; dayIndex++)
    {
        for (let word = 0; word < WORD_COUNT; word++)
        {
            if ((combinationA.occupancy[dayIndex][word] & combinationB.occupancy[dayIndex][word]) !== 0) return true;
        }
    }
    return false;
}

function hasConflictInSchedule(combination : SectionCombination) : boolean
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
 * Generates a downtimeMap for two combinations, a list of numbers that shows how much downtime is had between courses on each day of the week.
 * @param combinationA 
 * @param combinationB 
 * @returns A downtimeMap that showcases the idle time between courses on any given day.
 */
function getSectionDowntime(combinationA : SectionCombination, combinationB : SectionCombination) : number[]
{
    const downtimeMap : number[] = [0, 0, 0, 0, 0, 0, 0];
    
    for (let day = 0; day < DAYS_COUNT; day++)
    {

        let first = -1;
        let last = -1;
        let occupiedMinutes = 0;
        
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] |= combinationA.occupancy[day][wordIndex] | combinationB.occupancy[day][wordIndex];
            if (SCHEDULE_AVAILABILITY_MAP[day][wordIndex] === 0) continue;
            occupiedMinutes += popcount32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex]);

            if (first === -1)
            {
                first = wordIndex * 32 + (31 - Math.clz32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex] & -SCHEDULE_AVAILABILITY_MAP[day][wordIndex]));
            }

            last = wordIndex * 32 + (31 - Math.clz32(SCHEDULE_AVAILABILITY_MAP[day][wordIndex]));
        }

        if (first === -1)
        {
            downtimeMap[day] = 0;
        }
        else
        {
            downtimeMap[day] = (last - first + 1) - occupiedMinutes;
        }

    }

    return downtimeMap;
}


/**
 * Given two courses, finds the combination to take them that has the tightest schedule (with no conflicts)
 * @param courseA 
 * @param courseB 
 * @returns A tuple that contains the sections chosen and the downtime map
 */
function findTightestCombination(courseA : EnrichedCatalogCourse, courseB : EnrichedCatalogCourse) : Tuple<SectionCombination, SectionCombination, number[]> | null
{
    let bestFit : Tuple<SectionCombination, SectionCombination, number[]> = {} as Tuple<SectionCombination, SectionCombination, number[]>;
    for (const sectionCombinationA of courseA.sectionCombinations)
    {
        for (const sectionCombinationB of courseB.sectionCombinations)
        {
            if(hasConflictInCombinations(sectionCombinationA, sectionCombinationB)) continue;
            const newDownTimeMap = getSectionDowntime(sectionCombinationA, sectionCombinationB);
            const newScore = newDownTimeMap.reduce((acc, cur) => acc + cur, 0);
            let curScore = Number.MAX_SAFE_INTEGER;
            if (bestFit[2] !== undefined)
            {
                curScore = bestFit[2].reduce((acc, cur) => acc + cur, 0);
            }
            if (newScore < curScore)
            {
                bestFit = [sectionCombinationA, sectionCombinationB, newDownTimeMap];
            }

        }
    }
    return bestFit;
}

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

function removeCombinationFromSchedule(combination : SectionCombination) : void
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] ^= combination.occupancy[day][wordIndex];
        }
    }
}

function addCombinationToSchedule(combination : SectionCombination) : void
{
    for (let day = 0; day < DAYS_COUNT; day++)
    {
        for (let wordIndex = 0; wordIndex < WORD_COUNT; wordIndex++)
        {
            SCHEDULE_AVAILABILITY_MAP[day][wordIndex] |= combination.occupancy[day][wordIndex];
        }
    }
}

function findBestSchedules(courses : EnrichedCatalogCourse[], index : number = 0) : SectionReference[] | null
{
    console.log(`Index check: ${index} / ${courses.length}`);
    if (index >= courses.length)
    {
        return [] as SectionReference[];
    }
    console.log(`Checking course: ${courses[index].course_name}`);
    for (const combination of courses[index].sectionCombinations)
    {
        if (hasConflictInSchedule(combination)) continue;
        addCombinationToSchedule(combination);
        const result = findBestSchedules(courses, index + 1)
        if (result !== null)
        {
            if (!combination.lecture)
            {
                result.push({term_slug: courses[index].term_slug, section_id: combination.lab!.section_id, schedule_group_id: combination.lab!.section_id} as SectionReference)
            }
            else if (!combination.lab)
            {
                result.push({term_slug: courses[index].term_slug, section_id: combination.lecture!.section_id, schedule_group_id: combination.lecture!.section_id} as SectionReference)
            }
            else
            {
                result.push({term_slug: courses[index].term_slug, section_id: combination.lecture!.section_id, schedule_group_id: `${combination.lecture!.section_id}-${combination.lab!.section_id}`} as SectionReference)
                result.push({term_slug: courses[index].term_slug, section_id: combination.lab!.section_id, schedule_group_id: `${combination.lecture!.section_id}-${combination.lab!.section_id}`} as SectionReference)
            }
            return result;
        }
        removeCombinationFromSchedule(combination);
    }
    return null;
}

/**
 * Soon
 * @param courses 
 * @returns 
 */
function findBestKSchedules(courses : Set<EnrichedCatalogCourse>) : ScheduleRecord[]
{
    return {} as ScheduleRecord[];
}


export async function testthisshit()
{
    const active_schedule = getActiveSchedule();
    if (active_schedule === null) return;
    const result = await getCoursesFromSchedule(active_schedule.id)
    // Sort the output to allow for MRV navigation.
    const eResult = [...new Set<EnrichedCatalogCourse>([
        ...enrichCatalogCourses(result)
    ].sort((courseA, courseB) => courseA.sectionCombinations.length - courseB.sectionCombinations.length))];

    eResult.forEach((eCourse) => {
        console.log(`${eCourse.course_name}`);
        console.log(eCourse.sectionCombinations);
    })

    // console.log(`Best fit for: ${eResult[eResult.length - 1].course_name} and ${eResult[eResult.length - 2].course_name}`);
    // const bResult = findTightestCombination(eResult[eResult.length - 1], eResult[eResult.length - 2]);
    // if (bResult === null)
    // {
    //     console.log("ISSUE");
    // }
    // else
    // {
    // bResult.forEach((item) => {
    //         console.log(item);
    // });
    // }

    console.log("Testing schedule generation");
    const sResult = findBestSchedules(eResult);
    if (sResult !== null)
    {
        addSchedule(sResult);
        refreshScheduleSelector();
    }
    console.log(sResult);
}
