
class Section:
    def __init__(self, code: str, name: str, credits: str, section: str, time: str, location: str, instructor: str, seats_taken: str, seats_total: str):
        self.code = code
        self.name = name.strip()
        self.credits = credits
        self.section = section
        self.formatTime(self, time)
        self.location = location.strip()
        self.instructor = instructor.strip()
        self.seats_taken = seats_taken
        self.seats_total = seats_total

    def __repr__(self):
        return f"Section(code={self.code}, name={self.name}, credits={self.credits}, section={self.section}, days={self.days}, time={self.time}, location={self.location}, instructor={self.instructor}, seats_taken={self.seats_taken}, seats_total={self.seats_total})"
    
    def formatTime(self, time) -> None:
        if self.time == "AARGT":
            return "N/A"
        
        # format time from (example) "TU,THU12.30-13.30" to something like "(Tuesday, Thursday), "12:30 PM - 1:30 PM""
        self.days = time
        pass