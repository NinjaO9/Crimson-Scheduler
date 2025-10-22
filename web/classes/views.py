from django.shortcuts import render
from django.http import HttpResponse 
from classes.models import Campus, Semester, Topics, Course, Section
from django.db.models import Q
from django.shortcuts import render
from .models import Campus

def viewCampus(response, campusid):
    campus = Campus.objects.get(id=campusid)

    return render(response, "classes/showcase.html", {"campus":campus})

def home(response):
    return render(response, "classes/home.html")

def schedule_view(request):
    return render(request, 'classes/schedule_build.html')

def search_courses(request):
    query = request.GET.get('q', '').strip()
    filters = {}
    
    # Parse filters from query
    parts = query.split()
    search_terms = []
    
    for part in parts:
        if ':' in part:
            filter_type, value = part.split(':', 1)
            filters[filter_type.lower()] = value.lower()
        else:
            search_terms.append(part)
    
    # Base query
    courses = Course.objects.all()
    
    # Apply filters
    if 'campus' in filters:
        courses = courses.filter(topic__semester__campus__name__icontains=filters['campus'])
    
    if 'semester' in filters:
        courses = courses.filter(topic__semester__name__icontains=filters['semester'])
    
    if 'subject' in filters:
        courses = courses.filter(subject__icontains=filters['subject'])
    
    if 'number' in filters:
        courses = courses.filter(course_number__icontains=filters['number'])
    
    # Apply general search terms
    if search_terms:
        search_query = ' '.join(search_terms)
        if len(search_query) >= 2:  # Only search if at least 2 characters
            courses = courses.filter(
                Q(name__icontains=search_query) |
                Q(subject__icontains=search_query) |
                Q(course_number__icontains=search_query)
            )
    
    # Update select_related to include sections
    courses = courses.prefetch_related('sections').select_related(
        'topic',
        'topic__semester',
        'topic__semester__campus'
    )[:10]
    
    return render(request, 'classes/partials/search_results.html', {'courses': courses})

def add_to_schedule(request, section_id):
    section = Section.objects.select_related(
        'course',
        'course__topic',
        'course__topic__semester',
        'course__topic__semester__campus'
    ).get(id=section_id)
    
    # Reminder to add:
    # - Check for time conflicts
    # - Check if section is full
    # - Check if prerequisites are met
    # For now, we'll just render the section
    
    return render(request, 'classes/partials/schedule_item.html', {'section': section})

def remove_from_schedule(request, section_id):
    if request.method == 'DELETE':
        return HttpResponse('')
    return HttpResponse('Method not allowed', status=405)
