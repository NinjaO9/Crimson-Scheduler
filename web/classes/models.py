from django.db import models
class Campus(models.Model):

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return f"{self.name}"

class Semester(models.Model):
    name = models.CharField(max_length=50)
    campus = models.ForeignKey(Campus, on_delete=models.CASCADE, related_name='semesters')

    class Meta:
        unique_together = ('name', 'campus')
    
    def __str__(self):
        return f"{self.name} - {self.campus.name}\n"

class Topics(models.Model):
    name = models.CharField(max_length=50)

    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='topics')

    class Meta:
        unique_together = ('name', 'semester')

    def __str__(self):
        return f"{self.name} - {self.semester.name}\n"
    
class Course(models.Model):
    subject = models.CharField(max_length=30, default="N/A")
    course_number = models.IntegerField(null=True)
    name = models.CharField(max_length=100, default="N/A")
    credits = models.CharField(max_length=2, default="V")
    has_required_lab = models.BooleanField(default=False)

    topic = models.ForeignKey(Topics, on_delete=models.CASCADE, related_name='courses')
    
    def __str__(self):
        return f"{self.name} - {self.topic}\n"
    

class Section(models.Model):
    code = models.IntegerField(null=True)
    section = models.IntegerField(null=True)
    days = models.CharField(max_length=50, default="N/A")
    time = models.CharField(max_length=100, default="N/A")
    location = models.CharField(max_length=20, default="N/A")
    instructor = models.CharField(max_length=50, default="N/A")
    seats_taken = models.IntegerField(null=True)
    seats_total = models.IntegerField(null=True)
    is_lab = models.BooleanField(default=False)
    component = models.CharField(max_length=30, default="Lecture")

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="sections")

    class Meta:
        unique_together = ('code', 'course')

    def __str__(self):
        return f"{self.course} - Section {self.section}"


class UserSchedule(models.Model):
    """Stores a user's schedule selection for a particular semester"""
    session_id = models.CharField(max_length=100)  # Using session ID instead of user auth
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='user_schedules')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('session_id', 'semester')

    def __str__(self):
        return f"Schedule for {self.session_id} - {self.semester}"

    def get_all_sections(self):
        """Get all sections in this schedule"""
        return self.schedule_sections.all()

    def has_conflict(self, new_section):
        """Check if adding new_section would create a time conflict"""
        existing_sections = self.get_all_sections()
        for schedule_section in existing_sections:
            if sections_overlap(schedule_section.section, new_section):
                return True
        return False

    def get_conflicts_for_section(self, section):
        """Get all sections that conflict with the given section"""
        existing_sections = self.get_all_sections()
        conflicts = []
        for schedule_section in existing_sections:
            if schedule_section.section_id == section.id:
                continue
            if sections_overlap(schedule_section.section, section):
                conflicts.append(schedule_section.section)
        return conflicts


class ScheduleSection(models.Model):
    """Represents a section that has been added to a user's schedule"""
    schedule = models.ForeignKey(UserSchedule, on_delete=models.CASCADE, related_name='schedule_sections')
    section = models.ForeignKey(Section, on_delete=models.CASCADE)
    has_conflict = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('schedule', 'section')

    def __str__(self):
        return f"{self.section} in {self.schedule}"


def parse_time(time_str):
    """Parse time string into minutes since midnight"""
    if not time_str or time_str == "N/A":
        return None
    try:
        # Try 12-hour format with AM/PM (e.g., "10:30 AM")
        import re
        match12hr = re.match(r'(\d+):(\d+)\s+(AM|PM)', time_str, re.IGNORECASE)
        if match12hr:
            hours = int(match12hr.group(1))
            minutes = int(match12hr.group(2))
            period = match12hr.group(3).upper()
            
            if period == 'PM' and hours != 12:
                hours += 12
            elif period == 'AM' and hours == 12:
                hours = 0
            
            return hours * 60 + minutes
        
        # Try 24-hour format with period (e.g., "14.55")
        match24hr_period = re.match(r'(\d+)\.(\d+)', time_str)
        if match24hr_period:
            hours = int(match24hr_period.group(1))
            minutes = int(match24hr_period.group(2))
            return hours * 60 + minutes
        
        # Try 24-hour format with colon (e.g., "14:55")
        match24hr_colon = re.match(r'(\d+):(\d+)', time_str)
        if match24hr_colon:
            hours = int(match24hr_colon.group(1))
            minutes = int(match24hr_colon.group(2))
            return hours * 60 + minutes
        
        return None
    except:
        return None


def sections_overlap(section1, section2):
    """Check if two sections have overlapping class times"""
    if not section1.time or not section2.time or section1.time == "N/A" or section2.time == "N/A":
        return False

    # Parse days
    days1 = set(section1.days.replace(' ', '').upper()) if section1.days != "N/A" else set()
    days2 = set(section2.days.replace(' ', '').upper()) if section2.days != "N/A" else set()

    # If no common days, no overlap
    if not days1 or not days2 or not days1 & days2:
        return False

    # Parse times - expecting format like "10:30 AM - 11:45 AM"
    try:
        times1 = section1.time.split('-')
        times2 = section2.time.split('-')

        start1 = parse_time(times1[0].strip())
        end1 = parse_time(times1[1].strip()) if len(times1) > 1 else None

        start2 = parse_time(times2[0].strip())
        end2 = parse_time(times2[1].strip()) if len(times2) > 1 else None

        if start1 is None or end1 is None or start2 is None or end2 is None:
            return False

        # Check for time overlap
        return start1 < end2 and start2 < end1
    except:
        return False
