from django.urls import path
from . import views

urlpatterns = [
    path("<int:campusid>", views.viewCampus, name="viewCampus"),
    path('schedule/', views.schedule_view, name='schedule'),
    path('search/', views.search_courses, name='search_courses'),
    path('add-to-schedule/<int:section_id>/', views.add_to_schedule, name='add_to_schedule'),
    path('remove-from-schedule/<int:section_id>/', views.remove_from_schedule, name='remove_from_schedule'),
    path('api/schedule-data/', views.get_schedule_data, name='get_schedule_data'),
]
