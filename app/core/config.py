import os
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent

ALLOWED_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


class Settings(BaseSettings):
    PORT: int = 8080
    HOST: str = "0.0.0.0"

    DATABASE_URL: str = "sqlite:///./database.db"

    GROQ_API_KEY: SecretStr
    COHERE_API_KEY: SecretStr

    UPLOAD_DIR: str = str(BASE_DIR / "storage" / "uploads")
    FAISS_DIR: str = str(BASE_DIR / "storage" / "faiss_indexes")
    LOG_DIR: str = str(BASE_DIR / "storage" / "logs")
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        normalized = v.upper()
        if normalized not in ALLOWED_LOG_LEVELS:
            raise ValueError(f"LOG_LEVEL must be one of {sorted(ALLOWED_LOG_LEVELS)}, got '{v}'")
        return normalized

    @field_validator("PORT")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError(f"PORT must be between 1 and 65535, got {v}")
        return v


settings = Settings()


def ensure_directories() -> None:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.FAISS_DIR, exist_ok=True)
    os.makedirs(settings.LOG_DIR, exist_ok=True)