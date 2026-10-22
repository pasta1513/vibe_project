"""사진 올리기와 임시 사진 버리기 (API-SPEC §4)."""

import io
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from PIL import Image
from sqlmodel import Session, select

from .. import photos
from ..db import get_session
from ..external import ExternalError, ai, imaging
from ..models import Keyword
from ..responses import ApiError, ok
from .keywords import keyword_data

router = APIRouter(prefix="/api/uploads")


# 사진 올리기, 사진 다시 올리기 (다시 올리면 이전 임시 사진 번호를 함께 보냄)
@router.post("")
async def upload_photo(file: UploadFile = File(...),
                       previous_upload_id: Optional[str] = Form(None),
                       session: Session = Depends(get_session)):
    content = await file.read(photos.MAX_BYTES + 1)
    if len(content) > photos.MAX_BYTES:
        raise ApiError("too_big", "10MB보다 작은 사진만 올릴 수 있어요.")
    ext = photos.detect_extension(content[:16])
    if ext is None:
        raise ApiError("not_image", "사진 파일(JPG, PNG, WEBP)만 올릴 수 있어요.")

    # 사진을 다시 올리면 이전 임시 파일은 바로 버립니다. (DATA-MODEL §8)
    if previous_upload_id:
        photos.discard_upload(previous_upload_id)

    photos.ensure_dirs()
    upload_id = photos.new_upload_id()
    original = photos.TEMP_DIR / f"{upload_id}-original.{ext}"
    # 2D 이미지는 배경이 투명해야 해서 늘 PNG입니다. (D-015)
    image = photos.TEMP_DIR / f"{upload_id}-image.png"
    original.write_bytes(content)
    try:
        imaging.make_2d_image(original, image)
    except ExternalError:
        photos.discard_upload(upload_id)
        raise ApiError("imaging_failed", "2D 이미지를 만들지 못했어요.", 502)
    # 무늬 그림 (D-016, P-32). 만들지 못해도 실패가 아니고, 마네킹에는 대표 색만 칠합니다.
    pattern = photos.TEMP_DIR / f"{upload_id}-pattern.svg"
    has_pattern = imaging.make_pattern(image, pattern)

    # AI가 원래 사진을 보고 구분과 키워드를 미리 고릅니다. 못 고르면 None입니다.
    candidates = [{"kind": k.kind, **keyword_data(k)}
                  for k in session.exec(select(Keyword)).all()]
    picked = ai.pick_keywords(original, candidates)

    return ok({
        "upload_id": upload_id,
        "photo_url": photos.url_for(original.name),
        "image_url": photos.url_for(image.name),
        "main_color": imaging.main_color(image),
        "pattern_url": photos.url_for(pattern.name) if has_pattern else None,
        "picked": picked,
    })


# 배경 고치고 적용 (API-SPEC §4, P-34): 화면이 고친 2D 이미지(PNG)로 임시 2D 이미지를 바꿉니다.
# 사용자가 고친 이미지는 배경을 다시 지우지 않고, 대표 색과 무늬 그림만 다시 만듭니다.
@router.put("/{upload_id}/image")
async def apply_edited_image(upload_id: str, file: UploadFile = File(...)):
    content = await file.read(photos.MAX_BYTES + 1)
    if len(content) > photos.MAX_BYTES:
        raise ApiError("too_big", "10MB보다 작은 이미지만 적용할 수 있어요.")
    if photos.detect_extension(content[:16]) != "png":
        raise ApiError("not_png", "PNG 이미지만 적용할 수 있어요.")
    files = photos.temp_files(upload_id)
    if not {"original", "image"} <= set(files):
        raise ApiError("upload_missing", "올린 사진이 없어졌어요. 사진을 다시 올려 주세요.")
    try:
        with Image.open(io.BytesIO(content)) as edited:
            edited.load()
            size = edited.size
            edited = edited.convert("RGBA")
    except (OSError, ValueError, Image.DecompressionBombError):
        raise ApiError("not_png", "PNG 이미지만 적용할 수 있어요.") from None
    if size != imaging.working_size(files["original"]):
        raise ApiError("size_mismatch", "이미지 크기가 맞지 않아요. [초기화]한 뒤 다시 고쳐 주세요.")

    # 다 쓴 뒤에 바꿔서, 쓰다가 실패해도 이전 2D 이미지가 남게 합니다.
    image = files["image"]
    staged = image.with_name(image.stem + ".tmp.png")
    edited.save(staged, "PNG")
    staged.replace(image)
    pattern = photos.TEMP_DIR / f"{upload_id}-pattern.svg"
    pattern.unlink(missing_ok=True)
    has_pattern = imaging.make_pattern(image, pattern, remove=False)
    # 같은 파일 이름이라 브라우저가 이전 그림을 다시 쓰지 않게 주소 뒤에 버전을 붙입니다.
    version = f"?v={image.stat().st_mtime_ns}"
    return ok({
        "image_url": photos.url_for(image.name) + version,
        "main_color": imaging.main_color(image, remove=False),
        "pattern_url": photos.url_for(pattern.name) + version if has_pattern else None,
    })


# [✕]로 창 닫기: 임시 사진과 2D 이미지를 바로 버립니다.
@router.delete("/{upload_id}")
def discard_upload(upload_id: str):
    photos.discard_upload(upload_id)
    return ok(None)
