import { initializeScheduleApp } from "./schedule/app.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeScheduleApp);
} else {
  initializeScheduleApp();
}
