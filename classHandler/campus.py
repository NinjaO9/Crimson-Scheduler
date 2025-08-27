
import classHandler.semester as semester
class Campus:

    def __init__(self, name: str, semesters: list):
        self.name = name
        self.semesters = semesters



    def __repr__(self):
        return f"Campus(name={self.name}, semesters={self.semesters}\n)"

    def __str__(self):
        return f"{self.name} ({self.semesters})"
    

"""

Campus class contains information about the campus, such as the name and semesters available.
Semesters will be a list of Semester objects, which will contain information about the semester, specifically the term and subjects available.
The subjects will then be a list of Subject objects, which will contain information about the subject, such as the name and courses available.
The courses will then be a list of Course objects, which will contain information about the course, such as the name, code, and sections available.

"""