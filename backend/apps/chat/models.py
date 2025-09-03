from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models


User = get_user_model()


class Conversation(models.Model):
    title = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        indexes = [
            models.Index(fields=["updated_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"Conversation({self.pk})"


class Message(models.Model):
    ROLE_CHOICES = (
        ("system", "system"),
        ("user", "user"),
        ("assistant", "assistant"),
        ("tool", "tool"),
    )

    conversation = models.ForeignKey(
        Conversation, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    # Optional vectorized search/index field for future retrieval
    search_vector = SearchVectorField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            GinIndex(fields=["search_vector"], name="msg_search_gin_idx"),
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"Message({self.role}, {self.created_at:%Y-%m-%d %H:%M:%S})"
