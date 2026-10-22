from collections import defaultdict

import requests

from dataCollection.classHandler.campus import Campus
from dataCollection.classHandler.clas import Section
from dataCollection.classHandler.semester import Semester
from dataCollection.classHandler.subject import Subject


class DataHandler:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if not hasattr(self, 'initialized'):
            self.initialized = True

    @classmethod
    def getCollegeData(cls, url: str) -> list[Campus]:
        """
        Gets the data for the college as a whole. Spreads work into helper functions that deal with more specific information.

        Args:
            url: Original WSU url endpoint string that contains information about the campus.
        """

        response = requests.get(url)
        print(f'Status: {response.status_code}')
        collegeInfo = []

        try:
            data = response.json()['terms']
            for cmpsdta in data:
                collegeInfo.append(cls.getCampusData(cmpsdta))
        except Exception as e:
            print(f'Error occured while attempting to get college data: {e}')
        finally:
            print('Data Collection completed.')

        return collegeInfo

    @classmethod
    def getCampusData(cls, campusmd: dict) -> Campus:
        """
        Analyzes campus metadata to construct and route endpoints for semester information.

        Args:
            campusmd: Campus metadata, contains generic information about the campus, used to obtain the semesters on a given campus.
        Returns:
            Constructed campus object, see Campus for more information about what this class holds.
        """

        name = campusmd['campus'] if campusmd['campus'] != 'DDP' else 'Global'
        terms = campusmd['terms']
        campusdata = []
        for tdata in terms:
            try:
                campusdata.append(cls.getSemesterData(tdata))
            except Exception as e:
                print(f'Error occured while attempting to get campus data: {e}')

        return Campus(name, campusdata)

    @classmethod
    def getSemesterData(cls, semestermd: dict) -> Semester:
        """
        Analyzes subject metadata to construct and route endpoints for information about what is being offered in the semester.

        Args:
            semestermd: Semester metadata, contains generic information about the semester, which is enough to get further information.
        Returns:
            Constructed Semester object, see Semester for more information about what this class holds.
        """

        base = 'https://schedules.wsu.edu/api/Data/GetPrefixList/'
        response = requests.get(
            base + f'{semestermd["campus"]}/{semestermd["term"]}/{str(semestermd["year"])}'
        )

        try:
            semesterdata = []
            subjects = response.json()
            for subject in subjects:
                semesterdata.append(
                    cls.getSubjectData(
                        subject['subject'],
                        subject['prefix'],
                        semestermd['campus'],
                        semestermd['term'],
                        semestermd['year'],
                    )
                )
        except Exception as e:
            print(f'Error occured while attempting to get semester data: {e}')

        return Semester(f'{semestermd["term"]} {str(semestermd["year"])}', semesterdata)

    @classmethod
    def getSubjectData(
        cls, subject: str, prefix: str, campus: str, term: str, year: str
    ) -> Subject:
        """
        Takes in generic subject information (quiery) to call WSU endpoint for information to construct an instance of Subject.

        Args:
            subject: Name of the subject that is being obtained.
            prefix: Prefix for the subject (i.e. Computer Science -> CPT_S)
            campus: Campus that we want the classes for (i.e. Pullman)
            term: The term we want classes for (i.e. Fall)
            year: The year we want classes for (i.e. 2026)
        Returns:
            Constructed subject object containing all information of a subject for a given campus/term/year.
        """

        base = 'https://schedules.wsu.edu/api/Data/GetSectionListDTO/'
        url = f'{base}{campus}/{term}/{year}/{prefix}'

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
        """
        Normalizes the section course name.

        Args:
            section: Section to normalize the name of.
        Returns:
            Normalized name of the section.
        """

        return section.name.strip().lower()

    @classmethod
    def _mark_required_lab(cls, course_sections: list[Section]) -> None:
        """
        Takes a course's sections, and populates data to determine if a lab is required for the course.
        Args:
            course_sections: A list of sections offered by a course.
        Returns:
            Nothing; modifies data to update a flag.
        """

        lecture_names = {
            cls._course_title_key(section) for section in course_sections if not section.is_lab
        }
        lab_names = {
            cls._course_title_key(section) for section in course_sections if section.is_lab
        }
        has_required_lab = bool(lecture_names & lab_names)

        for section in course_sections:
            section.has_required_lab = has_required_lab

    @staticmethod
    def _to_int(value, default: int = 0) -> int:
        """
        Private utility for parsing metadata into a number
        Args:
            value: Value to parse into an integer.
        Returns:
            The value converted to a integer number, or 0 by default.
        """

        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_str(value, default: str = '') -> str:
        """
        Private utility for parsing metadata to a 'safe' string (more like stripped string, thats probably better).

        Args:
            value: Value to parse into a string.
        Returns:
            The value converted to a string, and stripped.
        """

        if value is None:
            return default
        return str(value).strip()

    @classmethod
    def getSectionData(cls, metadata: dict) -> Section:
        """
        Parses metadata for a section into a Section class

        Args:
            metadata: The metadata of a section to be parsed.
        Returns:
            The constructed section object.
        """

        course = metadata or {}

        name = cls._to_str(course.get('title'))
        is_lab = bool(course.get('isLab'))

        return Section(
            code=cls._to_int(course.get('sln')),
            subject=cls._to_str(course.get('subject') or course.get('prefix')),
            number=cls._to_int(course.get('courseNumber')),
            name=name,
            credits=cls._to_str(course.get('credits')),
            section=cls._to_int(course.get('sectionNumber')),
            time=cls._to_str(course.get('dayTime')),
            location=cls._to_str(course.get('location')),
            instructor=cls._to_str(course.get('instructor')),
            seats_taken=cls._to_int(course.get('enrollment')),
            seats_total=cls._to_int(course.get('enrollmentLimit')),
            is_lab=is_lab,
            component=cls._to_str(course.get('component')),
            ucore=cls._to_str(course.get('ucore')),
            coop=(cls._to_str(course.get('coop')) != ''),
            footnotes=cls._to_str(course.get('footnotes')),
            metadata=course,
        )
