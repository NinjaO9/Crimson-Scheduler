/**
 * @fileoverview Entry point for initializing the schedule builder application.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { initializeScheduleApp } from "./schedule/app.js";
import { CourseApi } from "./course_api.js";

window.CourseApi = CourseApi;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeScheduleApp);
} else {
  initializeScheduleApp();
}
