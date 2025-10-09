from django.db import models



class Campus(models.Model):

    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return f"{self.name}\n"

class Semester(models.Model):
    name = models.CharField(max_length=50)
    campus = models.ForeignKey(Campus, on_delete=models.CASCADE, related_name='semesters')

    class Meta:
        unique_together = ('name', 'campus')
    
    def __str__(self):
        return f"{self.name} - {Campus.name}\n"

class Topics(models.Model):
    name = models.CharField(max_length=50)

    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name='topic')

    class Meta:
        unique_together = ('name', 'semester')

    def __str__(self):
        return f"{self.name} - {self.semester}\n"
    
class Course(models.Model):
    code = models.IntegerField(null=True)
    subject = models.CharField(max_length=10, default="N/A")
    course_number = models.IntegerField(null=True)
    name = models.CharField(max_length=100, default="N/A")
    credits = models.IntegerField(null=True)
    section = models.IntegerField(null=True)
    days = models.CharField(max_length=15, default="N/A")
    time = models.CharField(max_length=15, default="N/A")
    location = models.CharField(max_length=20, default="N/A")
    instructor = models.CharField(max_length=50, default="N/A")
    seats_taken = models.IntegerField(null=True)
    seats_total = models.IntegerField(null=True)

    topic = models.ForeignKey(Topics, on_delete=models.CASCADE, related_name='course')

    class Meta:
        unique_together = ('name', 'topic')
    
    def __str__(self):
        return f"{self.name} - {self.topic}\n"