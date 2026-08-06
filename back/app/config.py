from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# systemd cwd와 무관하게 back/.env 를 찾도록 절대경로 사용
_BACK_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACK_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.is_file() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "pedigree_app"
    google_client_id: str | None = None
    public_base_url: str = "http://127.0.0.1:8000"
    upload_dir: str = "uploads"

    @property
    def sqlalchemy_database_uri(self) -> str:
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )


settings = Settings()
