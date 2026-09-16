export const DAYS_OF_WEEK = [
  { key: "M", label: "Monday" },
  { key: "T", label: "Tuesday" },
  { key: "W", label: "Wednesday" },
  { key: "R", label: "Thursday" },
  { key: "F", label: "Friday" },
  { key: "S", label: "Saturday" },
  { key: "U", label: "Sunday" },
];
export const START_HOUR = 7;
export const END_HOUR = 23;
export const HOUR_ROW_HEIGHT = 58;
export const MOBILE_BREAKPOINT = 760;
export const SCHEDULE_STORAGE_KEY = "crimson_scheduler_schedule";
export const LEGACY_SCHEDULE_COOKIE_NAME = "crimson_scheduler_schedule";
export const SCHEDULE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const TIME_FORMAT_STORAGE_KEY = "crimson_scheduler_24_hour_time";
export const HIDE_WEEKENDS_STORAGE_KEY = "crimson_scheduler_hide_weekends";
export const SHOW_INSTRUCTORS_STORAGE_KEY =
  "crimson_scheduler_show_instructors";
export const SHOW_COURSE_SECTION_STORAGE_KEY =
  "crimson_scheduler_show_course_section";
export const SCHEDULE_NAME_STORAGE_KEY = "crimson_scheduler_schedule_name";
export const DEFAULT_SCHEDULE_NAME = "My Schedule";
export const SCHEDULE_NAME_MAX_LENGTH = 20;
export const MAX_SCHEDULE_SECTIONS = 15;
export const SHARE_CODE_PREFIX = "CS2.";
export const REQUIRED_COURSE_FIELDS = [
  "section_id",
  "course_code",
  "days",
  "time",
];
export const RATE_LIMIT_TOAST_ID = "rateLimitToast";
export const DAY_TOKEN_MAP = [
  [/MONDAY|MON|MO/g, "M"],
  [/TUESDAY|TUES|TUE|TU/g, "T"],
  [/WEDNESDAY|WED|WE/g, "W"],
  [/THURSDAY|THURS|THU|TH/g, "R"],
  [/FRIDAY|FRI|FR/g, "F"],
  [/SATURDAY|SAT|SA/g, "S"],
  [/SUNDAY|SUN|SU/g, "U"],
];
