from typing import Callable
from django.http import HttpRequest, HttpResponse


def healthcheck_middleware(get_response: Callable[[HttpRequest], HttpResponse]):
    def middleware(request: HttpRequest) -> HttpResponse:
        return get_response(request)

    return middleware
