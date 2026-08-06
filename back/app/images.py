"""업로드 이미지 압축·로컬 파일 정리."""

from __future__ import annotations

import io
import os
import uuid
from urllib.parse import urlparse

from PIL import Image

from .config import settings

# 족보 카드 아바타용 — 640px면 충분하고 용량이 크게 줄어듦
PHOTO_MAX_EDGE = 640
WEBP_QUALITY = 75
JPEG_QUALITY = 75
# 원본 업로드 상한 (압축 전)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


def compress_person_photo(image_bytes: bytes) -> tuple[bytes, str, str]:
    """
    이미지를 리사이즈·압축한다.
    Returns: (file_bytes, extension_without_dot, media_type)
    WebP 우선, 실패 시 JPEG.
    """
    image: Image.Image | None = None
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = image.convert("RGB")
        image.thumbnail((PHOTO_MAX_EDGE, PHOTO_MAX_EDGE))

        webp_buf = io.BytesIO()
        try:
            # method=4: 메모리/CPU 부담을 낮춰 소형 인스턴스 OOM 완화
            image.save(
                webp_buf,
                format="WEBP",
                quality=WEBP_QUALITY,
                method=4,
            )
            data = webp_buf.getvalue()
            if data:
                return data, "webp", "image/webp"
        except Exception:  # noqa: BLE001
            pass

        jpeg_buf = io.BytesIO()
        image.save(jpeg_buf, format="JPEG", optimize=True, quality=JPEG_QUALITY)
        return jpeg_buf.getvalue(), "jpg", "image/jpeg"
    except Exception as exc:  # noqa: BLE001
        raise ValueError("invalid image format") from exc
    finally:
        if image is not None:
            try:
                image.close()
            except Exception:  # noqa: BLE001
                pass


def build_upload_filename(prefix: str, ext: str) -> str:
    safe_prefix = "".join(c if c.isalnum() or c in "-_" else "_" for c in prefix)[:80]
    return f"{safe_prefix}_{uuid.uuid4().hex}.{ext}"


def save_compressed_photo(image_bytes: bytes, filename_prefix: str) -> tuple[str, str]:
    """
    압축 저장 후 (filename, public_url) 반환.
    """
    data, ext, _media = compress_person_photo(image_bytes)
    filename = build_upload_filename(filename_prefix, ext)
    os.makedirs(settings.upload_dir, exist_ok=True)
    save_path = os.path.join(settings.upload_dir, filename)
    with open(save_path, "wb") as f:
        f.write(data)
    url = f"{settings.public_base_url.rstrip('/')}/uploads/{filename}"
    return filename, url


def local_upload_path_from_url(url: str | None) -> str | None:
    """우리 서버 /uploads/ URL이면 로컬 절대경로, 아니면 None."""
    if not url or not isinstance(url, str):
        return None
    parsed = urlparse(url.strip())
    path = parsed.path if parsed.scheme else url.strip()
    marker = "/uploads/"
    idx = path.find(marker)
    if idx < 0:
        return None
    filename = path[idx + len(marker) :].lstrip("/\\")
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        return None
    upload_root = os.path.abspath(settings.upload_dir)
    full = os.path.abspath(os.path.join(upload_root, filename))
    if not full.startswith(upload_root + os.sep) and full != upload_root:
        return None
    return full


def delete_local_upload(url: str | None) -> bool:
    """로컬 uploads 파일이면 삭제. 성공 여부 반환."""
    full = local_upload_path_from_url(url)
    if not full or not os.path.isfile(full):
        return False
    try:
        os.remove(full)
        return True
    except OSError:
        return False


def collect_photo_uris(people_by_id: dict | None) -> set[str]:
    urls: set[str] = set()
    if not isinstance(people_by_id, dict):
        return urls
    for person in people_by_id.values():
        if not isinstance(person, dict):
            continue
        uri = person.get("photoUri")
        if isinstance(uri, str) and uri.strip():
            urls.add(uri.strip())
    return urls


def delete_orphaned_uploads(old_people: dict | None, new_people: dict | None) -> None:
    """스냅샷 갱신 후 더 이상 참조되지 않는 로컬 사진 삭제."""
    old_urls = collect_photo_uris(old_people)
    new_urls = collect_photo_uris(new_people)
    for url in old_urls - new_urls:
        delete_local_upload(url)
