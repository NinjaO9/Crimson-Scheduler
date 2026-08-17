from classes.models import Campus as d_Campus, Semester as d_Semester, Topics as d_Topic, Course as d_Course, Section as d_Section
from dataCollection.classHandler.campus import Campus as s_Campus



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
        print(f"Starting database insert for {len(scrapped_data)} campus/campuses.", flush=True)

        for campus_index, campus in enumerate(scrapped_data, start=1):
            print(f"[{campus_index}/{len(scrapped_data)}] Storing campus: {campus.name}", flush=True)
            new_campus, _ = d_Campus.objects.update_or_create(name=campus.name)

            for semester_index, semester in enumerate(campus.semesters, start=1):
                print(
                    f"  [{semester_index}/{len(campus.semesters)}] "
                    f"Storing semester: {semester.name} ({len(semester.subjects)} subjects)",
                    flush=True
                )
                new_semester, _ = new_campus.semesters.update_or_create(name=semester.name)
                #print(f"Now storing - {semester.name}")

                for subject_index, subject in enumerate(semester.subjects, start=1):
                    if subject_index == 1 or subject_index % 25 == 0 or subject_index == len(semester.subjects):
                        print(
                            f"    [{subject_index}/{len(semester.subjects)}] "
                            f"Storing subject: {subject.name}",
                            flush=True
                        )
                    new_topic, _ = new_semester.topics.update_or_create(name=subject.name)
                    #print(f"Now storing - {subject.name}")

                    for course_list in subject.courses:
                        if (len(course_list) != 0):
                            primary_course = next((course for course in course_list if not course.is_lab), course_list[0])
                            new_course, _ = new_topic.courses.update_or_create(
                                course_number=primary_course.number,
                                defaults={
                                    "subject" : primary_course.subject,
                                    "name" : primary_course.name,
                                    "credits" : primary_course.credits,
                                    "has_required_lab" : primary_course.has_required_lab,
                                }
                            )
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
                                    "is_lab" : course.is_lab,
                                    "component" : course.component,
                                })
    
