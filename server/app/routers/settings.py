"""설정 (API-SPEC §3, §8). 주소는 API-SPEC §12."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..models import Settings
from ..responses import ok

router = APIRouter(prefix="/api/settings")


class MannequinIn(BaseModel):
    # 정해진 코드가 아니면 입력 오류로 실패합니다. (DATA-MODEL §12.1, TEST-PLAN T-81)
    gender: Literal["female", "male"]
    height: Literal["short", "medium", "tall"]
    body: Literal["slim", "medium", "chubby"]


def _settings_data(settings: Settings | None) -> dict:
    if settings is None:
        return {"mannequin": None, "home_region": None}
    return {
        "mannequin": {
            "gender": settings.mannequin_gender,
            "height": settings.mannequin_height,
            "body": settings.mannequin_body,
        },
        "home_region": settings.home_region,
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
