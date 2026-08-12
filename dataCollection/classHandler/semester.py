
from dataCollection.classHandler.subject import Subject
class Semester:
    def __init__(self, name: str, subjects: list[Subject]):
        self.name = name.strip()
        self.subjects = subjects
    
    def __repr__(self):
        return f"\n{self.name} - {self.subjects}"

    def __str__(self):
        return f"\n{self.name} - {self.subjects}"
        