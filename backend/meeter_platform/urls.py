from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI
from apps.chat.api import router as chat_router

api = NinjaAPI(title="Meeter API", version="0.1.0")
api.add_router("/chat", chat_router)


@api.get("/health", auth=None)
def health(request):
    return {"status": "ok"}


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]
