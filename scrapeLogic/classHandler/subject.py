
from scrapeLogic.classHandler.clas import Section
class Subject:
    def __init__(self, name: str, courses: list[list[Section]]):
        self.name = name
        self.courses = courses

    def __repr__(self):
        return f"{self.name} -\n {self.courses}"
    
    def __str__(self):
        return f"{self.name} -\n {self.courses}"