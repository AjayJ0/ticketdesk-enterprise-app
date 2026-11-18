import json
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "TicketDesk Enterprise"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security & JWT
    SECRET_KEY: str = "change-this-in-production-to-a-secure-256-bit-hex-secret-key-0987654321"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # PostgreSQL Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "ticketdesk"
    POSTGRES_PASSWORD: str = "ticketdesk_secret"
    POSTGRES_DB: str = "ticketdesk_db"
    DATABASE_URL: str = "postgresql+psycopg://ticketdesk:ticketdesk_secret@localhost:5432/ticketdesk_db"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        return v

    # File Storage Configuration (local | s3)
    STORAGE_PROVIDER: str = "local"
    LOCAL_UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent.parent / "uploads")
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_EXTENSIONS: str = "pdf,png,jpg,jpeg,txt"

    # AWS S3 Settings
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "ticketdesk-enterprise-attachments"
    S3_PRESIGNED_URL_EXPIRATION: int = 3600

    # Optional SMTP Settings
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.example.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@ticketdesk.enterprise"

    @property
    def allowed_extensions_set(self) -> set[str]:
        return {ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",") if ext.strip()}

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
