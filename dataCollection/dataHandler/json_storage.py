import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dataCollection.classHandler.campus import Campus
from dataCollection.classHandler.clas import Section


class JsonStorageHandler:
    """
    So this is gonna be the first step of the translation process. Rather than rely on Postgres
    I am gonna utilize GitHub pages to simply store a json that contains information for a campus' term

    Why is this better?
    - I don't (really) have to worry about compute hours like I have to with using Neon for Postgres
    - GitHub *should* handle rate limiting on their own, but thats something I gotta look more into
    - It supports the new direction I want to move in, where we can allow for quick, interactive, dynamic searches

    Just trust me bro
    """

    VERSION = 1

    @classmethod
    def writeCourseApi(cls, collected_data: list[Campus], output_root: str | Path = "api/v1/courses") -> list[Path]:
        output_root = Path(output_root)
        written_files = []
        exisiting_campuses = []

        for campus in collected_data:
            existing_semesters = []
            for semester in campus.semesters:
                payload = cls.serializeCampusTerm(campus, semester.name)
                slug = cls.campusTermSlug(campus.name, semester.name)
                output_path = output_root / f"{slug}.json"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                written_files.append(output_path)
                print(f"Wrote {output_path}", flush=True)
                existing_semesters.append({
                    "term": semester.name,
                    "url": f"courses/{slug}.json",
                })
            exisiting_campuses.append({
                "campus": campus.name,
                "terms": existing_semesters
            })
        
        catalog_path = output_root.parent / "catalog.json"
        catalog_path.parent.mkdir(parents=True, exist_ok=True)
        catalog_payload = {
            "version": cls.VERSION,
            "generatedAt": datetime.now(UTC).isoformat(),
            "campuses": exisiting_campuses,
        }
        catalog_path.write_text(json.dumps(catalog_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written_files.append(catalog_path)
        print(f"Wrote {catalog_path}", flush=True)
        return written_files

    @classmethod
    def serializeCampusTerm(cls, campus: Campus, semester_name: str) -> dict[str, Any]:
        semester = next(semester for semester in campus.semesters if semester.name.lower() == semester_name.lower())

        return {
            "version": cls.VERSION,
            "generatedAt": datetime.now(UTC).isoformat(),
            "campus": campus.name,
            "term": semester.name,
            "subjects": [
                {
                    "subject": subject.name,
                    "courses": [
                        cls.serializeCourse(course_sections)
                        for course_sections in subject.courses
                        if course_sections
                    ],
                }
                for subject in semester.subjects
            ],
        }

    @classmethod
    def serializeCourse(cls, course_sections: list[Section]) -> dict[str, Any]:
        primary_course = next((section for section in course_sections if not section.is_lab), course_sections[0])

        return {
            "course": primary_course.name,
            "subject": primary_course.subject,
            "courseNumber": primary_course.number,
            "courseCode": f"{primary_course.subject} {primary_course.number}",
            "credits": str(primary_course.credits),
            "hasRequiredLab": primary_course.has_required_lab,
            "sections": [
                cls.serializeSection(section, primary_course)
                for section in sorted(course_sections, key=lambda section: (section.is_lab, section.section, section.code))
            ],
        }

    @classmethod
    def serializeSection(cls, section: Section, primary_course: Section) -> dict[str, Any]:
        metadata = section.metadata
        seats_available = max(section.seats_total - section.seats_taken, 0)

        return {
            "sectionId": str(section.code),
            "sln": section.code,
            "sectionNumber": section.section,
            "courseCode": f"{section.subject} {section.number}",
            "courseName": section.name,
            "credits": str(primary_course.credits),
            "component": section.component,
            "isLab": section.is_lab,
            "hasRequiredLab": primary_course.has_required_lab,
            "days": section.days,
            "time": section.time,
            "meetings": cls.serializeMeetings(section),
            "location": section.location,
            "instructor": section.instructor,
            "instructors": cls.normalizeInstructors(metadata.get("instructors"), section.instructor),
            "seats": {
                "taken": section.seats_taken,
                "total": section.seats_total,
                "available": seats_available,
                "label": f"{section.seats_taken}/{section.seats_total}",
            },
            "dates": {
                "start": cls.clean(metadata.get("startDate")),
                "end": cls.clean(metadata.get("endDate"))
            }
        }

    @staticmethod
    def serializeMeetings(section: Section) -> list[dict[str, str]]:
        return [
            {
                "days": days,
                "time": time,
            }
            for days, time in getattr(section, "meetings", [])
        ]

    @classmethod
    def normalizeInstructors(cls, instructors: Any, fallback: str) -> list[str]:
        if isinstance(instructors, list):
            normalized = [
                cls.clean(instructor.get("name") if isinstance(instructor, dict) else instructor)
                for instructor in instructors
            ]
            return [name for name in normalized if name]

        fallback = cls.clean(fallback)
        return [fallback] if fallback else []

    @staticmethod
    def clean(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def slugify(value: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
        return slug.strip("-")

    @classmethod
    def campusTermSlug(cls, campus_name: str, term_name: str) -> str:
        return f"{cls.slugify(campus_name)}-{cls.slugify(term_name)}"
