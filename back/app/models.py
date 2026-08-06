from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.mysql import JSON as MySQLJSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    google_sub: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    snapshot: Mapped["PedigreeSnapshot | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class PedigreeSnapshot(Base):
    __tablename__ = "pedigree_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    people_json: Mapped[dict] = mapped_column(MySQLJSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="snapshot")


class SharedPedigree(Base):
    """공개 공유 키로 조회하는 족보 스냅샷 (로그인 불필요)."""

    __tablename__ = "shared_pedigrees"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    share_key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    # 기기당 최신 1건만 유지할 때 사용
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    store_json: Mapped[dict] = mapped_column(MySQLJSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
