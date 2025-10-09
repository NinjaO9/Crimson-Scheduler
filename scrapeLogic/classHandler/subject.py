
from scrapeLogic.classHandler.clas import Section
class Subject:
    def __init__(self, name: str, courses: list[list[Section]]):
        self.name = name.strip()
        self.courses = courses

    def __repr__(self):
        return f"\n{self.name}: \n {self.courses}"
    
    def __str__(self):
        return f"\n{self.name}: \n {self.courses}"