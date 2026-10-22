"""사진 폴더 (DATA-MODEL §3, §8).

정식 파일은 data/photos/, 등록을 마치지 않은 임시 파일은 data/photos/temp/에 둡니다.
파일 이름: <무작위 32자>-original.<확장자> (원래 사진), <무작위 32자>-image.<확장자> (2D 이미지)
P-30부터 새로 만드는 2D 이미지는 배경이 투명한 PNG입니다 (D-015). 그 전에 만든 것은 원래 사진과 확장자가 같습니다.
"""

import re
import shutil
import uuid
from pathlib import Path

from .db import DATA_DIR

PHOTO_DIR = DATA_DIR / "photos"
TEMP_DIR = PHOTO_DIR / "temp"

# 받는 사진: JPG, PNG, WEBP, 한 장에 10MB까지 (API-SPEC §10, 사람이 정함 2026-10-20)
MAX_BYTES = 10 * 1024 * 1024
FILE_NAME = re.compile(r"^[0-9a-f]{32}-(original|image)\.(jpg|png|webp)$")
UPLOAD_ID = re.compile(r"^[0-9a-f]{32}$")


def ensure_dirs() -> None:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def clear_temp() -> None:
    """서버를 켤 때 남은 임시 파일을 버립니다. (DATA-MODEL §8)"""
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    ensure_dirs()


def detect_extension(head: bytes) -> str | None:
    """확장자가 아니라 파일 앞부분을 보고 사진 종류를 정합니다."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def new_upload_id() -> str:
    return uuid.uuid4().hex


def temp_files(upload_id: str) -> dict[str, Path]:
    """임시 사진 번호로 임시 파일을 찾습니다. {"original": 경로, "image": 경로}"""
    if not UPLOAD_ID.match(upload_id or ""):
        return {}
    found = {}
    for path in TEMP_DIR.glob(f"{upload_id}-*"):
        match = FILE_NAME.match(path.name)
        if match:
            found[match.group(1)] = path
    return found


def discard_upload(upload_id: str) -> None:
    for path in temp_files(upload_id).values():
        path.unlink(missing_ok=True)


def find_file(name: str) -> Path | None:
    """정해진 모양의 파일 이름만 찾습니다. 다른 폴더의 파일은 읽을 수 없습니다."""
    if not FILE_NAME.match(name):
        return None
    for folder in (PHOTO_DIR, TEMP_DIR):
        path = folder / name
        if path.is_file():
            return path
    return None


def url_for(name: str) -> str:
    return f"/api/photos/{name}"
