from django.urls import path
from . import views

urlpatterns = [
    path("", views.test, name="test"),
    path("<int:campusid>", views.viewCampus, name="viewCampus"),
]