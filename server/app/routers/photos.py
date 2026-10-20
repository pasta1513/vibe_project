"""사진과 2D 이미지 받아 오기 (API-SPEC §2.4, §12)."""

from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..photos import find_file
from ..responses import ApiError

router = APIRouter(prefix="/api/photos")


@router.get("/{name}")
def read_photo(name: str):
    path = find_file(name)
    if path is None:
        raise ApiError("photo_not_found", "사진 파일을 찾지 못했어요.", 404)
    return FileResponse(path)
