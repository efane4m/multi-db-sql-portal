from django.urls import path
from .views import SchemaView, TablesView, ColumnsView, PreviewView, SuggestionsView

urlpatterns = [
    path('<str:database>/schema/', SchemaView.as_view()),
    path('<str:database>/tables/', TablesView.as_view()),
    path('<str:database>/tables/<str:table>/columns/', ColumnsView.as_view()),
    path('<str:database>/tables/<str:table>/preview/', PreviewView.as_view()),
    path('<str:database>/tables/<str:table>/suggestions/', SuggestionsView.as_view()),
]
