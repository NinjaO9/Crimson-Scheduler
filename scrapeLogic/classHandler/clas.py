import re


class Section:
    def __init__(self, code: int, subject : str, number : int, name: str, credits: str, section: int, time: str, location: str, instructor: str, seats_taken: int, seats_total: int):
        self.code = code
        self.subject = subject.strip()
        self.cNumber = number
        self.name = name.strip()
        self.credits = credits.strip()
        self.section = section
        self.days = ""
        self.time = ""
        self.formatTime(time)
        self.location = location.strip()
        self.instructor = instructor.strip()
        self.seats_taken = seats_taken
        self.seats_total = seats_total

    def __repr__(self):
        return f"{self.name}-{self.cNumber}"
        return f"""Section(
                code={self.code}, 
                name={self.name}, 
                credits={self.credits}, 
                section={self.section}, 
                days={self.days}, 
                location={self.location}, 
                instructor={self.instructor}, 
                seats_taken={self.seats_taken}, 
                seats_total={self.seats_total})
                """
    
    def __str__(self):
        return f"{self.name}-{self.cNumber}"
        return f"""Section(
            code={self.code}, 
            name={self.name}, 
            credits={self.credits}, 
            section={self.section}, 
            days={self.days}, 
            location={self.location}, 
            instructor={self.instructor}, 
            seats_taken={self.seats_taken}, 
            seats_total={self.seats_total})
            """
        
    
    def formatTime(self, time) -> None:

        try:
            match = re.match(r"([A-Z,]+)(\d.*)", time)
            # format time from (example) "TU,THU12.30-13.30" to something like "(Tuesday, Thursday), "12:30 PM - 1:30 PM""
            self.days = match[0].strip()
            self.time = match[1].replace(".", ":").strip()
        except Exception as e:
            self.time = "N/A"
            self.days = "N/A"
