from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from queries.access import available_databases
from queries.views import ExecuteQueryView  # backwards-compatible import

# Create your views here.

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        user = request.user
        photo_url = request.build_absolute_uri(user.photo.url) if user.photo else None
        return Response({'username': user.username,'full_name': user.full_name,'position': user.position,'role': user.role,'photo': photo_url})

class AvailableDatabasesView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response({'databases': available_databases(request.user)})
