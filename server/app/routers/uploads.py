"""사진 올리기와 임시 사진 버리기 (API-SPEC §4)."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
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

    # AI가 원래 사진을 보고 구분과 키워드를 미리 고릅니다. 못 고르면 None입니다.
    candidates = [{"kind": k.kind, **keyword_data(k)}
                  for k in session.exec(select(Keyword)).all()]
    picked = ai.pick_keywords(original, candidates)

    return ok({
        "upload_id": upload_id,
        "photo_url": photos.url_for(original.name),
        "image_url": photos.url_for(image.name),
        "main_color": imaging.main_color(image),
        "picked": picked,
    })


# [✕]로 창 닫기: 임시 사진과 2D 이미지를 바로 버립니다.
@router.delete("/{upload_id}")
def discard_upload(upload_id: str):
    photos.discard_upload(upload_id)
    return ok(None)
