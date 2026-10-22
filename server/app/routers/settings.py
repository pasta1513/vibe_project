"""설정 (API-SPEC §3, §8). 주소는 API-SPEC §12."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..outfits import DEFAULTS, TEMPLATES
from ..models import Settings
from ..responses import ApiError, ok

router = APIRouter(prefix="/api/settings")

# 고를 수 있는 지역: 시·도 17곳 (사람이 정함, 2026-10-21). 저장한 지역이 없으면 서울을 씁니다. (PRD §5)
# 진짜 날씨 서비스를 연결할 때 이 이름으로 날씨를 받을 수 있는지 다시 봅니다.
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원",
           "충북", "충남", "전북", "전남", "경북", "경남", "제주"]


class MannequinIn(BaseModel):
    # 정해진 코드가 아니면 입력 오류로 실패합니다. (DATA-MODEL §12.1, TEST-PLAN T-81)
    gender: Literal["female", "male"]
    height: Literal["short", "medium", "tall"]
    body: Literal["slim", "medium", "chubby"]


class RegionIn(BaseModel):
    region: str


def _outfit_table() -> dict:
    """등록 창 미리보기가 서버와 같은 규칙으로 틀을 고르게 합니다. (D-016)"""
    return {"outfit_templates": TEMPLATES, "outfit_defaults": DEFAULTS}


def _settings_data(settings: Settings | None) -> dict:
    if settings is None:
        return {"mannequin": None, "home_region": None, "regions": REGIONS, **_outfit_table()}
    return {
        "mannequin": {
            "gender": settings.mannequin_gender,
            "height": settings.mannequin_height,
            "body": settings.mannequin_body,
        },
        "home_region": settings.home_region,
        "regions": REGIONS,
        **_outfit_table(),
    }


# 앱 열기: 마네킹 모양이 없으면 화면이 마네킹 고르기 창을 띄웁니다.
@router.get("")
def read_settings(session: Session = Depends(get_session)):
    return ok(_settings_data(session.get(Settings, 1)))


# 시작하기, 마네킹 모양 바꾸기
@router.put("/mannequin")
def save_mannequin(body: MannequinIn, session: Session = Depends(get_session)):
    settings = session.get(Settings, 1)
    if settings is None:
        settings = Settings(id=1, mannequin_gender=body.gender,
                            mannequin_height=body.height, mannequin_body=body.body)
    else:
        settings.mannequin_gender = body.gender
        settings.mannequin_height = body.height
        settings.mannequin_body = body.body
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return ok(_settings_data(settings)["mannequin"])


# 내 지역 저장하기. 목록에 있는 지역만 받습니다.
@router.put("/region")
def save_region(body: RegionIn, session: Session = Depends(get_session)):
    if body.region not in REGIONS:
        raise ApiError("unknown_region", "그 지역은 찾지 못했어요. 목록에서 골라 주세요.")
    settings = session.get(Settings, 1)
    if settings is None:
        raise ApiError("no_mannequin", "마네킹 모양을 먼저 골라 주세요.")
    settings.home_region = body.region
    session.add(settings)
    session.commit()
    return ok({"home_region": settings.home_region})
