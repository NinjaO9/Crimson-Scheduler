import re


class Section:
    def __init__(self, code: int, subject: str, number: int, name: str, credits: int, section: int,
                 time: str, location: str, instructor: str, seats_taken: int, seats_total: int,
                 is_lab: bool = False, component: str = "", has_required_lab: bool = False,
                 metadata: dict | None = None):
        self.code = code
        self.subject = subject.strip()
        self.number = number
        self.name = name.strip()
        self.credits = credits
        self.section = section
        self.is_lab = is_lab
        self.component = component.strip() or ("LAB" if is_lab else "Lecture")
        self.has_required_lab = has_required_lab
        self.days = ""
        self.time = ""
        self.formatTime(time)
        self.location = location.strip()
        self.instructor = instructor.strip()
        self.seats_taken = seats_taken
        self.seats_total = seats_total
        self.metadata = metadata or {}

    def __repr__(self):
        return f"{self.name}-{self.number}"

    def __str__(self):
        return f"{self.name}-{self.number}"

    @staticmethod
    def _format_time_token_24h(token: str) -> str:
        token = (token or "").strip()
        match = re.match(r"^(\d{1,2})(?:[.:](\d{1,2}))?$", token)
        if match is None:
            return token

        hours = int(match.group(1))
        minutes = int(match.group(2) or 0)
        return f"{hours:02d}:{minutes:02d}"

    @classmethod
    def _format_time_range(cls, time_range: str) -> str:
        parts = [part.strip() for part in (time_range or "").split("-", 1)]
        if len(parts) != 2:
            return cls._format_time_token_24h(time_range)

        start, end = parts
        return f"{cls._format_time_token_24h(start)} - {cls._format_time_token_24h(end)}"

    def formatTime(self, time) -> None:
        """
        WSU has a really interesting way 
        """
        time = (time or "").strip()

        if not time:
            # Blank/whitespace-only field - e.g. some online or arranged sections
            self.meetings = [("ARR", "ARR")]
            self.days = "ARR"
            self.time = "ARR"
            return

        segments = [seg.strip() for seg in time.split(";") if seg.strip()]
        meetings = []

        for seg in segments:
            match = re.match(r"([A-Z,]+)(\d.*)", seg)
            if match is None:
                # No recognizable day/time pattern in this chunk (e.g. "ARR", "TBA")
                meetings.append(("ARR", seg))
                continue
            days = match.group(1).strip(",")
            seg_time = self._format_time_range(match.group(2).strip())
            meetings.append((days, seg_time))

        if not meetings:
            meetings = [("ARR", "ARR")]

        self.meetings = meetings
        self.days = ",".join(d for d, _ in meetings)
        self.time = ";".join(t for _, t in meetings)


if __name__ == "__main__":
    test_cases = [
        "M,W,F11.10-12",              # single block, three days sharing one time
        "TU7.45-10.35",               # single block, one day
        "TU10.10-13;TH9.10-12",       # the Postgres example - two days, two different times
        "",                           # blank / arranged
        "   ",                       # whitespace-only
        "ARR",                        # explicit arranged, no digits at all
    ]

    for t in test_cases:
        s = Section(1, "TEST", 100, "Test Course", 3, 1, t, "LOC 100", "SOMEONE", 10, 20)
        print(f"input={t!r:35} -> days={s.days!r:20} time={s.time!r:25} meetings={s.meetings}")
