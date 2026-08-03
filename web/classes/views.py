from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from classes.models import Campus, Semester, Topics, Course, Section, UserSchedule, ScheduleSection, sections_overlap
from django.db.models import Q
from django.shortcuts import render
from .models import Campus
import json

def viewCampus(response, campusid):
    campus = Campus.objects.get(id=campusid)

    return render(response, "classes/showcase.html", {"campus":campus})

def home(response):
    return render(response, "classes/home.html")

def schedule_view(request):
    # Get or create a schedule for the current session
    session_id = request.session.session_key
    if not session_id:
        request.session.create()
        session_id = request.session.session_key
    
    return render(request, 'classes/schedule_build.html', {
        'session_id': session_id
    })

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
    try:
        section = Section.objects.select_related(
            'course',
            'course__topic',
            'course__topic__semester',
            'course__topic__semester__campus'
        ).get(id=section_id)
        
        # Get or create user schedule for this semester
        session_id = request.session.session_key
        if not session_id:
            request.session.create()
            session_id = request.session.session_key
        
        semester = section.course.topic.semester
        user_schedule, _ = UserSchedule.objects.get_or_create(
            session_id=session_id,
            semester=semester
        )
        
        # Check if section is already in schedule
        if ScheduleSection.objects.filter(schedule=user_schedule, section=section).exists():
            return JsonResponse({
                'success': False,
                'message': 'This section is already in your schedule'
            })
        
        # Check for conflicts
        conflicts = user_schedule.get_conflicts_for_section(section)
        has_conflict = len(conflicts) > 0
        
        # Add section to schedule
        schedule_section = ScheduleSection.objects.create(
            schedule=user_schedule,
            section=section,
            has_conflict=has_conflict
        )
        
        # If there's a conflict, mark all conflicting sections
        if has_conflict:
            for conflict_section in conflicts:
                conflict_schedule_section = ScheduleSection.objects.get(
                    schedule=user_schedule,
                    section=conflict_section
                )
                conflict_schedule_section.has_conflict = True
                conflict_schedule_section.save()
        
        # Return calendar view with all sections
        return get_schedule_calendar(request, user_schedule)
        
    except Section.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Section not found'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=500)

def remove_from_schedule(request, section_id):
    try:
        section = Section.objects.get(id=section_id)
        session_id = request.session.session_key
        
        if not session_id:
            return JsonResponse({'success': False, 'message': 'Session not found'}, status=400)
        
        semester = section.course.topic.semester
        user_schedule = UserSchedule.objects.get(
            session_id=session_id,
            semester=semester
        )
        
        # Remove section
        schedule_section = ScheduleSection.objects.get(schedule=user_schedule, section=section)
        schedule_section.delete()
        
        # Recheck conflicts for remaining sections
        for ss in user_schedule.schedule_sections.all():
            conflicts = user_schedule.get_conflicts_for_section(ss.section)
            ss.has_conflict = len(conflicts) > 0
            ss.save()
        
        return get_schedule_calendar(request, user_schedule)
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=500)

def get_schedule_calendar(request, user_schedule):
    """Generate and return the calendar view for the schedule"""
    schedule_sections = user_schedule.schedule_sections.select_related(
        'section',
        'section__course',
        'section__course__topic'
    ).all()
    
    calendar_data = []
    for ss in schedule_sections:
        section = ss.section
        calendar_data.append({
            'id': ss.id,
            'section_id': section.id,
            'course_code': f"{section.course.subject} {section.course.course_number}",
            'course_name': section.course.name,
            'section_num': section.section,
            'instructor': section.instructor,
            'location': section.location,
            'days': section.days,
            'time': section.time,
            'has_conflict': ss.has_conflict,
            'seats': f"{section.seats_taken}/{section.seats_total}"
        })
    
    return JsonResponse({
        'success': True,
        'schedule': calendar_data
    })

def get_schedule_data(request):
    """API endpoint to get current schedule data"""
    try:
        session_id = request.session.session_key
        if not session_id:
            return JsonResponse({'schedule': []})
        
        # Get the semester from query params
        semester_id = request.GET.get('semester_id')
        
        if not semester_id:
            return JsonResponse({'schedule': []})
        
        user_schedule = UserSchedule.objects.filter(
            session_id=session_id,
            semester_id=semester_id
        ).first()
        
        if not user_schedule:
            return JsonResponse({'schedule': []})
        
        schedule_sections = user_schedule.schedule_sections.select_related(
            'section',
            'section__course',
            'section__course__topic'
        ).all()
        
        calendar_data = []
        for ss in schedule_sections:
            section = ss.section
            calendar_data.append({
                'id': ss.id,
                'section_id': section.id,
                'course_code': f"{section.course.subject} {section.course.course_number}",
                'course_name': section.course.name,
                'section_num': section.section,
                'instructor': section.instructor,
                'location': section.location,
                'days': section.days,
                'time': section.time,
                'has_conflict': ss.has_conflict,
                'seats': f"{section.seats_taken}/{section.seats_total}"
            })
        
        return JsonResponse({'schedule': calendar_data})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
