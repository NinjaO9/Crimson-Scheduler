from web.classes.models import Campus as d_Campus, Semester as d_Semester, Topics as d_Topic, Course as d_Course, Section as d_Section
from scrapeLogic.classHandler.campus import Campus as s_Campus
from scrapeLogic.classHandler.semester import Semester as s_Semeseter
from scrapeLogic.classHandler.subject import Subject as s_Topic
from scrapeLogic.classHandler.clas import Section as s_Course




class StorageHandler:

    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StorageHandler, cls).__new__(cls)

        return cls._instance
    
    def __init__(self) -> None:
        if not hasattr(self, 'initialized'):
            self.initialized = True


    def insertToDatabase(scrapped_data : list[s_Campus]) -> None: 
        # Ok I need to come back eventually and figure out a better way for this, this was WAYYYY too nested

        for campus in scrapped_data:
            new_campus, _ = d_Campus.objects.update_or_create(name=campus.name)
            new_campus.save()
            #print(f"Now storing - {campus.name}")

            for semester in campus.semesters:
                new_semester, _ = new_campus.semesters.update_or_create(name=semester.name)
                #print(f"Now storing - {semester.name}")

                for subject in semester.subjects:
                    new_topic, _ = new_semester.topics.update_or_create(name=subject.name)
                    #print(f"Now storing - {subject.name}")

                    for course_list in subject.courses:
                        if (len(course_list) != 0):
                            new_course, _ = new_topic.courses.update_or_create(course_number=course_list[0].cNumber, defaults={"subject" : course_list[0].subject, "name" : course_list[0].name, "credits" : course_list[0].credits})
                        for course in course_list:
                            #print(f"Now storing - {course.name} - Section: {course.section}")
                            new_course.sections.update_or_create(
                                code=course.code, 
                                defaults={
                                    "section" : course.section,
                                    "days" : course.days,
                                    "time" : course.time,
                                    "location" : course.location,
                                    "instructor" : course.instructor,
                                    "seats_taken" : course.seats_taken,
                                    "seats_total" : course.seats_total,
                                })
    


