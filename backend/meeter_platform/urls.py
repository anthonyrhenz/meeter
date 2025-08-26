from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

api = NinjaAPI(title="Meeter API", version="0.1.0")


@api.get("/health", auth=None)
def health(request):
    return {"status": "ok"}


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]
