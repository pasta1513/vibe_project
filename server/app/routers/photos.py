"""사진, 2D 이미지, 무늬 그림 받아 오기 (API-SPEC §2.4, §12)."""

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
    if path.suffix == ".svg":
        # 무늬 그림은 path만 들어 있지만, 주소를 직접 열어도 스크립트가 실행되지 않게 막습니다. (P-32)
        return FileResponse(path, media_type="image/svg+xml", headers={
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
        })
    return FileResponse(path)
