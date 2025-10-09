from django.shortcuts import render
from django.http import HttpResponse 
from classes.models import Campus, Semester, Topics, Course
# Create your views here.

def test(response):
    return HttpResponse("<h1>Hello World!</h1>")

def viewCampus(response, campusid):
    temp = Campus.objects.get(id=campusid)
    semesters = temp.semesters.get(id=1)

    return HttpResponse("<h1>%s</h1><br></br><p>%s</p>" %(temp.name, semesters.name))

