# Crimson Scheduler

Crimson Scheduler is a WSU-focused schedule builder that helps students search course offerings and assemble a weekly class schedule. It retrieves publicly accessible course schedule data from WSU schedule API endpoints, stores course and section records in a Django database, and provides a responsive desktop/mobile calendar UI.

### Why did I make this?

I've found it to be somewhat annoying to plan out classes using the current scheduling systems WSU has in place. I've also seen that frustration echoed across other people on online forums as well. As such, I decided to make this webapp to make the process of planning out a semester of classes MUCH easier.

##### What about other sites like Coursicle?

Crimson Scheduler occupies a similar space to services such as Coursicle, but is specifically designed with WSU students in mind. The goal is to provide a straightforward, WSU-focused experience without requiring students to manually enter course information when it isn't available through a third-party service.

Simply put, you can think of Crimson Scheduler as Coursicle just for us WSU students :\)

![Crimson Scheduler desktop view](readme-images/DesktopView-CrimsonScheduler.png)

## Current Features

- Search WSU courses by campus, term, subject, course number, or course title.
- View course sections with credits, meeting days, times, location, instructor, and enrollment counts.
- Choose lecture sections and required lab sections together when a course includes a lab.
- Build a visual weekly schedule from selected sections.
- Rename the current schedule.
- Preview sections on the calendar before adding them.
- Detect overlapping course times and highlight conflicts.
- Track total selected credits.
- Separate arranged, TBA, online, or otherwise unscheduled courses into a misc list.
- Remove individual courses or clear the full schedule.
- Export the schedule as a PNG image.
- Generate and import Crimson Scheduler share codes.
- Persist selected sections in a browser cookie for 30 days.
- Persist display preferences and schedule name in local storage.
- Customize the display with 24-hour time, hidden weekends, instructor labels, and section labels.
- Use a mobile layout with separate Search and Schedule tabs.
- View an in-app help modal with desktop and mobile guidance.
- Access Privacy Policy, Terms of Use, and Contact pages from the footer.
- Apply Redis-backed rate limiting to search and schedule API endpoints.

## Mobile UI

| Schedule | Search |
| --- | --- |
| ![Crimson Scheduler mobile schedule view](readme-images/MobileView-CrimsonScheduler1.png) | ![Crimson Scheduler mobile search view](readme-images/MobileView-CrimsonScheduler2.png) |

## Tech Stack

- Python
- Django 5.2
- PostgreSQL to cache course information
- Redis for cache/rate-limiting support
- WSU schedule API endpoints for data collection
- HTMX for course search partial updates
- Bootstrap for UI components
- html2canvas for PNG schedule export
- JavaScript for schedule rendering, conflict highlighting, share codes, cookies, local storage, export, and mobile navigation

## Project Structure

```text
.
|-- dataCollection/              # WSU API data loading and transformation helpers
|   |-- classHandler/            # Plain Python data containers for imported WSU data
|   `-- dataHandler/
|       |-- data.py              # Current WSU API collection path
|       |-- storage.py           # Upserts collected data into Django models
|       `-- scraper.py           # Legacy scraper code; currently unused
|-- readme-images/               # README screenshots
|-- web/                         # Django project
|   |-- classes/
|   |   |-- models.py            # Campus, semester, course, section, schedule models
|   |   |-- rate_limit.py        # Redis token-bucket rate limiting
|   |   |-- redis_scripts/       # Lua script used by the rate limiter
|   |   |-- static/              # CSS, JS, icons, and help images
|   |   |-- templates/           # Schedule builder, legal pages, contact page
|   |   |-- urls.py              # App routes
|   |   `-- views.py             # Search, schedule, legal, and API views
|   |-- manage.py
|   `-- web/                     # Django settings and root URL config
|-- LICENSE.md
|-- main.py                      # Imports WSU schedule data into the configured DB
|-- requirements.txt             # Python dependencies for local setup
`-- README.md
```

## Local Setup

Create and activate a virtual environment:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create a `.env` file in the repo root. For PostgreSQL, either provide a single `DATABASE_URL`:

```env
DJANGO_SECRET_KEY=change-this-for-local-dev
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgresql://user:password@localhost:5432/crimson_scheduler
REDIS_URL=redis://127.0.0.1:6379/0
```

Or provide individual database settings:

```env
DJANGO_SECRET_KEY=change-this-for-local-dev
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DB_ENGINE=django.db.backends.postgresql
DB_NAME=crimson_scheduler
DB_USER=your_database_user
DB_PWD=your_database_password
DB_HOST=localhost
DB_PORT=5432
REDIS_URL=redis://127.0.0.1:6379/0
```

For SQLite development:

```env
DJANGO_SECRET_KEY=change-this-for-local-dev
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DB_ENGINE=django.db.backends.sqlite3
DB_NAME=db.sqlite3
DB_USER=
DB_PWD=
DB_HOST=
DB_PORT=
REDIS_URL=redis://127.0.0.1:6379/0
```

Run migrations:

```powershell
cd web
python manage.py migrate
```

Load WSU schedule data:

```powershell
cd ..
python main.py
```

Start the development server:

```powershell
cd web
python manage.py runserver
```

Then open `http://127.0.0.1:8000/`.

## Configuration Notes

- `DJANGO_SECRET_KEY` controls Django's secret key.
- `DJANGO_DEBUG` defaults to `True`.
- `DJANGO_ALLOWED_HOSTS` is a comma-separated host list.
- `DATABASE_URL` takes priority over the individual `DB_*` settings.
- `REDIS_URL` defaults to `redis://127.0.0.1:6379/0`.
- Rate limiting can be tuned with `RATE_LIMIT_MAX_TOKENS`, `RATE_LIMIT_REFILL_RATE`, `RATE_LIMIT_TTL_SECONDS`, `RATE_LIMIT_TRUST_X_FORWARDED_FOR`, and `RATE_LIMIT_FAIL_OPEN`.
- With the default `RATE_LIMIT_FAIL_OPEN=True`, Redis outages should not block normal local development.

## Data Collection

The original scraper approach has been replaced with direct WSU API calls. `main.py` initializes Django, requests campus, term, subject, course, and section data from WSU schedule endpoints, and upserts the results into the configured database.

The importer currently stores:

- Campuses
- Semesters
- Subjects/topics
- Courses
- Sections
- Lecture/lab metadata
- Enrollment totals
- Meeting days, times, locations, and instructors

WSU schedule data is cached locally in the configured database so normal user searches do not require repeated requests to WSU endpoints. The importer can be run separately whenever the cached dataset needs to be refreshed.

## How Schedule Data Is Stored

The visible schedule builder currently stores selected section data in the user's browser with a 30-day cookie. Display options and the schedule name are stored in local storage.

Share codes store the schedule name and selected section IDs. When importing a share code, the app calls `/api/sections-by-ids/` to rebuild fresh section data from the database. The app also includes Django models and endpoints for session-backed schedules, but the primary UI flow is currently browser-first.

## User-Facing Pages

- `/` - schedule builder
- `/privacy-policy/` - privacy policy
- `/terms-of-use/` - terms of use
- `/contact/` - contact and bug-reporting guidance
- `/admin/` - Django admin

## Future Work

The core scheduling experience is usable. Future work is focused on deployment, richer course metadata, and stretch goals based on user feedback.

- [ ] Deploy Crimson Scheduler to a public domain for broader access.
- [x] Improve export options beyond JSON.
- [x] Add schedule share/import codes.
- [ ] Explore professor ratings by linking instructor names to their RMP profiles where available, or by developing a user-submitted rating system.
- [ ] Allow the deployed app's cached course data to update frequently enough for useful seat-count visibility.
- [ ] Add prerequisite or course-description metadata if reliable WSU data becomes available, or construct a dependency graph that helps visualize how courses relate to each other.
- [ ] Implement daily path generation to visualize a potential walking route between classes based on their locations.

## Disclaimers

Crimson Scheduler is an independent, third-party project and is not affiliated with, endorsed by, sponsored by, or otherwise officially associated with Washington State University (WSU).

Crimson Scheduler is a planning tool, not a registration system. Course availability, meeting times, instructors, locations, and other information should be verified through official WSU resources before registration.

Course information may be delayed, incomplete, or outdated between data refreshes.

Crimson Scheduler does not currently require user accounts. The app stores selected course sections and display preferences in browser storage to restore schedules between visits. No PII is intentionally collected by the application.

## AI Disclosure

The majority of this README.md was written with the guidance of AI, but ultimately reviewed by me (a human, I swear). If there are any questions related to the project, please feel free to reach out to me using the links in my profile. Thanks!

## License

[MIT](LICENSE.md)
