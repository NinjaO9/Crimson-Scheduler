from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from classes.models import Campus, Semester, Topics, Course, Section, UserSchedule, ScheduleSection, sections_overlap
from django.db.models import Q
from django.shortcuts import render
from .models import Campus
from django.views.decorators.csrf import ensure_csrf_cookie
import json

def viewCampus(response, campusid):
    campus = Campus.objects.get(id=campusid)

    return render(response, "classes/showcase.html", {"campus":campus})

def home(response):
    return render(response, "classes/home.html")

@ensure_csrf_cookie
def schedule_view(request):
    session_id = request.session.session_key
    if not session_id:
        request.session.create()
        session_id = request.session.session_key

    campuses = Campus.objects.order_by('name')

    semester_names = Semester.objects.values_list('name', flat=True).distinct()
    semesters = sorted(semester_names, key=semester_sort_key, reverse=True)

    return render(request, 'classes/schedule_build.html', {
        'session_id': session_id,
        'campuses': campuses,
        'semesters': semesters,
    })


SEASON_ORDER = {'Spring': 0, 'Summer': 1, 'Fall': 2, 'Winter': 3}


def semester_sort_key(name):
    """Sorts 'Fall 2026' style names chronologically (year, then season
    within that year) rather than alphabetically, since alphabetical order
    would put Fall before Spring before Summer regardless of year."""
    parts = name.split()
    season = parts[0] if parts else ''
    year = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return (year, SEASON_ORDER.get(season, 99))

def search_courses(request):
    query = request.GET.get('q', '').strip()
    campus_id = request.GET.get('campus', '').strip()
    semester_name = request.GET.get('semester', '').strip()
    subject = request.GET.get('subject', '').strip()
    number = request.GET.get('number', '').strip()

    if not campus_id or not semester_name:
        return render(request, 'classes/partials/search_results.html', {'courses': []})

    courses = Course.objects.all()

    if campus_id:
        courses = courses.filter(topic__semester__campus_id=campus_id)

    if semester_name:
        courses = courses.filter(topic__semester__name__iexact=semester_name)

    if subject:
        courses = courses.filter(subject__iexact=subject)

    if number:
        courses = courses.filter(course_number__icontains=number)

    if query and len(query) >= 2:
        courses = courses.filter(
            Q(name__icontains=query) |
            Q(subject__icontains=query) |
            Q(course_number__icontains=query)
        )

    courses = courses.prefetch_related('sections').select_related(
        'topic',
        'topic__semester',
        'topic__semester__campus'
    )[:10]

    for course in courses:
        sections = list(course.sections.all())
        course.lab_sections = [section for section in sections if section.is_lab]
        course.lecture_sections = [section for section in sections if not section.is_lab]

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
            'seats': f"{section.seats_taken}/{section.seats_total}",
            'is_lab': section.is_lab,
            'component': section.component,
            'has_required_lab': section.course.has_required_lab,
        })
    
    return JsonResponse({
        'success': True,
        'schedule': calendar_data
    })


def serialize_section_for_schedule(section, schedule_group_id=None):
    return {
        'section_id': section.id,
        'schedule_group_id': schedule_group_id,
        'course_code': f"{section.course.subject} {section.course.course_number}",
        'course_name': section.course.name,
        'section_num': section.section,
        'instructor': section.instructor,
        'location': section.location,
        'days': section.days,
        'time': section.time,
        'seats': f"{section.seats_taken}/{section.seats_total}",
        'credits': '0' if section.is_lab else section.course.credits,
        'is_lab': section.is_lab,
        'component': section.component,
        'has_required_lab': section.course.has_required_lab,
    }


def get_sections_by_ids(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        raw_section_ids = payload.get('section_ids', [])
        if not isinstance(raw_section_ids, list):
            return JsonResponse({'error': 'section_ids must be a list'}, status=400)

        section_ids = []
        for section_id in raw_section_ids[:30]:
            try:
                normalized_id = int(section_id)
            except (TypeError, ValueError):
                continue
            if normalized_id not in section_ids:
                section_ids.append(normalized_id)

        sections = Section.objects.filter(id__in=section_ids).select_related(
            'course',
            'course__topic',
            'course__topic__semester',
            'course__topic__semester__campus'
        )
        sections_by_id = {section.id: section for section in sections}

        course_counts = {}
        for section in sections_by_id.values():
            course_counts[section.course_id] = course_counts.get(section.course_id, 0) + 1

        schedule = []
        missing_section_ids = []
        for section_id in section_ids:
            section = sections_by_id.get(section_id)
            if not section:
                missing_section_ids.append(section_id)
                continue
            grouped_section_ids = [
                str(candidate_id)
                for candidate_id in section_ids
                if candidate_id in sections_by_id and sections_by_id[candidate_id].course_id == section.course_id
            ]
            schedule_group_id = '-'.join(grouped_section_ids) if course_counts.get(section.course_id, 0) > 1 else None
            schedule.append(serialize_section_for_schedule(section, schedule_group_id))

        return JsonResponse({
            'success': True,
            'schedule': schedule,
            'missing_section_ids': missing_section_ids,
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

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
                'seats': f"{section.seats_taken}/{section.seats_total}",
                'is_lab': section.is_lab,
                'component': section.component,
                'has_required_lab': section.course.has_required_lab,
            })
        
        return JsonResponse({'schedule': calendar_data})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
