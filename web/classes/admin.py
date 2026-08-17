from django.contrib import admin
from .models import Campus, Semester, Topics, Course, Section, DailyAnalyticsMetric
# Register your models here.

admin.site.register(Campus)
admin.site.register(Semester)
admin.site.register(Topics)
admin.site.register(Course)
admin.site.register(Section)


@admin.register(DailyAnalyticsMetric)
class DailyAnalyticsMetricAdmin(admin.ModelAdmin):
    list_display = ('event_date', 'event_name', 'count', 'updated_at')
    list_filter = ('event_name', 'event_date')
    ordering = ('-event_date', 'event_name')
    readonly_fields = ('event_date', 'event_name', 'count', 'updated_at')

