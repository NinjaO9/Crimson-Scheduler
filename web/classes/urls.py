from django.urls import path
from . import views

urlpatterns = [
    path('', views.schedule_view, name='schedule'),
    path('privacy-policy/', views.privacy_policy, name='privacy_policy'),
    path('terms-of-service/', views.terms_of_service, name='terms_of_service'),
    path('contact/', views.contact, name='contact'),
    path("<int:campusid>", views.viewCampus, name="viewCampus"),
    path('search/', views.search_courses, name='search_courses'),
    path('add-to-schedule/<int:section_id>/', views.add_to_schedule, name='add_to_schedule'),
    path('remove-from-schedule/<int:section_id>/', views.remove_from_schedule, name='remove_from_schedule'),
    path('api/schedule-data/', views.get_schedule_data, name='get_schedule_data'),
    path('api/sections-by-ids/', views.get_sections_by_ids, name='get_sections_by_ids'),
]
