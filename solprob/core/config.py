# core/config.py
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # general
    ENV: Literal["local", "dev", "staging", "prod"] = "local"
    APP_NAME: str = "moby-whale-backend"

    # whale provider selection: "mock" for now, "remote" when AssetDash API is ready
    WHALE_PROVIDER: Literal["mock", "remote"] = "mock"

    # remote whale API (AssetDash / Moby whale data)
    WHALE_API_BASE_URL: AnyHttpUrl | None = None
    WHALE_API_KEY: str | None = None
    WHALE_API_TIMEOUT_SECONDS: float = 5.0
    WHALE_API_MAX_RETRIES: int = 2

    # logging
    LOG_LEVEL: str = "INFO"

    # 👉 this is the important part
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",   # ignore unrelated env vars like X_BEARER
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
