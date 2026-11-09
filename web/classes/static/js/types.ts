/**
 * @fileoverview Collection of custom types used within Crimson Scheduler
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

export interface Meeting {
  days: string;
  time: string;
}

export interface SectionDates {
  start: string;
  end: string;
}

export interface Section {
  section_id: string;
  course_code: string;
  course_name: string;
  section_num: string | number | undefined;
  instructor: string;
  location: string;
  seats: string;
  seats_available: number;
  seats_total: number;
  credits: string;
  is_lab: boolean;
  ucore: string;
  component: string;
  meetings: Meeting[];
  instructors: unknown[];
  coop: boolean;
  footnotes: string;
  dates: SectionDates;
  term_slug?: string;
  section_key?: string;
}

export interface SchedulableSection extends Section {
  term_slug: string;
  section_key: string;
}

export interface HydratedSection extends SchedulableSection {
  schedule_group_id: string | null;
}

export interface Course {
  id: string;
  subject: string;
  course_number: string | number | undefined;
  course_code: string;
  course_name: string;
  credits: string;
  has_required_lab: boolean;
  lecture_sections: Section[];
  lab_sections: Section[];
  ucore: string;
  term_slug?: string;
}

export interface CatalogCourse extends Omit<Course, "lecture_sections" | "lab_sections" | "term_slug"> {
  lecture_sections: SchedulableSection[];
  lab_sections: SchedulableSection[];
  term_slug: string;
}

export interface SectionIndexEntry {
  course: CatalogCourse;
  section: SchedulableSection;
}

export interface CourseDataset {
  key: string;
  courses: CatalogCourse[];
  sectionsBySln: Map<string, SectionIndexEntry>;
}

export interface SectionReference {
  term_slug: string;
  section_id: string;
  schedule_group_id: string | null;
}

export interface ScheduleRecord {
  id: string;
  name: string;
  section_refs: SectionReference[];
}

export interface ScheduleWorkspace {
  version: number;
  active_schedule_id: string;
  schedules: Record<string, ScheduleRecord>;
}

export interface HydrationResult {
  schedule: HydratedSection[];
  missingCount: number;
  failedCount: number;
  failedTerms: string[];
}

export interface ShareTerm {
  slug: string;
  slns: string[];
}

export interface ParsedShareCode {
  name: string;
  terms: ShareTerm[];
}

export interface ScheduleGroup {
  dayIndexes: number[];
  timeRange: { start: number; end: number };
  meeting: Meeting;
}

export interface RawSeats {
  label?: unknown;
  taken?: unknown;
  available?: unknown;
  total?: unknown;
}

export interface RawSection {
  sectionId?: unknown;
  sln?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  sectionNumber?: string | number;
  instructor?: unknown;
  location?: unknown;
  seats?: RawSeats;
  credits?: unknown;
  isLab?: unknown;
  ucore?: unknown;
  component?: unknown;
  meetings?: unknown;
  instructors?: unknown[];
  coop?: unknown;
  footnotes?: unknown;
  dates?: { start?: unknown; end?: unknown };
}

export interface RawCourse {
  courseCode?: unknown;
  courseName?: unknown;
  course?: unknown;
  subject?: unknown;
  courseNumber?: string | number;
  credits?: unknown;
  hasRequiredLab?: unknown;
  sections?: RawSection[];
}

export interface RawSubject {
  subject?: unknown;
  courses?: RawCourse[];
}

export interface RawCatalogPayload {
  subjects?: RawSubject[];
}

export interface CourseFilters {
  q?: string;
  availability?: string[];
  delivery?: string[];
  ucore?: string[];
  days?: string[];
  startTimeBands?: string[];
  limit?: number;
}

export interface CourseApi {
  campusTermUrl(campus: string, term: string): string;
  datasetKey(campus: string, term: string): string;
  fetchDataset(campus: string, term: string, options?: { reload?: boolean; signal?: AbortSignal }): Promise<CourseDataset>;
  fetchDatasetByKey(key: string, options?: { reload?: boolean; signal?: AbortSignal }): Promise<CourseDataset>;
  fetchCourses(campus: string, term: string, options?: { reload?: boolean; signal?: AbortSignal }): Promise<CatalogCourse[]>;
  filterCourses(courses: CatalogCourse[], filters?: CourseFilters): CatalogCourse[];
  getSectionAvailability(section: Section): string;
  getSectionDelivery(section: Section): string;
  getSectionUcore(section: Section): string;
  lectureMeetingMatches(section: Section, options: { days: string[]; startTimeBands: string[] }): boolean;
  meetingDays(days: string): string[];
  startTimeBand(time: string): string;
  sectionKey(termSlug: string, sectionId: string | number): string;
  normalizePayload(payload: unknown): Course[];
  normalizeCourse(course: RawCourse, subjectName: string, index: string | number): Course;
  normalizeSection(section: RawSection, course: RawCourse, index: number): Section;
  subjectShorthands: Map<string, string>;
}

declare global {
  interface Window {
    CourseApi: CourseApi;
  }
}
