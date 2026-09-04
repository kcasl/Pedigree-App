"""Pedigree FastAPI — Google 인증, 족보 스냅샷, 공개 공유."""

import base64
import gzip
import json
import os
import secrets
import string

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .crud import (
    apply_snapshot_patch,
    create_shared_pedigree,
    delete_snapshot,
    get_shared_pedigree,
    get_snapshot,
    get_user_by_google_sub,
    upsert_snapshot,
    upsert_user,
    verify_google_access_token,
    verify_google_identity,
)
from .database import Base, SessionLocal, engine, get_db
from .schemas import (
    GoogleLoginRequest,
    ShareCreateRequest,
    ShareCreateResponse,
    ShareGetResponse,
    SnapshotPatchRequest,
    SnapshotResponse,
    SnapshotUpsertRequest,
    UserResponse,
)
from .config import settings
from .images import (
    MAX_UPLOAD_BYTES,
    delete_local_upload,
    save_compressed_photo,
)
from .models import User

SHARE_KEY_ALPHABET = string.ascii_letters + string.digits
SHARE_KEY_LENGTH = 10


def generate_share_key(db: Session) -> str:
    """충돌 없는 10자리 공개 공유 키를 할당한다."""
    for _ in range(20):
        key = "".join(secrets.choice(SHARE_KEY_ALPHABET) for _ in range(SHARE_KEY_LENGTH))
        if not get_shared_pedigree(db, key):
            return key
    raise HTTPException(status_code=500, detail="failed to allocate share key")

app = FastAPI(title="Pedigree API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


def ensure_shared_pedigree_schema() -> None:
    """shared_pedigrees 테이블/device_id 컬럼이 없으면 추가한다."""
    from sqlalchemy import text

    with engine.begin() as conn:
        table_exists = conn.execute(
            text(
                """
                SELECT COUNT(*) AS cnt
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'shared_pedigrees'
                """
            )
        ).scalar()
        if not table_exists:
            conn.execute(
                text(
                    """
                    CREATE TABLE shared_pedigrees (
                      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                      share_key VARCHAR(32) NOT NULL,
                      device_id VARCHAR(64) NULL,
                      store_json JSON NOT NULL,
                      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      PRIMARY KEY (id),
                      UNIQUE KEY uk_shared_share_key (share_key),
                      KEY ix_shared_pedigrees_device_id (device_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
            )
            return

        col_exists = conn.execute(
            text(
                """
                SELECT COUNT(*) AS cnt
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'shared_pedigrees'
                  AND COLUMN_NAME = 'device_id'
                """
            )
        ).scalar()
        if col_exists:
            return
        conn.execute(
            text(
                """
                ALTER TABLE shared_pedigrees
                ADD COLUMN device_id VARCHAR(64) NULL
                """
            )
        )
        try:
            conn.execute(
                text(
                    """
                    CREATE INDEX ix_shared_pedigrees_device_id
                    ON shared_pedigrees (device_id)
                    """
                )
            )
        except Exception:  # noqa: BLE001
            pass


@app.on_event("startup")
def on_startup() -> None:
    import time

    from sqlalchemy import text

    # MySQL이 API보다 늦게 뜨는 경우 대비
    last_err: Exception | None = None
    for attempt in range(30):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            last_err = None
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(1)
    if last_err is not None:
        raise RuntimeError(f"MySQL unavailable at startup: {last_err}") from last_err

    Base.metadata.create_all(bind=engine)
    ensure_shared_pedigree_schema()


@app.get("/health")
def health() -> dict[str, str]:
    """프로세스 생존만 확인(DB 미사용). DB는 /health/db 사용."""
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    """앱과 동일하게 API→MySQL(127.0.0.1) 연결 확인."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "db_host": settings.db_host,
            "db_name": settings.db_name,
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"db unavailable ({settings.db_host}:{settings.db_port}): {exc}",
        ) from exc


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    return authorization[len(prefix) :].strip() or None


def get_identity_from_access_token(authorization: str | None) -> dict | None:
    token = extract_bearer_token(authorization)
    if not token:
        return None
    return verify_google_access_token(token)


def require_google_user(
    google_sub: str,
    authorization: str | None,
    db: Session,
) -> User:
    """경로의 google_sub와 Bearer 토큰 주체가 같은 사용자를 반환한다."""
    try:
        identity = get_identity_from_access_token(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid access token")
    if not identity:
        raise HTTPException(status_code=401, detail="access token is required")
    if identity.get("google_sub") != google_sub:
        raise HTTPException(status_code=403, detail="forbidden")

    user = get_user_by_google_sub(db, google_sub)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return user


@app.post("/v1/auth/google", response_model=UserResponse)
def google_login(
    payload: GoogleLoginRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Bearer access token 우선, 없으면 id_token으로 사용자를 업서트한다."""
    identity = None
    try:
        identity = get_identity_from_access_token(authorization)
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid access token")

    if not identity:
        try:
            identity = verify_google_identity(payload)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=401, detail="invalid id token") from exc
    if not identity.get("google_sub") or not identity.get("email"):
        raise HTTPException(status_code=400, detail="google_sub/email is required")

    user = upsert_user(db, identity)
    return UserResponse(
        id=user.id,
        google_sub=user.google_sub,
        email=user.email,
        name=user.name,
        photo_url=user.photo_url,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.get("/v1/pedigree/{google_sub}", response_model=SnapshotResponse)
def get_pedigree(
    google_sub: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SnapshotResponse:
    """로그인 사용자의 족보 스냅샷. 없으면 빈 people_by_id."""
    user = require_google_user(google_sub, authorization, db)

    snapshot = get_snapshot(db, user.id)
    return SnapshotResponse(
        user_id=user.id,
        people_by_id=snapshot.people_json if snapshot else {},
        updated_at=snapshot.updated_at if snapshot else user.updated_at,
    )


@app.put("/v1/pedigree/{google_sub}", response_model=SnapshotResponse)
def put_pedigree(
    google_sub: str,
    payload: SnapshotUpsertRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SnapshotResponse:
    """족보 전체 덮어쓰기. 로컬 병합은 클라이언트가 수행한다."""
    user = require_google_user(google_sub, authorization, db)

    snapshot = upsert_snapshot(db, user.id, payload.people_by_id)
    return SnapshotResponse(
        user_id=user.id,
        people_by_id=snapshot.people_json,
        updated_at=snapshot.updated_at,
    )


@app.delete("/v1/pedigree/{google_sub}")
def remove_pedigree(
    google_sub: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    user = require_google_user(google_sub, authorization, db)
    deleted = delete_snapshot(db, user.id)
    return {"deleted": deleted}


@app.patch("/v1/pedigree/{google_sub}", response_model=SnapshotResponse)
def patch_pedigree(
    google_sub: str,
    payload: SnapshotPatchRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SnapshotResponse:
    """부분 갱신. compressed면 gzip+base64 payload_b64를 풀어 upserts/deletes로 쓴다."""
    user = require_google_user(google_sub, authorization, db)

    upserts = payload.upserts
    deletes = payload.deletes

    if payload.compressed:
        if not payload.payload_b64:
            raise HTTPException(status_code=400, detail="payload_b64 is required when compressed")
        try:
            raw = base64.b64decode(payload.payload_b64.encode("utf-8"))
            decoded = gzip.decompress(raw).decode("utf-8")
            body = json.loads(decoded)
            upserts = body.get("upserts", {})
            deletes = body.get("deletes", [])
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="invalid compressed payload") from exc

    snapshot = apply_snapshot_patch(db, user.id, upserts, deletes)
    return SnapshotResponse(
        user_id=user.id,
        people_by_id=snapshot.people_json,
        updated_at=snapshot.updated_at,
    )


@app.post("/v1/share/pedigree", response_model=ShareCreateResponse)
def create_pedigree_share(payload: ShareCreateRequest) -> ShareCreateResponse:
    """공개 족보 공유 생성 — 로그인 불필요. `{google_sub}` 경로와 충돌 방지를 위해 /v1/share 사용."""
    import time

    store = payload.store
    if not isinstance(store, dict) or "views" not in store:
        raise HTTPException(status_code=400, detail="invalid store payload")

    last_err: Exception | None = None
    for attempt in range(5):
        session = SessionLocal()
        try:
            key = generate_share_key(session)
            create_shared_pedigree(session, key, store, device_id=payload.device_id)
            return ShareCreateResponse(key=key)
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            try:
                session.rollback()
            except Exception:  # noqa: BLE001
                pass
            # 대용량 업로드 직중 MySQL이 재시작된 경우 풀 리셋 후 재시도
            try:
                engine.dispose()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.8 * (attempt + 1))
        finally:
            try:
                session.close()
            except Exception:  # noqa: BLE001
                pass

    raise HTTPException(
        status_code=500,
        detail=f"share create failed after retries: {last_err}",
    )


@app.get("/v1/share/pedigree/{share_key}", response_model=ShareGetResponse)
def get_pedigree_share(
    share_key: str,
    db: Session = Depends(get_db),
) -> ShareGetResponse:
    """공개 키로 족보 조회 — 로그인 불필요."""
    row = get_shared_pedigree(db, share_key.strip())
    if not row:
        raise HTTPException(status_code=404, detail="invalid share key")
    return ShareGetResponse(
        key=row.share_key,
        store=row.store_json if isinstance(row.store_json, dict) else {},
        created_at=row.created_at,
    )


@app.post("/v1/share/uploads/photo")
async def upload_share_photo(
    file: UploadFile = File(...),
    previous_url: str | None = None,
) -> dict[str, str]:
    """공개 공유용 사진 업로드 — 로그인 불필요. WebP(실패 시 JPEG)로 압축."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="only image file is allowed")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="empty file")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file too large (max 15MB)")

    try:
        _filename, url = save_compressed_photo(image_bytes, "share")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if previous_url and previous_url != url:
        delete_local_upload(previous_url)

    return {"url": url}


@app.post("/v1/uploads/photo")
async def upload_photo(
    google_sub: str,
    file: UploadFile = File(...),
    previous_url: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """인물 사진 업로드. 640px WebP(q75, 실패 시 JPEG) 저장. previous_url 있으면 교체 삭제."""
    require_google_user(google_sub, authorization, db)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="only image file is allowed")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="empty file")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file too large (max 15MB)")

    try:
        _filename, url = save_compressed_photo(image_bytes, google_sub)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if previous_url and previous_url != url:
        delete_local_upload(previous_url)

    return {"url": url}
