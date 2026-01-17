# api/deps.py
from __future__ import annotations

from functools import lru_cache

from core.config import get_settings
from services.mock_whale_provider import MockWhaleProvider
from services.remote_whale_provider import RemoteWhaleProvider
from services.whale_provider import WhaleDataProvider


@lru_cache
def get_whale_provider() -> WhaleDataProvider:
    settings = get_settings()
    if settings.WHALE_PROVIDER == "remote":
        return RemoteWhaleProvider()
    return MockWhaleProvider()
