from django.contrib import admin
from .models import Campus, Semester, Topics, Course
# Register your models here.

admin.site.register(Campus)
admin.site.register(Semester)
admin.site.register(Topics)
admin.site.register(Course)

