import json

from django.test import TestCase
from django.urls import reverse

from .models import Campus, Semester, Topics, Course, Section, UserSchedule, ScheduleSection, parse_time, sections_overlap


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

class ScheduleApiTests(TestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name='Main Campus')
        self.semester = Semester.objects.create(name='Fall 2026', campus=self.campus)
        self.topic = Topics.objects.create(name='CPT_S', semester=self.semester)
        self.course = Course.objects.create(
            subject='CPT_S',
            course_number=121,
            name='Programming Methods',
            credits='4',
            has_required_lab=True,
            topic=self.topic,
        )
        self.lecture = Section.objects.create(
            code=1001,
            section=1,
            days='MWF',
            time='10:00 AM - 10:50 AM',
            location='SPARK 101',
            instructor='A. Instructor',
            seats_taken=10,
            seats_total=25,
            component='Lecture',
            course=self.course,
        )
        self.lab = Section.objects.create(
            code=1002,
            section=2,
            days='T',
            time='1:00 PM - 2:50 PM',
            location='Sloan 10',
            instructor='B. Instructor',
            seats_taken=8,
            seats_total=20,
            is_lab=True,
            component='Laboratory',
            course=self.course,
        )
        self.other_course = Course.objects.create(
            subject='MATH',
            course_number=171,
            name='Calculus I',
            credits='4',
            topic=self.topic,
        )
        self.conflicting_section = Section.objects.create(
            code=2001,
            section=1,
            days='MW',
            time='10:30 AM - 11:45 AM',
            location='Todd 116',
            instructor='C. Instructor',
            seats_taken=12,
            seats_total=30,
            course=self.other_course,
        )

    def test_add_to_schedule_creates_schedule_for_current_session(self):
        response = self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload['success'])
        self.assertEqual(len(payload['schedule']), 1)
        self.assertEqual(payload['schedule'][0]['section_id'], self.lecture.id)
        self.assertEqual(payload['schedule'][0]['course_code'], 'CPT_S 121')

        self.assertEqual(UserSchedule.objects.count(), 1)
        self.assertEqual(ScheduleSection.objects.count(), 1)

    def test_add_to_schedule_rejects_duplicate_section(self):
        self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))

        response = self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {'success': False, 'message': 'This section is already in your schedule'},
        )
        self.assertEqual(ScheduleSection.objects.count(), 1)

    def test_add_to_schedule_marks_both_sections_when_times_conflict(self):
        self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))

        response = self.client.post(reverse('add_to_schedule', args=[self.conflicting_section.id]))

        self.assertEqual(response.status_code, 200)
        schedule = response.json()['schedule']
        self.assertEqual(len(schedule), 2)
        self.assertTrue(all(item['has_conflict'] for item in schedule))
        self.assertTrue(
            ScheduleSection.objects.get(section=self.lecture).has_conflict
        )
        self.assertTrue(
            ScheduleSection.objects.get(section=self.conflicting_section).has_conflict
        )

    def test_remove_from_schedule_recalculates_remaining_conflicts(self):
        self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))
        self.client.post(reverse('add_to_schedule', args=[self.conflicting_section.id]))

        response = self.client.post(reverse('remove_from_schedule', args=[self.conflicting_section.id]))

        self.assertEqual(response.status_code, 200)
        schedule = response.json()['schedule']
        self.assertEqual(len(schedule), 1)
        self.assertEqual(schedule[0]['section_id'], self.lecture.id)
        self.assertFalse(schedule[0]['has_conflict'])
        self.assertFalse(ScheduleSection.objects.get(section=self.lecture).has_conflict)

    def test_get_schedule_data_returns_only_requested_semester_schedule(self):
        self.client.post(reverse('add_to_schedule', args=[self.lecture.id]))

        other_semester = Semester.objects.create(name='Spring 2027', campus=self.campus)
        response = self.client.get(reverse('get_schedule_data'), {'semester_id': other_semester.id})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'schedule': []})

        response = self.client.get(reverse('get_schedule_data'), {'semester_id': self.semester.id})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['schedule'][0]['section_id'], self.lecture.id)

    def test_get_sections_by_ids_serializes_share_code_sections_in_requested_order(self):
        payload = json.dumps({
            'section_ids': [
                str(self.lab.id),
                'bad-id',
                self.lecture.id,
                self.lab.id,
                999999,
            ],
        })

        response = self.client.post(
            reverse('get_sections_by_ids'),
            data=payload,
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['missing_section_ids'], [999999])
        self.assertEqual(
            [item['section_id'] for item in body['schedule']],
            [self.lab.id, self.lecture.id],
        )
        self.assertEqual(body['schedule'][0]['credits'], '0')
        self.assertEqual(body['schedule'][1]['credits'], '4')
        self.assertEqual(
            body['schedule'][0]['schedule_group_id'],
            f'{self.lab.id}-{self.lecture.id}',
        )
        self.assertEqual(
            body['schedule'][1]['schedule_group_id'],
            f'{self.lab.id}-{self.lecture.id}',
        )


class ScheduleTimeConflictTests(TestCase):
    def setUp(self):
        campus = Campus.objects.create(name='Main Campus')
        semester = Semester.objects.create(name='Fall 2026', campus=campus)
        topic = Topics.objects.create(name='CPT_S', semester=semester)
        course = Course.objects.create(
            subject='CPT_S',
            course_number=121,
            name='Programming Methods',
            credits='3',
            topic=topic,
        )
        self.morning_section = Section.objects.create(
            code=1001,
            section=1,
            days='MWF',
            time='10:00 AM - 10:50 AM',
            course=course,
        )
        self.overlapping_section = Section.objects.create(
            code=1002,
            section=2,
            days='M',
            time='10:30 AM - 11:20 AM',
            course=course,
        )
        self.back_to_back_section = Section.objects.create(
            code=1003,
            section=3,
            days='M',
            time='10:50 AM - 11:40 AM',
            course=course,
        )
        self.online_section = Section.objects.create(
            code=1004,
            section=4,
            days='N/A',
            time='N/A',
            course=course,
        )

    def test_parse_time_handles_12_hour_and_24_hour_formats(self):
        self.assertEqual(parse_time('12:00 AM'), 0)
        self.assertEqual(parse_time('12:00 PM'), 720)
        self.assertEqual(parse_time('2:55 PM'), 895)
        self.assertEqual(parse_time('14:55'), 895)
        self.assertEqual(parse_time('14.55'), 895)

    def test_sections_overlap_requires_shared_day_and_overlapping_time(self):
        self.assertTrue(sections_overlap(self.morning_section, self.overlapping_section))
        self.assertFalse(sections_overlap(self.morning_section, self.back_to_back_section))
        self.assertFalse(sections_overlap(self.morning_section, self.online_section))
