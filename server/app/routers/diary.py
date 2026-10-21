"""코디 일기 (API-SPEC §5.3, §6). P-19에서는 확정하기만 만듭니다. 목록, 입혀 보기, 지우기는 P-20."""

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import DiaryEntry, Settings, StyleTag
from ..responses import ApiError, confirm, ok
from ..rules import SLOTS
from .scores import OutfitIn, check_outfit_or_fail

router = APIRouter(prefix="/api/diary")

MIN_SCORE, MAX_SCORE = 0.1, 5.0


class WeatherIn(BaseModel):
    # 날씨 칸은 모두 있어야 합니다. 빠지면 입력 오류입니다. (D-006, TEST-PLAN T-70)
    region: str = Field(min_length=1)
    min_temp: float
    max_temp: float
    condition: Literal["clear", "cloudy", "rain", "snow"]


class NoteIn(BaseModel):
    score: float
    note_type: Literal["reason", "comment"]
    summary: str = Field(min_length=1)
    details: dict[str, str] = {}


class DiaryIn(BaseModel):
    outfit: OutfitIn
    day: date = Field(alias="date")
    weather: WeatherIn
    tag_id: Optional[int] = None
    result: NoteIn
    # 같은 날짜 확인 질문에서 [바꾸기]를 눌렀을 때 true로 다시 보냅니다.
    confirmed: bool = False


# 확정하기. 점수와 날씨는 화면이 보내고, 서버는 다시 검사합니다. (D-006)
# 날짜가 5일 안인지는 검사하지 않습니다. 자정을 넘겨 확정해도 받기 위해서입니다. (D-006, T-87)
@router.post("")
def confirm_outfit(body: DiaryIn, session: Session = Depends(get_session)):
    outfit = body.outfit.model_dump()
    check_outfit_or_fail(session, outfit)
    if not MIN_SCORE <= round(body.result.score, 1) <= MAX_SCORE:
        raise ApiError("score_out_of_range", "점수가 0.1~5.0 밖이에요.")
    if body.tag_id is not None and session.get(StyleTag, body.tag_id) is None:
        raise ApiError("tag_not_found", "그 태그를 찾지 못했어요.", 404)
    settings = session.get(Settings, 1)
    if settings is None:
        raise ApiError("no_mannequin", "마네킹 모양을 먼저 골라 주세요.")

    existing = session.exec(select(DiaryEntry).where(DiaryEntry.date == body.day)).first()
    if existing is not None:
        if not body.confirmed:
            return confirm("same_date", date=body.day.isoformat())
        # 바꾸면 그 날짜의 코디는 하나만 남습니다. (PRD §7 확정하기)
        session.delete(existing)
        session.flush()

    entry = DiaryEntry(
        date=body.day,
        **{f"{slot}_id": outfit[slot] for slot in SLOTS},
        # 지금 설정의 마네킹 모양을 복사합니다. 카드 그림을 이 모양으로 그립니다. (DATA-MODEL §6)
        mannequin_gender=settings.mannequin_gender,
        mannequin_height=settings.mannequin_height,
        mannequin_body=settings.mannequin_body,
        weather_region=body.weather.region,
        weather_min_temp=body.weather.min_temp,
        weather_max_temp=body.weather.max_temp,
        weather_condition=body.weather.condition,
        style_tag_id=body.tag_id,
        score=round(body.result.score, 1),
        note_type=body.result.note_type,
        note_summary=body.result.summary,
        note_details={k: v for k, v in body.result.details.items() if k in SLOTS},
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return ok({"id": entry.id, "date": entry.date.isoformat(), "weather": body.weather.model_dump()})
