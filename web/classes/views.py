from django.shortcuts import get_object_or_404, render
from django.http import JsonResponse
from classes.models import Campus, Section, UserSchedule, ScheduleSection
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.contrib import messages
import re
import json
import requests
from requests import RequestException
from .rate_limit import check_for_token_limit, token_limit_response

SEASON_ORDER = {'Spring': 0, 'Summer': 1, 'Fall': 2, 'Winter': 3}
VERSION = "v1"
BASE_API_URL = f"https://ninjao9.github.io/Crimson-Scheduler/api/{VERSION}/"

def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")

@require_GET
def viewCampus(response, campusid):
    campus = get_object_or_404(Campus, id=campusid)

    return render(response, "classes/showcase.html", {"campus":campus})

@require_GET
def home(response):
    return render(response, "classes/home.html")


@require_GET
def privacy_policy(request):
    return render(request, "classes/privacy_policy.html")


@require_GET
def terms_of_service(request):
    return render(request, "classes/terms_of_service.html")


@require_GET
def contact(request):
    return render(request, "classes/contact.html")


    

@ensure_csrf_cookie
@require_GET
def schedule_view(request):
    session_id = request.session.session_key
    if not session_id:
        request.session.create()
        session_id = request.session.session_key

    try:
        catalog = requests.get(BASE_API_URL + "catalog.json").json()
    except(RequestException):
        messages.error(request, "Failed to connect to API, please try again later.")
        catalog = []
        return render(request, 'classes/schedule_build.html', {
            'session_id': session_id,
            'campuses': [],
            'semesters': [],
        })

    campuses = [campus['campus'] for campus in catalog['campuses']]

    semesters = set()
    for campus in catalog['campuses']:
        for term in campus['terms']:
            semesters.add(term['term'])

    return render(request, 'classes/schedule_build.html', {
        'session_id': session_id,
        'campuses': campuses,
        'semesters': list(semesters),
    })

def semester_sort_key(name):
    """Sorts 'Fall 2026' style names chronologically (year, then season
    within that year) rather than alphabetically, since alphabetical order
    would put Fall before Spring before Summer regardless of year."""
    parts = name.split()
    season = parts[0] if parts else ''
    year = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return (year, SEASON_ORDER.get(season, 99))

def parse_positive_int(value):
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return None
    return parsed_value if parsed_value > 0 else None

@require_POST
def add_to_schedule(request, section_id):
    rate_limit_result = check_for_token_limit(request)
    if not rate_limit_result['allowed']:
        return token_limit_response(rate_limit_result)

    if section_id < 1:
        return JsonResponse({
            'success': False,
            'message': 'Invalid section id'
        }, status=400)

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

@require_POST
def remove_from_schedule(request, section_id):
    rate_limit_result = check_for_token_limit(request)
    if not rate_limit_result['allowed']:
        return token_limit_response(rate_limit_result)

    try:
        session_id = request.session.session_key
        if not session_id:
            return JsonResponse({'success': False, 'message': 'Session not found'}, status=400)

        if section_id < 1:
            return JsonResponse({'success': False, 'message': 'Invalid section id'}, status=400)

        section = Section.objects.get(id=section_id)
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

    except Section.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Section not found'
        }, status=404)
    except UserSchedule.DoesNotExist:
        return JsonResponse({
            'success': False,
            'message': 'Schedule not found'
        }, status=404)
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


@require_POST
def get_sections_by_ids(request):
    rate_limit_result = check_for_token_limit(request)
    if not rate_limit_result['allowed']:
        return token_limit_response(rate_limit_result)

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

@require_GET
def get_schedule_data(request):
    """API endpoint to get current schedule data"""
    try:
        rate_limit_result = check_for_token_limit(request)
        if not rate_limit_result['allowed']:
            return token_limit_response(rate_limit_result)

        session_id = request.session.session_key
        if not session_id:
            return JsonResponse({'schedule': []})

        # Get the semester from query params
        semester_id = parse_positive_int(request.GET.get('semester_id'))

        if semester_id is None:
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

