import requests

from collections import defaultdict

from dataCollection.classHandler.semester import Semester
from dataCollection.classHandler.subject import Subject
from dataCollection.classHandler.clas import Section
from dataCollection.classHandler.campus import Campus


class DataHandler:

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DataHandler, cls).__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if not hasattr(self, "initialized"):
            self.initialized = True

    @classmethod
    def getCollegeData(cls, url : str) -> list[Campus]:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        collegeInfo = []

        try:
            data = response.json()["terms"]
            for cmpsdta in data: 
                collegeInfo.append(cls.getCampusData(cmpsdta))
        except Exception as e:
            print(f"Error occured while attempting to get college data: {e}")
        finally:
            print("Data Collection completed.")

        return collegeInfo


    @classmethod
    def getCampusData(cls, campusmd : dict) -> Campus:
        name = campusmd["campus"]
        terms = campusmd["terms"]
        campusdata = []
        for tdata in terms:
            try:
                campusdata.append(cls.getSemesterData(tdata))
            except Exception as e:
                print(f"Error occured while attempting to get campus data: {e}")

        return Campus(name, campusdata)


    @classmethod
    def getSemesterData(cls, semestermd : dict) -> Semester:
        base = "https://schedules.wsu.edu/api/Data/GetPrefixList/"
        response = requests.get(base + f"{semestermd["campus"]}/{semestermd["term"]}/{str(semestermd["year"])}")

        try:
            semesterdata = []
            subjects = response.json()
            for subject in subjects:
                semesterdata.append(cls.getSubjectData(subject["subject"], subject["prefix"], semestermd["campus"], semestermd["term"], semestermd["year"]))
        except Exception as e:
            print(f"Error occured while attempting to get semester data: {e}")

        return Semester(f"{semestermd["term"]} {str(semestermd["year"])}", semesterdata)

    @classmethod
    def getSubjectData(cls, subject : str, prefix: str, campus: str, term: str, year: str) -> Subject:
        base = "https://schedules.wsu.edu/api/Data/GetSectionListDTO/"
        url = f"{base}{campus}/{term}/{year}/{prefix}"

        response = requests.get(url)
        response.raise_for_status()
        sections = response.json()['sections']


        # Group sections by course number.
        grouped_classes = defaultdict(list)

        for sectionmd in sections:
            section = cls.getSectionData(sectionmd)
            grouped_classes[section.number].append(section)

        for course_sections in grouped_classes.values():
            cls._mark_required_lab(course_sections)

        classes = [grouped_classes[course_number] for course_number in sorted(grouped_classes)]

        return Subject(subject, classes)

    @staticmethod
    def _course_title_key(section: Section) -> str:
        return section.name.strip().lower()

    @classmethod
    def _mark_required_lab(cls, course_sections: list[Section]) -> None:
        lecture_names = {
            cls._course_title_key(section)
            for section in course_sections
            if not section.is_lab
        }
        lab_names = {
            cls._course_title_key(section)
            for section in course_sections
            if section.is_lab
        }
        has_required_lab = bool(lecture_names & lab_names)

        for section in course_sections:
            section.has_required_lab = has_required_lab

    @staticmethod
    def _to_int(value, default: int = 0) -> int:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_str(value, default: str = "") -> str:
        if value is None:
            return default
        return str(value).strip()

    @classmethod
    def getSectionData(cls, metadata : dict) -> Section:
        course = metadata or {}

        name = cls._to_str(course.get("title"))
        is_lab = bool(course.get("isLab"))

        return Section(
            code=cls._to_int(course.get("sln")),
            subject=cls._to_str(course.get("subject") or course.get("prefix")),
            number=cls._to_int(course.get("courseNumber")),
            name=name,
            credits=cls._to_int(course.get("credits")),
            section=cls._to_int(course.get("sectionNumber")),
            time=cls._to_str(course.get("dayTime")),
            location=cls._to_str(course.get("location")),
            instructor=cls._to_str(course.get("instructor")),
            seats_taken=cls._to_int(course.get("enrollment")),
            seats_total=cls._to_int(course.get("enrollmentLimit")),
            is_lab=is_lab,
            component=cls._to_str(course.get("component")),
            metadata=course,
        )

