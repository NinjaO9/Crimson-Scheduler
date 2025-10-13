from django.shortcuts import render
from django.http import HttpResponse 
from classes.models import Campus, Semester, Topics, Course
# Create your views here.

def test(response):
    return HttpResponse("<h1>Hello World!</h1>")

def viewCampus(response, campusid):
    campus = Campus.objects.get(id=campusid)

    return render(response, "classes/showcase.html", {"campus":campus})

def home(response):
    return render(response, "classes/home.html", {})

