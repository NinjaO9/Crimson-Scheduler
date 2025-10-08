
from scrapeLogic.classHandler.subject import Subject
class Semester:
    def __init__(self, name: str, subjects: list[Subject]):
        self.name = name
        self.subjects = subjects
    
    def __repr__(self):
        return f"{self.name} -\n {self.subjects}"

    def __str__(self):
        return f"{self.name} -\n {self.subjects} "
        