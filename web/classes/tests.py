import json

from django.test import TestCase
from django.urls import reverse

from .models import Campus, Semester, Topics, Course, Section


class ApiInputValidationTests(TestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name='Main Campus')
        self.semester = Semester.objects.create(name='Fall 2026', campus=self.campus)
        self.topic = Topics.objects.create(name='CPT_S', semester=self.semester)
        self.course = Course.objects.create(
            subject='CPT_S',
            course_number=121,
            name='Programming Methods',
            credits='3',
            topic=self.topic,
        )
        self.section = Section.objects.create(
            code=1001,
            section=1,
            days='MWF',
            time='10:00 AM - 10:50 AM',
            location='SPARK 101',
            instructor='A. Instructor',
            seats_taken=10,
            seats_total=25,
            course=self.course,
        )

    def test_search_courses_rejects_invalid_campus_before_querying_courses(self):
        with self.assertNumQueries(0):
            response = self.client.get(
                reverse('search_courses'),
                {'campus': 'not-an-int', 'semester': 'Fall 2026'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'No courses found.')

    def test_search_courses_rejects_unknown_but_well_formed_semester(self):
        with self.assertNumQueries(1):
            response = self.client.get(
                reverse('search_courses'),
                {'campus': str(self.campus.id), 'semester': 'Spring 2099'},
            )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'No courses found.')

    def test_get_schedule_data_rejects_invalid_semester_id_before_querying_schedule(self):
        with self.assertNumQueries(0):
            response = self.client.get(reverse('get_schedule_data'), {'semester_id': 'abc'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'schedule': []})

    def test_remove_from_schedule_rejects_missing_session_before_querying_sections(self):
        with self.assertNumQueries(0):
            response = self.client.post(reverse('remove_from_schedule', args=[self.section.id]))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'success': False, 'message': 'Session not found'})

    def test_add_to_schedule_rejects_wrong_method(self):
        with self.assertNumQueries(0):
            response = self.client.get(reverse('add_to_schedule', args=[self.section.id]))

        self.assertEqual(response.status_code, 405)

    def test_get_sections_by_ids_rejects_wrong_method(self):
        with self.assertNumQueries(0):
            response = self.client.get(reverse('get_sections_by_ids'))

        self.assertEqual(response.status_code, 405)

    def test_get_sections_by_ids_rejects_non_list_payload_before_querying_sections(self):
        payload = json.dumps({'section_ids': 'not-a-list'})

        with self.assertNumQueries(0):
            response = self.client.post(
                reverse('get_sections_by_ids'),
                data=payload,
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'error': 'section_ids must be a list'})
